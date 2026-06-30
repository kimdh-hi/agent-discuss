import { Injectable, Logger } from '@nestjs/common';
import { Command } from '@langchain/langgraph';
import { DiscussionState } from './discussion-state';
import { SpeakerSelectorService } from './speaker-selector.service';
import { ConvergencePolicyService } from './convergence-policy.service';
import { RunContext, SpeakerChoice, isAborted, abortCommand } from './run-context';
import { DISCUSSION_LIMITS } from './discussion-limits';

@Injectable()
export class RoutingService {
  private readonly logger = new Logger(RoutingService.name);

  constructor(
    private readonly selector: SpeakerSelectorService,
    private readonly convergence: ConvergencePolicyService,
  ) {}

  async moderate(state: DiscussionState, ctx: RunContext): Promise<Command> {
    if (isAborted(ctx, state)) {
      this.logger.log('[moderate] abort detected — stopping');
      return abortCommand();
    }

    if (state.converging) return new Command({ goto: 'draftConclusion' });

    if (this.convergence.shouldConverge(state, ctx.maxTurns, ctx.initialTurn)) {
      this.logger.log('[moderate] converge trigger met — drafting conclusion');
      this.emitConvergeStatus(ctx, state.turn);
      return new Command({ goto: 'draftConclusion', update: { converging: true } });
    }

    const picked = await this.selector.select(state, ctx);
    if (!picked.agent || picked.converge) {
      this.emitConvergeStatus(ctx, state.turn);
      return new Command({ goto: 'draftConclusion', update: { converging: true } });
    }

    return this.speakCommand(picked);
  }

  async reviewConclusion(state: DiscussionState, ctx: RunContext): Promise<Command> {
    const satisfied = this.convergence.contractSatisfied(state.discussionType, state.decisionCandidate);

    if (satisfied || state.resolveRetries >= DISCUSSION_LIMITS.resolveRetryCap) {
      this.logger.log(`[reviewConclusion] ${satisfied ? 'contract satisfied' : 'resolve retry cap reached'} — finalizing`);
      return new Command({ goto: 'writeResult' });
    }

    this.logger.log('[reviewConclusion] contract not met — one more reinforcement turn');
    ctx.events.next({ type: 'status', phase: 'checkCompletion', round: state.turn, detail: '결론 보강 위해 1턴 더 진행' });

    const picked = await this.selector.select(state, ctx);
    if (!picked.agent || picked.converge) {
      return new Command({ goto: 'writeResult' });
    }

    return this.speakCommand(picked, { resolveRetries: state.resolveRetries + 1 });
  }

  private speakCommand(picked: SpeakerChoice, extra: Partial<DiscussionState> = {}): Command {
    return new Command({
      goto: 'speak',
      update: { nextSpeakerId: picked.agent!.id, yieldStreak: picked.yieldStreak, ...extra },
    });
  }

  private emitConvergeStatus(ctx: RunContext, turn: number): void {
    ctx.events.next({ type: 'status', phase: 'draftDecision', round: turn, detail: '쟁점 해소 중' });
  }
}
