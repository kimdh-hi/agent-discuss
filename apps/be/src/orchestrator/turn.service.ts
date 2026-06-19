import { Injectable, Logger } from '@nestjs/common';
import { Command } from '@langchain/langgraph';
import { RagService } from '../rag/rag.service';
import { buildToolsForAgent } from './agent-tools';
import { DiscussionState } from './discussion-state';
import { SpeakerService } from './speaker.service';
import { ConvergencePolicyService } from './convergence-policy.service';
import { RunContext, isAborted, abortCommand } from './run-context';
import { openIssues, unresolvedInconsistencies } from './orchestrator.types';
import { prompts, renderInconsistencies, renderIssues } from './prompts';
import { buildDiscussionContext } from './discussion-context';

@Injectable()
export class TurnService {
  private readonly logger = new Logger(TurnService.name);

  constructor(
    private readonly speaker: SpeakerService,
    private readonly rag: RagService,
    private readonly convergence: ConvergencePolicyService,
  ) {}

  async speak(state: DiscussionState, ctx: RunContext): Promise<Command> {
    if (isAborted(ctx, state)) return abortCommand();

    const agent = ctx.agents.find((a) => a.id === state.nextSpeakerId);
    if (!agent) {
      this.logger.warn(`[speak] unknown speaker (${state.nextSpeakerId}) — converging`);
      return new Command({ goto: 'updateIssues', update: { converging: true } });
    }

    const turn = state.turn + 1;
    const history = buildDiscussionContext(state).text;
    const open = openIssues(state.issues);
    const openInconsistencies = unresolvedInconsistencies(state.inconsistencies);
    this.logger.log(`[speak] T${turn} "${agent.name}" speaking`);
    const { content, yieldTo, done } = await this.speaker.speak(
      ctx.events,
      { role: 'agent', agentId: agent.id, agentName: agent.name, round: turn },
      prompts.agent(
        ctx.topic,
        agent,
        ctx.agents,
        history,
        open.length ? renderIssues(open) : '',
        openInconsistencies.length ? renderInconsistencies(openInconsistencies) : '',
        state.decisionCandidate,
        this.convergence.convergePressure(state, ctx.maxTurns, ctx.initialTurn),
      ),
      {
        model: agent.model,
        tools: buildToolsForAgent(agent, this.rag),
        maxToolIterations: agent.maxToolIterations,
      },
    );

    return new Command({
      goto: 'updateIssues',
      update: {
        turnLog: [{ role: 'agent', agentId: agent.id, agentName: agent.name, round: turn, content }],
        turn,
        pendingYield: yieldTo,
        lastDone: done,
      },
    });
  }
}
