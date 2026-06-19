import { Annotation } from '@langchain/langgraph';
import {
  DecisionCandidate,
  DiscussionType,
  Inconsistency,
  Issue,
  ParticipantStat,
  TurnEntry,
} from './orchestrator.types';

const replace = <T>() => ({ reducer: (_a: T, b: T) => b });

function mergeById<T extends { id: string }>(current: T[], incoming: T[]): T[] {
  if (incoming.length === 0) return current;
  const byId = new Map(current.map((item) => [item.id, item]));
  for (const item of incoming) {
    byId.set(item.id, item);
  }
  return [...byId.values()];
}

function mergeStats(
  current: Record<string, ParticipantStat>,
  incoming: Record<string, ParticipantStat>,
): Record<string, ParticipantStat> {
  if (Object.keys(incoming).length === 0) return current;
  const merged: Record<string, ParticipantStat> = { ...current };
  for (const [id, stat] of Object.entries(incoming)) {
    const prev = merged[id] ?? { turns: 0, newClaims: 0, repeatClaims: 0 };
    merged[id] = {
      turns: prev.turns + stat.turns,
      newClaims: prev.newClaims + stat.newClaims,
      repeatClaims: prev.repeatClaims + stat.repeatClaims,
    };
  }
  return merged;
}

export const DiscussionState = Annotation.Root({
  turn: Annotation<number>({ ...replace<number>(), default: () => 0 }),
  turnLog: Annotation<TurnEntry[]>({ reducer: (a, b) => a.concat(b), default: () => [] }),
  aborted: Annotation<boolean>({ ...replace<boolean>(), default: () => false }),
  nextSpeakerId: Annotation<string | null>({ ...replace<string | null>(), default: () => null }),
  pendingYield: Annotation<string | null>({ ...replace<string | null>(), default: () => null }),
  yieldStreak: Annotation<number>({ ...replace<number>(), default: () => 0 }),
  lastDone: Annotation<boolean>({ ...replace<boolean>(), default: () => false }),
  historySummary: Annotation<string>({ ...replace<string>(), default: () => '' }),
  summarizedUntilTurn: Annotation<number>({ ...replace<number>(), default: () => 0 }),
  discussionType: Annotation<DiscussionType>({ ...replace<DiscussionType>(), default: () => 'decision' }),
  outputContract: Annotation<string[]>({ ...replace<string[]>(), default: () => [] }),
  options: Annotation<string[]>({ ...replace<string[]>(), default: () => [] }),
  issues: Annotation<Issue[]>({ reducer: mergeById, default: () => [] }),
  inconsistencies: Annotation<Inconsistency[]>({ reducer: mergeById, default: () => [] }),
  participantStats: Annotation<Record<string, ParticipantStat>>({ reducer: mergeStats, default: () => ({}) }),
  converging: Annotation<boolean>({ ...replace<boolean>(), default: () => false }),
  decisionCandidate: Annotation<DecisionCandidate | null>({
    ...replace<DecisionCandidate | null>(),
    default: () => null,
  }),
  droughtCount: Annotation<number>({ ...replace<number>(), default: () => 0 }),
  resolveRetries: Annotation<number>({ ...replace<number>(), default: () => 0 }),
});

export type DiscussionState = typeof DiscussionState.State;

export function lastSpeakerId(turnLog: TurnEntry[]): string | null {
  for (let i = turnLog.length - 1; i >= 0; i--) {
    const entry = turnLog[i];
    if (entry.role === 'agent' && entry.agentId) return entry.agentId;
  }
  return null;
}
