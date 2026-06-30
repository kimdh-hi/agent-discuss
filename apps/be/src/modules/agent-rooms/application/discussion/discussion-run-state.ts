import type { DiscussionSnapshot, ParticipantStat, TurnEntry } from './discussion.types';
import { isSimilarIdea } from './discussion-progress';

export function initialGraphState(input: {
  initialTurnLog: TurnEntry[];
  historySummary: string;
  initialTurn: number;
  snapshot?: DiscussionSnapshot | null;
}): Record<string, unknown> {
  const { initialTurnLog, historySummary, initialTurn, snapshot } = input;
  const runtimeState = runtimeStateForRun(snapshot, initialTurnLog);
  return {
    turnLog: initialTurnLog,
    historySummary: snapshot?.historySummary ?? historySummary,
    turn: snapshot?.turn ?? initialTurn,
    participantStats: runtimeState.participantStats,
    droughtCount: runtimeState.droughtCount,
    ...(snapshot ? {
      summarizedUntilTurn: snapshot.summarizedUntilTurn,
      brief: snapshot.brief ?? null,
      issues: snapshot.issues,
      inconsistencies: snapshot.inconsistencies,
      decisionCandidate: snapshot.decisionCandidate,
      discussionType: snapshot.discussionType,
      outputContract: snapshot.outputContract,
      options: snapshot.options ?? [],
      terminalReason: snapshot.terminalReason ?? null,
    } : {}),
  };
}

export function snapshotFromGraphResult(result: Record<string, unknown>): DiscussionSnapshot {
  return {
    historySummary: (result['historySummary'] as string) ?? '',
    summarizedUntilTurn: (result['summarizedUntilTurn'] as number) ?? 0,
    brief: (result['brief'] as DiscussionSnapshot['brief']) ?? null,
    issues: (result['issues'] as DiscussionSnapshot['issues']) ?? [],
    inconsistencies: (result['inconsistencies'] as DiscussionSnapshot['inconsistencies']) ?? [],
    decisionCandidate: (result['decisionCandidate'] as DiscussionSnapshot['decisionCandidate']) ?? null,
    discussionType: (result['discussionType'] as DiscussionSnapshot['discussionType']) ?? 'brainstorm',
    outputContract: (result['outputContract'] as string[]) ?? [],
    options: (result['options'] as string[]) ?? [],
    turn: (result['turn'] as number) ?? 0,
    terminalReason: (result['terminalReason'] as DiscussionSnapshot['terminalReason']) ?? null,
    participantStats: (result['participantStats'] as Record<string, ParticipantStat>) ?? {},
    droughtCount: (result['droughtCount'] as number) ?? 0,
  };
}

export function fallbackSnapshot(input: {
  snapshot?: DiscussionSnapshot | null;
  historySummary: string;
  initialTurn: number;
}): DiscussionSnapshot {
  const { snapshot, historySummary, initialTurn } = input;
  return {
    historySummary: snapshot?.historySummary ?? historySummary,
    summarizedUntilTurn: snapshot?.summarizedUntilTurn ?? 0,
    brief: snapshot?.brief ?? null,
    issues: snapshot?.issues ?? [],
    inconsistencies: snapshot?.inconsistencies ?? [],
    decisionCandidate: snapshot?.decisionCandidate ?? null,
    discussionType: snapshot?.discussionType ?? 'brainstorm',
    outputContract: snapshot?.outputContract ?? [],
    options: snapshot?.options ?? [],
    turn: initialTurn,
    terminalReason: snapshot?.terminalReason ?? null,
    participantStats: snapshot?.participantStats ?? {},
    droughtCount: snapshot?.droughtCount ?? 0,
  };
}

export function agentTurnCount(entries: TurnEntry[]): number {
  return entries.filter((entry) => entry.role === 'agent').length;
}

function runtimeStateForRun(
  snapshot: DiscussionSnapshot | null | undefined,
  turnLog: TurnEntry[],
): {
  participantStats: Record<string, ParticipantStat>;
  droughtCount: number;
} {
  return {
    participantStats: snapshot?.participantStats ?? reconstructParticipantStats(turnLog),
    droughtCount: snapshot?.droughtCount ?? reconstructDroughtCount(turnLog),
  };
}

function reconstructParticipantStats(turnLog: TurnEntry[]): Record<string, ParticipantStat> {
  const stats: Record<string, ParticipantStat> = {};
  const previousSpeeches: string[] = [];

  for (const entry of turnLog) {
    if (entry.role !== 'agent' || !entry.agentId || !entry.content.trim()) continue;

    const stat = stats[entry.agentId] ?? { turns: 0, newClaims: 0, repeatClaims: 0 };
    const repeated = previousSpeeches.some((speech) => isSimilarIdea(entry.content, speech));
    stats[entry.agentId] = {
      turns: stat.turns + 1,
      newClaims: stat.newClaims + (repeated ? 0 : 1),
      repeatClaims: stat.repeatClaims + (repeated ? 1 : 0),
    };
    previousSpeeches.push(entry.content);
  }

  return stats;
}

function reconstructDroughtCount(turnLog: TurnEntry[]): number {
  const agentEntries = turnLog.filter(
    (entry) => entry.role === 'agent' && entry.content.trim(),
  );
  let drought = 0;

  for (let i = agentEntries.length - 1; i >= 0; i -= 1) {
    const current = agentEntries[i]!;
    const previous = agentEntries.slice(0, i);
    const repeated = previous.some((entry) => isSimilarIdea(current.content, entry.content));
    if (!repeated) break;
    drought += 1;
  }

  return drought;
}
