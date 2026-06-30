import { Annotation } from '@langchain/langgraph';
import type {
  DecisionCandidate,
  DiscussionBrief,
  DiscussionTerminalReason,
  DiscussionType,
  Inconsistency,
  Issue,
  ParticipantStat,
  TurnEntry,
} from './discussion.types';

export function mergeById<T extends { id: string }>(existing: T[], incoming: T[]): T[] {
  const map = new Map(existing.map((e) => [e.id, e]));
  for (const item of incoming) {
    map.set(item.id, item);
  }
  return Array.from(map.values());
}

export function mergeIssues(existing: Issue[], incoming: Issue[]): Issue[] {
  const map = new Map(existing.map((issue) => [issue.id, issue]));
  for (const item of incoming) {
    const prev = map.get(item.id);
    if (!prev) {
      map.set(item.id, { ...item, revisits: item.revisits ?? 0 });
      continue;
    }

    const touchedAgain = item.lastTouchedTurn > prev.lastTouchedTurn;
    map.set(item.id, {
      ...prev,
      ...item,
      revisits: touchedAgain
        ? Math.max(item.revisits ?? 0, prev.revisits + 1)
        : Math.max(item.revisits ?? 0, prev.revisits),
    });
  }
  return Array.from(map.values());
}

export function mergeStats(
  existing: Record<string, ParticipantStat>,
  incoming: Record<string, ParticipantStat>,
): Record<string, ParticipantStat> {
  const result = { ...existing };
  for (const [id, stat] of Object.entries(incoming)) {
    const prev = result[id] ?? { turns: 0, newClaims: 0, repeatClaims: 0 };
    result[id] = {
      turns: prev.turns + stat.turns,
      newClaims: prev.newClaims + stat.newClaims,
      repeatClaims: prev.repeatClaims + stat.repeatClaims,
    };
  }
  return result;
}

export const DiscussionState = Annotation.Root({
  turn: Annotation<number>({ reducer: (_, b) => b, default: () => 0 }),
  turnLog: Annotation<TurnEntry[]>({
    reducer: (a, b) => [...a, ...b],
    default: () => [],
  }),
  aborted: Annotation<boolean>({ reducer: (_, b) => b, default: () => false }),
  nextSpeakerId: Annotation<string | null>({ reducer: (_, b) => b, default: () => null }),
  historySummary: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
  summarizedUntilTurn: Annotation<number>({ reducer: (_, b) => b, default: () => 0 }),
  brief: Annotation<DiscussionBrief | null>({ reducer: (_, b) => b, default: () => null }),
  discussionType: Annotation<DiscussionType>({ reducer: (_, b) => b, default: () => 'brainstorm' }),
  outputContract: Annotation<string[]>({ reducer: (_, b) => b, default: () => [] }),
  options: Annotation<string[]>({ reducer: (_, b) => b, default: () => [] }),
  issues: Annotation<Issue[]>({
    reducer: mergeIssues,
    default: () => [],
  }),
  inconsistencies: Annotation<Inconsistency[]>({
    reducer: mergeById,
    default: () => [],
  }),
  participantStats: Annotation<Record<string, ParticipantStat>>({
    reducer: mergeStats,
    default: () => ({}),
  }),
  decisionCandidate: Annotation<DecisionCandidate | null>({ reducer: (_, b) => b, default: () => null }),
  droughtCount: Annotation<number>({ reducer: (_, b) => b, default: () => 0 }),
  barrenStreak: Annotation<number>({ reducer: (_, b) => b, default: () => 0 }),
  terminalReason: Annotation<DiscussionTerminalReason | null>({ reducer: (_, b) => b, default: () => null }),
});

export type DiscussionStateType = typeof DiscussionState.State;
