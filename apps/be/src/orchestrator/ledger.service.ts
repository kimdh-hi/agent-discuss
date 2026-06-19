import { Injectable, Logger } from '@nestjs/common';
import { DiscussionState } from './discussion-state';
import { ModeratorService } from './moderator.service';
import { RunContext } from './run-context';
import { Issue } from './orchestrator.types';
import { entriesNeedingSummary, lastSummarizedTurn } from './discussion-context';

@Injectable()
export class LedgerService {
  private readonly logger = new Logger(LedgerService.name);

  constructor(private readonly moderator: ModeratorService) {}

  async updateIssues(state: DiscussionState, ctx: RunContext): Promise<Partial<DiscussionState>> {
    const latest = state.turnLog.at(-1);
    if (!latest || latest.role !== 'agent' || !latest.agentId) return {};

    const role = ctx.agents.find((a) => a.id === latest.agentId)?.description;
    let newClaims = 0;
    let repeatClaims = 0;
    const update: Partial<DiscussionState> = {};

    try {
      const extraction = await this.moderator.updateIssues(
        ctx.topic,
        state.issues,
        state.decisionCandidate,
        latest,
        role,
        state.inconsistencies,
      );
      newClaims = extraction.newClaims;
      repeatClaims = extraction.repeatClaims;
      if (extraction.issues.length > 0) {
        const prevById = new Map(state.issues.map((i) => [i.id, i]));
        update.issues = extraction.issues.map((i) => ({ ...i, revisits: bumpRevisits(prevById.get(i.id)) }));
      }
      if (extraction.decisionCandidate) update.decisionCandidate = extraction.decisionCandidate;
      if (extraction.inconsistencies.length > 0) update.inconsistencies = extraction.inconsistencies;
    } catch (err) {
      this.logger.error(`[updateIssues] issue extraction failed — continuing: ${(err as Error).message}`);
      newClaims = 1;
    }

    update.participantStats = { [latest.agentId]: { turns: 1, newClaims, repeatClaims } };
    update.droughtCount = newClaims > 0 ? 0 : state.droughtCount + 1;
    return update;
  }

  async compactHistory(state: DiscussionState, ctx: RunContext): Promise<Partial<DiscussionState>> {
    const entries = entriesNeedingSummary(state);
    if (entries.length === 0) return {};

    try {
      const historySummary = await this.moderator.summarizeHistory(ctx.topic, state.historySummary, entries);
      const summarizedUntilTurn = lastSummarizedTurn(entries, state.summarizedUntilTurn);
      this.logger.log(`[compactHistory] up to T${summarizedUntilTurn}`);
      return { historySummary, summarizedUntilTurn };
    } catch (err) {
      this.logger.error(`[compactHistory] failed — keeping previous summary: ${(err as Error).message}`);
      return {};
    }
  }
}

function bumpRevisits(previous?: Issue): number {
  return (previous?.revisits ?? -1) + 1;
}
