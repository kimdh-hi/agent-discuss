import type { TurnEntry } from './discussion.types';

export function renderTurnLog(entries: TurnEntry[]): string {
  return entries
    .map((e) => {
      const speaker = e.role === 'moderator' ? '진행자' : e.agentName;
      return `[Turn ${e.round}] ${speaker}: ${e.content}`;
    })
    .join('\n\n');
}

export function lastSpeakerId(turnLog: TurnEntry[]): string | null {
  for (let i = turnLog.length - 1; i >= 0; i--) {
    const entry = turnLog[i];
    if (entry && entry.role === 'agent' && entry.agentId) {
      return entry.agentId;
    }
  }
  return null;
}
