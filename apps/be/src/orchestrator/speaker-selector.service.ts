import { Injectable, Logger } from '@nestjs/common';
import { DiscussionState, lastSpeakerId } from './discussion-state';
import { ConvergencePolicyService } from './convergence-policy.service';
import { ModeratorService } from './moderator.service';
import { RunContext, SpeakerChoice } from './run-context';
import { DISCUSSION_LIMITS } from './discussion-limits';
import { buildDiscussionContext } from './discussion-context';
import { openIssues, RoomAgentSpec } from './orchestrator.types';

@Injectable()
export class SpeakerSelectorService {
  private readonly logger = new Logger(SpeakerSelectorService.name);

  constructor(
    private readonly moderator: ModeratorService,
    private readonly convergence: ConvergencePolicyService,
  ) {}

  async select(state: DiscussionState, ctx: RunContext): Promise<SpeakerChoice> {
    const firstPass = this.firstPassPick(state, ctx.agents, ctx.initialTurn);
    if (firstPass) {
      this.emitNominate(ctx, firstPass, state.turn, '초반 핵심 역할 배치');
      return { agent: firstPass, yieldStreak: 0, converge: false };
    }

    const lastSpeaker = lastSpeakerId(state.turnLog);
    const target = this.passTurnTarget(state, ctx.agents, lastSpeaker);
    if (target) {
      this.logger.log(`[selectSpeaker] yield → "${target.name}" (streak ${state.yieldStreak + 1})`);
      this.emitNominate(ctx, target, state.turn, 'yield');
      return { agent: target, yieldStreak: state.yieldStreak + 1, converge: false };
    }

    return this.directorPick(state, ctx);
  }

  private firstPassPick(
    state: DiscussionState,
    agents: RoomAgentSpec[],
    initialTurn: number,
  ): RoomAgentSpec | null {
    const firstPassEnd = initialTurn + agents.length;
    if (state.converging || state.turn >= firstPassEnd) return null;
    const spoken = new Set(state.turnLog.filter((t) => t.agentId).map((t) => t.agentId));
    return agents.find((a) => !spoken.has(a.id)) ?? null;
  }

  private async directorPick(state: DiscussionState, ctx: RunContext): Promise<SpeakerChoice> {
    const hasNewTurns = state.turn > ctx.initialTurn;
    const routeOptions = state.discussionType === 'brainstorm' ? [] : state.options;
    const decision = await this.moderator.pickSpeaker(
      ctx.topic,
      buildDiscussionContext(state).text,
      state.turnLog,
      ctx.agents,
      state.lastDone,
      state.issues,
      routeOptions,
      state.decisionCandidate,
      this.convergence.convergePressure(state, ctx.maxTurns, ctx.initialTurn),
    );

    const wantsEnd = decision.done || !decision.next;
    if (wantsEnd && hasNewTurns) {
      this.logger.log(`[directorPick] director signals done${decision.reason ? ` (${decision.reason})` : ''}`);
      return { agent: null, yieldStreak: 0, converge: true };
    }

    const nextId = wantsEnd ? decision.next ?? ctx.agents[0]?.id ?? null : decision.next;
    const agent = ctx.agents.find((a) => a.id === nextId);
    if (!agent) return { agent: null, yieldStreak: 0, converge: true };
    this.emitNominate(ctx, agent, state.turn, decision.reason);
    return { agent, yieldStreak: 0, converge: false };
  }

  private passTurnTarget(
    state: DiscussionState,
    agents: RoomAgentSpec[],
    lastSpeaker: string | null,
  ): RoomAgentSpec | null {
    const yieldId = state.pendingYield;
    if (!yieldId || yieldId === lastSpeaker) return null;
    if (state.yieldStreak >= DISCUSSION_LIMITS.maxConsecutiveYields) return null;
    const stillProductive =
      openIssues(state.issues).length === 0 || !this.repeatsOpenIssue(yieldId, state);
    if (!stillProductive) return null;
    return agents.find((a) => a.id === yieldId) ?? null;
  }

  private repeatsOpenIssue(agentId: string | null, state: DiscussionState): boolean {
    if (!agentId) return false;
    const stat = state.participantStats[agentId];
    return !!stat && stat.repeatClaims > stat.newClaims;
  }

  private emitNominate(ctx: RunContext, agent: RoomAgentSpec, turn: number, reason?: string): void {
    this.logger.log(`[moderate] nominate → "${agent.name}"`);
    ctx.events.next({
      type: 'status',
      phase: 'pickSpeaker',
      round: turn + 1,
      detail: `다음 발언: ${agent.name}${reason ? ` — ${reason}` : ''}`,
    });
  }
}
