import type { DiscussionStateType } from './discussion-state';
import type { DecisionCandidate, DiscussionType, Inconsistency, RoomAgentSpec } from './discussion.types';
import { unresolvedInconsistencies } from './discussion.types';
import { DISCUSSION_LIMITS } from './discussion-limits';
import { insufficientParticipation } from './discussion-quality';
import { eligibleAgentIds, eligibleAgents } from './discussion-brief';

export function shouldConverge(
  state: DiscussionStateType,
  maxTurns: number,
  initialTurn: number = 0,
  agents: RoomAgentSpec[] = [],
): boolean {
  const hasNewTurns = state.turn > initialTurn;
  if (hasNewTurns && state.turn >= maxTurns) return true;

  if (hasSaturatedDraftableConclusion(state, agents, initialTurn)) return true;

  if (hasActionableConclusion(state, agents, initialTurn)) return true;

  if (state.droughtCount >= DISCUSSION_LIMITS.droughtThreshold) return true;

  const hasVibrating = state.issues.some(
    (i) => i.revisits >= DISCUSSION_LIMITS.vibrationThreshold,
  );
  if (hasVibrating) return true;

  return false;
}

export function hasActionableConclusion(
  state: DiscussionStateType,
  agents: RoomAgentSpec[] = [],
  initialTurn: number = 0,
): boolean {
  if (state.turn <= initialTurn) return false;
  if (!firstPassComplete(state, agents, initialTurn)) return false;
  if (insufficientParticipation(state, agents)) return false;
  if (!conclusionDraftable(state.discussionType, state.decisionCandidate, state.inconsistencies)) return false;

  return contractSatisfied(state.discussionType, state.decisionCandidate, state.inconsistencies) ||
    conclusionDraftable(state.discussionType, state.decisionCandidate, state.inconsistencies);
}

export function hasSaturatedDraftableConclusion(
  state: DiscussionStateType,
  agents: RoomAgentSpec[] = [],
  initialTurn: number = 0,
): boolean {
  if (state.turn <= initialTurn) return false;
  if (!firstPassComplete(state, agents, initialTurn)) return false;
  if (insufficientParticipation(state, agents)) return false;
  if (!conclusionDraftable(state.discussionType, state.decisionCandidate, state.inconsistencies)) return false;
  if (state.droughtCount < recentDroughtThreshold(agents, state)) return false;

  const participantIds = agents.length > 0
    ? eligibleAgentIds(agents, state.brief)
    : Object.keys(state.participantStats);
  if (participantIds.length === 0) return false;

  return participantIds.every((agentId) => {
    const stat = state.participantStats[agentId];
    return !!stat && stat.turns > 1 && stat.repeatClaims > stat.newClaims;
  });
}

export function conclusionDraftable(
  type: DiscussionType,
  candidate: DecisionCandidate | null,
  inconsistencies: Inconsistency[] = [],
): boolean {
  if (unresolvedInconsistencies(inconsistencies).length > 0) return false;
  if (!candidate?.recommendation.trim()) return false;
  if (type === 'decision') {
    return candidate.conditions.length > 0 && candidate.verification.length > 0;
  }
  if (type === 'risk_check') {
    return candidate.risks.length > 0 || candidate.verification.length > 0;
  }
  return true;
}

export function convergePressure(state: DiscussionStateType, maxTurns: number, initialTurn: number = 0): string {
  const span = maxTurns - initialTurn;
  if (span > 0) {
    const progress = (state.turn - initialTurn) / span;
    if (progress >= DISCUSSION_LIMITS.lateStageRatio) {
      return '토론이 후반부에 접어들었습니다. 곁가지 주제를 자제하고 결론을 향해 수렴하세요.';
    }
  }
  return '';
}

export function computeMaxTurns(participantCount: number, initialTurn: number): number {
  const factor = DISCUSSION_LIMITS.maxTurnFactor;
  return initialTurn + Math.max(participantCount * factor, factor);
}

export function contractSatisfied(
  type: DiscussionType,
  candidate: DecisionCandidate | null,
  inconsistencies: Inconsistency[] = [],
): boolean {
  if (unresolvedInconsistencies(inconsistencies).length > 0) return false;
  if (!candidate || !candidate.recommendation.trim()) return false;
  if (!candidate.isCommitted) return false;
  if (type === 'decision') {
    return candidate.conditions.length > 0 && candidate.verification.length > 0;
  }
  return true;
}

function firstPassComplete(
  state: DiscussionStateType,
  agents: RoomAgentSpec[],
  initialTurn: number,
): boolean {
  const eligible = eligibleAgents(agents, state.brief);
  if (eligible.length === 0) return true;
  return state.turn >= initialTurn + eligible.length;
}

function recentDroughtThreshold(agents: RoomAgentSpec[], state?: DiscussionStateType): number {
  const count = state ? eligibleAgents(agents, state.brief).length : agents.length;
  if (count === 0) return DISCUSSION_LIMITS.droughtThreshold;
  return Math.min(DISCUSSION_LIMITS.droughtThreshold, Math.max(1, count));
}
