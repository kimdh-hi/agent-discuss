import { Injectable, Logger } from '@nestjs/common';
import { ReplaySubject } from 'rxjs';
import { StateGraph, START, END } from '@langchain/langgraph';
import { DiscussionRunOptions, RoomAgentSpec, RoomEvent, TurnEntry } from './orchestrator.types';
import { DiscussionState } from './discussion-state';
import { RunContext } from './run-context';
import { DISCUSSION_LIMITS, graphRecursionLimit } from './discussion-limits';
import { TopicSetupService } from './topic-setup.service';
import { RoutingService } from './routing.service';
import { TurnService } from './turn.service';
import { LedgerService } from './ledger.service';
import { ConclusionWriterService } from './conclusion-writer.service';

@Injectable()
export class OrchestratorService {
  private readonly logger = new Logger(OrchestratorService.name);

  constructor(
    private readonly setup: TopicSetupService,
    private readonly routing: RoutingService,
    private readonly turn: TurnService,
    private readonly ledger: LedgerService,
    private readonly conclusion: ConclusionWriterService,
  ) {}

  run(topic: string, agents: RoomAgentSpec[], options: DiscussionRunOptions = {}): {
    events: ReplaySubject<RoomEvent>;
    turnLog: Promise<TurnEntry[]>;
  } {
    this.logger.log(`[discuss] start — topic: "${topic}", agents: [${agents.map((a) => a.name).join(', ')}]`);
    const events = new ReplaySubject<RoomEvent>();
    const turnLog = this.execute(topic, agents, events, options);
    return { events, turnLog };
  }

  private async execute(
    topic: string,
    agents: RoomAgentSpec[],
    events: ReplaySubject<RoomEvent>,
    options: DiscussionRunOptions,
  ): Promise<TurnEntry[]> {
    const initialTurnLog = options.initialTurnLog ?? [];
    const initialTurn =
      options.initialTurn ??
      initialTurnLog.reduce((max, entry) => Math.max(max, entry.round), 0);
    const maxTurns =
      initialTurn + Math.max(agents.length * DISCUSSION_LIMITS.maxTurnFactor, DISCUSSION_LIMITS.maxTurnFactor);
    const skipGate = options.skipGate ?? false;

    const ctx: RunContext = { topic, agents, events, maxTurns, initialTurn, signal: options.signal };
    const graph = this.buildGraph(ctx, skipGate);

    try {
      const result = await graph.invoke(
        {
          turnLog: initialTurnLog,
          turn: initialTurn,
          historySummary: options.historySummary ?? '',
          summarizedUntilTurn: initialTurn,
        },
        { recursionLimit: graphRecursionLimit(maxTurns) },
      );
      events.next({ type: 'done' });
      events.complete();
      return result.turnLog;
    } catch (err) {
      this.logger.error(`[discuss] graph execution failed: ${(err as Error).message}`, (err as Error).stack);
      events.next({ type: 'error', message: (err as Error).message });
      events.complete();
      throw err;
    }
  }

  private buildGraph(ctx: RunContext, skipGate: boolean) {
    return new StateGraph(DiscussionState)
      .addNode('validateTopic', (s: DiscussionState) => this.setup.validateTopic(s, ctx, skipGate), { ends: ['defineAgenda', 'rejectTopic'] })
      .addNode('rejectTopic', () => this.setup.rejectTopic(ctx))
      .addNode('defineAgenda', (s: DiscussionState) => this.setup.defineAgenda(s, ctx))
      .addNode('moderate', (s: DiscussionState) => this.routing.moderate(s, ctx), { ends: ['speak', 'draftConclusion', END] })
      .addNode('speak', (s: DiscussionState) => this.turn.speak(s, ctx), { ends: ['updateIssues', END] })
      .addNode('updateIssues', (s: DiscussionState) => this.ledger.updateIssues(s, ctx))
      .addNode('compactHistory', (s: DiscussionState) => this.ledger.compactHistory(s, ctx))
      .addNode('draftConclusion', (s: DiscussionState) => this.conclusion.draftConclusion(s, ctx))
      .addNode('reviewConclusion', (s: DiscussionState) => this.routing.reviewConclusion(s, ctx), { ends: ['writeResult', 'speak'] })
      .addNode('writeResult', (s: DiscussionState) => this.conclusion.writeResult(s, ctx))
      .addEdge(START, 'validateTopic')
      .addEdge('rejectTopic', END)
      .addEdge('defineAgenda', 'moderate')
      .addEdge('updateIssues', 'compactHistory')
      .addEdge('compactHistory', 'moderate')
      .addEdge('draftConclusion', 'reviewConclusion')
      .addEdge('writeResult', END)
      .compile();
  }
}
