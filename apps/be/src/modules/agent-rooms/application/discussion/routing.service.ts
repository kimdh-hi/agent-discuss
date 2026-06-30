import { Injectable } from '@nestjs/common';
import { Command } from '@langchain/langgraph';
import type { DiscussionStateType } from './discussion-state';
import type { RunContext } from './run-context';
import type { ModerationResult } from './moderator';
import type { RoomAgentSpec } from './discussion.types';
import {
  shouldConverge,
  convergePressure,
  hasSaturatedDraftableConclusion,
} from './convergence-policy';
import {
  coreRoundRobinPick,
  firstPassPick,
  hasStalledRepetition,
  nextProductivePick,
  selectNextSpeaker,
} from './speaker-selector.service';
import { pickSpeaker } from './moderator';
import { isAborted, abortCommand } from './run-context';
import { lastSpeakerId } from './turn-log';
import { firstPassQualityReason } from './discussion-quality';
import { eligibleAgents } from './discussion-brief';

@Injectable()
export class RoutingService {
  async moderate(state: DiscussionStateType, ctx: RunContext): Promise<Command> {
    if (isAborted(ctx, state)) return abortCommand();

    ctx.events.next({ type: 'status', phase: 'moderating', round: state.turn });

    if (state.terminalReason) return new Command({ goto: 'finalizeIfReady' });

    const qualityReason = firstPassQualityReason(state, ctx.agents, ctx.initialTurn);
    if (qualityReason) {
      return new Command({
        goto: 'finalizeIfReady',
        update: { terminalReason: qualityReason },
      });
    }

    const firstPass = firstPassPick(state, ctx.agents, ctx.initialTurn);
    if (firstPass) {
      return new Command({ goto: 'speak', update: { nextSpeakerId: firstPass } });
    }

    if (state.turn > ctx.initialTurn && state.turn >= ctx.maxTurns) {
      return new Command({ goto: 'finalizeIfReady' });
    }

    const productive = nextProductivePick(state, ctx.agents, ctx.initialTurn);
    if (productive) {
      return new Command({ goto: 'speak', update: { nextSpeakerId: productive } });
    }

    if (shouldConverge(state, ctx.maxTurns, ctx.initialTurn, ctx.agents)) {
      return new Command({ goto: 'finalizeIfReady' });
    }

    let directorResult: ModerationResult | null = null;
    if (this.needsDirector(state, ctx.agents, ctx.initialTurn)) {
      directorResult = await pickSpeaker(
        ctx.topic,
        state,
        ctx.agents,
        ctx.llm,
        ctx.config,
        ctx.keepTurns,
        convergePressure(state, ctx.maxTurns, ctx.initialTurn),
      );
      if (directorResult.next) {
        const nominated = ctx.agents.find((a) => a.id === directorResult!.next);
        if (nominated) {
          ctx.events.next({
            type: 'status',
            phase: 'pickSpeaker',
            round: state.turn + 1,
            detail: `다음 발언: ${nominated.name}${directorResult.reason ? ` — ${directorResult.reason}` : ''}`,
          });
        }
      }
    }

    return this.route(state, ctx.agents, ctx.initialTurn, directorResult);
  }

  needsDirector(
    state: DiscussionStateType,
    agents: RoomAgentSpec[],
    initialTurn: number,
  ): boolean {
    return (
      !firstPassPick(state, agents, initialTurn) &&
      !nextProductivePick(state, agents, initialTurn) &&
      !hasSaturatedDraftableConclusion(state, agents, initialTurn) &&
      !hasStalledRepetition(state, agents)
    );
  }

  route(
    state: DiscussionStateType,
    agents: RoomAgentSpec[],
    initialTurn: number,
    directorResult: ModerationResult | null,
  ): Command {
    const firstPass = firstPassPick(state, agents, initialTurn);
    if (firstPass) {
      return new Command({
        goto: 'speak',
        update: { nextSpeakerId: firstPass },
      });
    }

    if (directorResult && (directorResult.done || directorResult.next === null)) {
      if (state.turn === 0) {
        const fallback = coreRoundRobinPick(agents, state, lastSpeakerId(state.turnLog));
        if (fallback) {
          return new Command({
            goto: 'speak',
            update: { nextSpeakerId: fallback },
          });
        }
      }
      return new Command({ goto: 'finalizeIfReady' });
    }

    const productive = nextProductivePick(state, agents, initialTurn);
    if (productive) {
      return new Command({
        goto: 'speak',
        update: { nextSpeakerId: productive },
      });
    }

    if (hasSaturatedDraftableConclusion(state, agents, initialTurn)) {
      return new Command({ goto: 'finalizeIfReady' });
    }

    if (directorResult?.next) {
      const guarded = selectNextSpeaker(state, agents, initialTurn, directorResult.next);
      if (guarded) {
        return new Command({
          goto: 'speak',
          update: { nextSpeakerId: guarded },
        });
      }
    }

    if (eligibleAgents(agents, state.brief).length === 0) {
      return new Command({ goto: '__end__' });
    }

    return new Command({
      goto: 'finalizeIfReady',
      update: {
        terminalReason: hasStalledRepetition(state, agents) ? 'stalled_repetition' : state.terminalReason,
      },
    });
  }
}
