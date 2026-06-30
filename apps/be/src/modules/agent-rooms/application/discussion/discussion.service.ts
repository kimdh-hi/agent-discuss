import { Inject, Injectable, Logger } from '@nestjs/common';
import { END, START, StateGraph } from '@langchain/langgraph';
import { ReplaySubject } from 'rxjs';
import type { RoomAgentSpec, RoomEvent, TurnEntry, DiscussionSnapshot, DiscussionRunOptions } from './discussion.types';
import type { RunContext } from './run-context';
import type { RagService } from '../../../rag/application/rag.service';
import type { LlmService } from '../../../../common/ai/llm/llm.service';
import { DiscussionState } from './discussion-state';
import type { DiscussionStateType } from './discussion-state';
import { DISCUSSION_CONFIG, type DiscussionConfig, utilityModelForGroup } from './discussion-config';
import { TurnService } from './turn.service';
import { RoutingService } from './routing.service';
import { validateTopic, rejectTopic, defineAgenda } from './topic-setup';
import { ConclusionWriterService } from './conclusion-writer.service';
import { computeMaxTurns } from './convergence-policy';
import { DISCUSSION_LIMITS, graphRecursionLimit, computeKeepTurns } from './discussion-limits';
import { agentTurnCount, fallbackSnapshot, initialGraphState, snapshotFromGraphResult } from './discussion-run-state';

@Injectable()
export class DiscussionService {
  private readonly logger = new Logger(DiscussionService.name);

  constructor(
    @Inject(DISCUSSION_CONFIG)
    private readonly discussionConfig: DiscussionConfig,
    private readonly turnService: TurnService,
    private readonly routingService: RoutingService,
    private readonly conclusionWriterService: ConclusionWriterService,
  ) {}

  async run(
    topic: string,
    agents: RoomAgentSpec[],
    options: DiscussionRunOptions & {
      llm: LlmService;
      ragService: RagService;
    },
  ): Promise<{
    subject: ReplaySubject<RoomEvent>;
    completion: Promise<{ turnLog: TurnEntry[]; snapshot: DiscussionSnapshot }>;
  }> {
    const signal = options.signal ?? new AbortController().signal;
    const subject = new ReplaySubject<RoomEvent>(DISCUSSION_LIMITS.eventReplayBuffer);

    const initialTurnLog = options.initialTurnLog ?? [];
    const snap = options.initialSnapshot;
    const initialTurn = snap?.turn ?? options.initialTurn ?? agentTurnCount(initialTurnLog);
    const maxTurns = computeMaxTurns(agents.length, initialTurn);

    const moderatorModel = utilityModelForGroup(
      agents.map((a) => a.model ?? this.discussionConfig.agentDefaultModel),
    );
    const config: DiscussionConfig = { ...this.discussionConfig, moderatorModel };

    const keepTurns = computeKeepTurns(agents.length);

    const ctx: RunContext = {
      topic,
      agents,
      events: subject,
      signal,
      llm: options.llm,
      ragService: options.ragService,
      config,
      initialTurn,
      skipGate: options.skipGate ?? false,
      maxTurns,
      keepTurns,
    };

    const graph = this.buildGraph(ctx);

    const completion = (async (): Promise<{ turnLog: TurnEntry[]; snapshot: DiscussionSnapshot }> => {
      try {
        subject.next({ type: 'status', phase: 'starting' });
        const initialState = initialGraphState({
          initialTurnLog,
          historySummary: options.historySummary ?? '',
          initialTurn,
          snapshot: snap,
        });
        const result = await graph.invoke(initialState, { recursionLimit: graphRecursionLimit }) as Record<string, unknown>;
        const fullTurnLog = (result['turnLog'] as TurnEntry[]) ?? [];
        const turnLog = fullTurnLog.slice(initialTurnLog.length);
        const snapshot = snapshotFromGraphResult(result);
        return { turnLog, snapshot };
      } catch (err) {
        this.logger.error(`Discussion failed: ${(err as Error).message}`);
        subject.next({ type: 'error', message: (err as Error).message });
        subject.next({ type: 'done' });
        subject.complete();
        return {
          turnLog: [],
          snapshot: fallbackSnapshot({
            snapshot: snap,
            historySummary: options.historySummary ?? '',
            initialTurn,
          }),
        };
      }
    })();

    return { subject, completion };
  }

  private buildGraph(ctx: RunContext) {
    return new StateGraph(DiscussionState)
      .addNode('validateTopic', () => validateTopic(ctx), { ends: ['defineAgenda', 'rejectTopic'] })
      .addNode('rejectTopic', (s: DiscussionStateType) => rejectTopic(s, ctx))
      .addNode('defineAgenda', (s: DiscussionStateType) => defineAgenda(s, ctx))
      .addNode('moderate', (s: DiscussionStateType) => this.routingService.moderate(s, ctx), { ends: ['speak', 'finalizeIfReady', '__end__'] })
      .addNode('speak', (s: DiscussionStateType) => this.turnService.speak(s, ctx), { ends: ['updateIssues', 'moderate', '__end__'] })
      .addNode('updateIssues', (s: DiscussionStateType) => this.turnService.updateIssues(s, ctx))
      .addNode('compactHistory', (s: DiscussionStateType) => this.turnService.compactHistory(s, ctx))
      .addNode('finalizeIfReady', (s: DiscussionStateType) => this.conclusionWriterService.finalizeIfReady(s, ctx), { ends: ['speak', '__end__'] })
      .addEdge(START, 'validateTopic')
      .addEdge('rejectTopic', END)
      .addEdge('defineAgenda', 'moderate')
      .addEdge('updateIssues', 'compactHistory')
      .addEdge('compactHistory', 'moderate')
      .compile();
  }
}
