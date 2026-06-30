import type { RoomAgentSpec } from './discussion.types';
import { openIssues } from './discussion.types';
import type { DiscussionStateType } from './discussion-state';
import { lastSpeakerId } from './turn-log';
import {
  coreFirstAgents,
  eligibleAgents,
  isEligibleAgent,
  rolePlanForAgent,
} from './discussion-brief';
import {
  coreDiscussionCriteria,
  issueTexts,
  matchesAnyCriterion,
} from './discussion-focus';

interface ProductiveCandidate {
  id: string;
  index: number;
  turns: number;
  newClaims: number;
  repeatClaims: number;
  saturated: boolean;
  focusScore: number;
  lastTurnIndex: number;
}

interface SpeakerSelectionOptions {
  allowFirstPass?: boolean;
  allowImmediateRepeat?: boolean;
}

export function firstPassPick(
  state: DiscussionStateType,
  agents: RoomAgentSpec[],
  initialTurn: number,
): string | null {
  const candidates = coreFirstAgents(agents, state.brief);
  if (state.turn >= initialTurn + candidates.length) return null;

  const spokIds = new Set(
    state.turnLog.filter((e) => e.role === 'agent').map((e) => e.agentId),
  );
  const unspoken = candidates.find((a) => !spokIds.has(a.id));
  return unspoken?.id ?? null;
}

export function nextProductivePick(
  state: DiscussionStateType,
  agents: RoomAgentSpec[],
  initialTurn: number,
): string | null {
  const firstPass = firstPassPick(state, agents, initialTurn);
  if (firstPass) return firstPass;
  if (agents.length === 0) return null;

  const last = lastSpeakerId(state.turnLog);
  const candidates = productiveCandidates(state, eligibleAgents(agents, state.brief), last)
    .filter((candidate) => candidate.focusScore > 0)
    .filter((candidate) => !candidate.saturated);
  if (candidates.length === 0) return null;

  return candidates.sort(compareProductiveCandidates)[0]?.id ?? null;
}

export function isSaturatedParticipant(state: DiscussionStateType, agentId: string): boolean {
  const stat = state.participantStats[agentId];
  return !!stat && stat.turns > 1 && stat.repeatClaims > stat.newClaims;
}

export function canAgentAddNewContribution(state: DiscussionStateType, agentId: string): boolean {
  return canAgentAdvanceCoreIssue(state, agentId) && !isSaturatedParticipant(state, agentId);
}

export function selectNextSpeaker(
  state: DiscussionStateType,
  agents: RoomAgentSpec[],
  initialTurn: number,
  nominated: string | null | undefined,
  options: SpeakerSelectionOptions = {},
): string | null {
  if (options.allowFirstPass) {
    const firstPass = firstPassPick(state, agents, initialTurn);
    if (firstPass && (!nominated || nominated === firstPass)) return firstPass;
  }

  if (!nominated) return null;

  const candidate = agents.find((agent) => agent.id === nominated);
  if (!candidate || !isEligibleAgent(state.brief, candidate.id)) return null;

  const pool = eligibleAgents(agents, state.brief);
  const selected = options.allowImmediateRepeat
    ? candidate.id
    : avoidImmediateRepeat(state, pool, candidate.id);

  return canAgentAddNewContribution(state, selected) ? selected : null;
}

export function hasStalledRepetition(state: DiscussionStateType, agents: RoomAgentSpec[]): boolean {
  const participantIds = eligibleAgents(agents, state.brief)
    .map((agent) => agent.id)
    .filter((agentId) => (state.participantStats[agentId]?.turns ?? 0) > 0);
  return participantIds.length > 0 &&
    participantIds.every((agentId) => isSaturatedParticipant(state, agentId));
}

export function roundRobinPick(agents: RoomAgentSpec[], lastId: string | null): string | null {
  if (agents.length === 0) return null;
  if (!lastId) return agents[0]?.id ?? null;
  const idx = agents.findIndex((a) => a.id === lastId);
  if (idx === -1) return agents[0]?.id ?? null;
  for (let i = 1; i < agents.length; i++) {
    const candidate = agents[(idx + i) % agents.length];
    if (candidate && candidate.id !== lastId) return candidate.id;
  }
  return agents[idx]?.id ?? null;
}

export function coreRoundRobinPick(
  agents: RoomAgentSpec[],
  state: DiscussionStateType,
  lastId: string | null,
): string | null {
  return roundRobinPick(coreFirstAgents(agents, state.brief), lastId);
}

export function avoidImmediateRepeat(
  state: DiscussionStateType,
  agents: RoomAgentSpec[],
  nominated: string,
): string {
  const last = lastSpeakerId(state.turnLog);
  if (!last || nominated !== last || agents.length <= 1) return nominated;
  return roundRobinPick(agents, last) ?? nominated;
}

export function canAgentAdvanceCoreIssue(state: DiscussionStateType, agentId: string): boolean {
  return focusScoreForAgent(state, agentId) > 0;
}

function productiveCandidates(
  state: DiscussionStateType,
  agents: RoomAgentSpec[],
  last: string | null,
): ProductiveCandidate[] {
  const lastTurnByAgent = lastTurnByAgentMap(state);
  const avoidLast = agents.length > 1 && !!last;
  const candidates = agents
    .map((agent, index) => productiveCandidate(state, agent, index, lastTurnByAgent))
    .filter((candidate) => !avoidLast || candidate.id !== last);

  return candidates.length > 0
    ? candidates
    : agents.map((agent, index) => productiveCandidate(state, agent, index, lastTurnByAgent));
}

function productiveCandidate(
  state: DiscussionStateType,
  agent: RoomAgentSpec,
  index: number,
  lastTurnByAgent: Map<string, number>,
): ProductiveCandidate {
  const stat = state.participantStats[agent.id] ?? { turns: 0, newClaims: 0, repeatClaims: 0 };
  return {
    id: agent.id,
    index,
    turns: stat.turns,
    newClaims: stat.newClaims,
    repeatClaims: stat.repeatClaims,
    saturated: isSaturatedParticipant(state, agent.id),
    focusScore: focusScoreForAgent(state, agent.id),
    lastTurnIndex: lastTurnByAgent.get(agent.id) ?? -1,
  };
}

function compareProductiveCandidates(a: ProductiveCandidate, b: ProductiveCandidate): number {
  if (a.saturated !== b.saturated) return a.saturated ? 1 : -1;
  if (a.focusScore !== b.focusScore) return b.focusScore - a.focusScore;
  if (a.turns !== b.turns) return a.turns - b.turns;

  const aHasProgress = a.newClaims > 0;
  const bHasProgress = b.newClaims > 0;
  if (aHasProgress !== bHasProgress) return aHasProgress ? -1 : 1;

  const aNetProgress = a.newClaims - a.repeatClaims;
  const bNetProgress = b.newClaims - b.repeatClaims;
  if (aNetProgress !== bNetProgress) return bNetProgress - aNetProgress;
  if (a.lastTurnIndex !== b.lastTurnIndex) return a.lastTurnIndex - b.lastTurnIndex;
  return a.index - b.index;
}

function focusScoreForAgent(state: DiscussionStateType, agentId: string): number {
  if (!state.brief || state.brief.rolePlan.length === 0) return 1;

  const plan = rolePlanForAgent(state.brief, agentId);
  if (!plan || plan.relevance === 'out_of_scope') return 0;
  if (plan.relevance === 'core') return 2;
  if (!hasCoreRole(state) && state.brief.requiredDimensions.length === 0) return 1;

  const criteria = openGapTexts(state);
  if (criteria.length === 0) return 1;
  return matchesAnyCriterion(plan.assignedContribution ?? '', criteria) ? 1 : 0;
}

function openGapTexts(state: DiscussionStateType): string[] {
  return [
    ...coreDiscussionCriteria(state.brief, state.outputContract),
    ...openIssues(state.issues).flatMap(issueTexts),
  ];
}

function hasCoreRole(state: DiscussionStateType): boolean {
  return Boolean(state.brief?.rolePlan.some((plan) => plan.relevance === 'core'));
}

function lastTurnByAgentMap(state: DiscussionStateType): Map<string, number> {
  const result = new Map<string, number>();
  state.turnLog.forEach((entry, index) => {
    if (entry.role === 'agent' && entry.agentId) {
      result.set(entry.agentId, index);
    }
  });
  return result;
}
