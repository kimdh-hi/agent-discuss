import type { DiscussionStateType } from './discussion-state';
import type { RoomAgentSpec, TurnEntry, DiscussionTerminalReason } from './discussion.types';
import { isSubstantiveText } from './substantive';
import { DISCUSSION_LIMITS } from './discussion-limits';
import { eligibleAgents } from './discussion-brief';

export function hasSubstantiveContent(entry: TurnEntry): boolean {
  return isSubstantiveText(entry.content);
}

export function substantiveAgentCount(state: DiscussionStateType): number {
  const agentIds = new Set<string>();

  for (const [agentId, stat] of Object.entries(state.participantStats)) {
    if (stat.newClaims > 0) agentIds.add(agentId);
  }

  for (const entry of state.turnLog) {
    if (entry.role === 'agent' && entry.agentId && hasSubstantiveContent(entry)) {
      agentIds.add(entry.agentId);
    }
  }

  return agentIds.size;
}

function substantiveContentLength(state: DiscussionStateType): number {
  return state.turnLog
    .filter((entry) => entry.role === 'agent' && hasSubstantiveContent(entry))
    .reduce((sum, entry) => sum + entry.content.replace(/\s/g, '').length, 0);
}

export function isThinDiscussion(state: DiscussionStateType): boolean {
  const hasRecommendation = Boolean(state.decisionCandidate?.recommendation.trim());
  const inScopeIssues = state.issues.filter((issue) => issue.status !== 'out_of_scope');
  const hasExtractedClaim = Object.values(state.participantStats).some((stat) => stat.newClaims > 0);
  return !hasRecommendation
    && inScopeIssues.length === 0
    && !hasExtractedClaim
    && substantiveContentLength(state) < DISCUSSION_LIMITS.thinDiscussionContentChars;
}

export function insufficientParticipation(
  state: DiscussionStateType,
  agents: RoomAgentSpec[] = [],
): boolean {
  return eligibleAgents(agents, state.brief).length > 1 && substantiveAgentCount(state) < 2;
}

export function firstPassQualityReason(
  state: DiscussionStateType,
  agents: RoomAgentSpec[],
  initialTurn: number,
): DiscussionTerminalReason | null {
  const eligible = eligibleAgents(agents, state.brief);
  if (state.turn < initialTurn + eligible.length) return null;
  if (isThinDiscussion(state) || insufficientParticipation(state, eligible)) {
    return 'insufficient_first_pass';
  }
  return null;
}
