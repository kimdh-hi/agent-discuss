import { TurnEntry } from './orchestrator.types';

export function renderTurnLog(entries: TurnEntry[]): string {
  return entries.map((e) => `(R${e.round}) ${e.agentName}: ${e.content}`).join('\n');
}
