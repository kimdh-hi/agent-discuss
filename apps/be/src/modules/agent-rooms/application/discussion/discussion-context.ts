import { TurnEntry } from './orchestrator.types';
import { renderTurnLog } from './turn-log';

export const DISCUSSION_CONTEXT_DEFAULTS = {
  recentTurns: 4,
  historySummaryMaxChars: 1500,
  recentTranscriptMaxChars: 4500,
} as const;

export interface DiscussionContextState {
  turnLog: TurnEntry[];
  historySummary?: string;
  summarizedUntilTurn?: number;
}

export interface DiscussionContextOptions {
  recentTurns?: number;
  historySummaryMaxChars?: number;
  recentTranscriptMaxChars?: number;
}

export interface DiscussionContext {
  text: string;
  historySummary: string;
  recentTranscript: string;
}

export function buildDiscussionContext(
  state: DiscussionContextState,
  options: DiscussionContextOptions = {},
): DiscussionContext {
  const limits = { ...DISCUSSION_CONTEXT_DEFAULTS, ...options };
  const summary = limitText((state.historySummary ?? '').trim(), limits.historySummaryMaxChars);
  const recentTranscript = renderTurnLogWithinBudget(
    recentEntries(state.turnLog, limits.recentTurns),
    limits.recentTranscriptMaxChars,
  );

  if (!summary) {
    const fullTranscript = renderTurnLogWithinBudget(state.turnLog, limits.recentTranscriptMaxChars);
    return { text: fullTranscript, historySummary: '', recentTranscript: fullTranscript };
  }

  const text = [
    `[요약된 이전 토론]\n${summary}`,
    recentTranscript ? `[최근 발언 원문]\n${recentTranscript}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  return { text, historySummary: summary, recentTranscript };
}

export function entriesNeedingSummary(
  state: DiscussionContextState,
  options: Pick<DiscussionContextOptions, 'recentTurns'> = {},
): TurnEntry[] {
  const recentTurns = options.recentTurns ?? DISCUSSION_CONTEXT_DEFAULTS.recentTurns;
  const summarizedUntilTurn = state.summarizedUntilTurn ?? 0;
  const compactableEnd = Math.max(state.turnLog.length - recentTurns, 0);
  return state.turnLog.slice(0, compactableEnd).filter((entry) => entry.round > summarizedUntilTurn);
}

export function lastSummarizedTurn(entries: TurnEntry[], fallback: number): number {
  return entries.at(-1)?.round ?? fallback;
}

export function limitText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const suffix = '\n...(길이 제한으로 일부 생략)';
  return `${text.slice(0, Math.max(maxChars - suffix.length, 0)).trimEnd()}${suffix}`;
}

function recentEntries(entries: TurnEntry[], recentTurns: number): TurnEntry[] {
  return entries.slice(Math.max(entries.length - recentTurns, 0));
}

function renderTurnLogWithinBudget(entries: TurnEntry[], maxChars: number): string {
  const rendered = entries.map((entry) => renderTurnLog([entry]));
  const full = rendered.join('\n');
  if (full.length <= maxChars) return full;

  const kept: string[] = [];
  let used = 0;
  for (let i = rendered.length - 1; i >= 0; i--) {
    const line = rendered[i];
    const separator = kept.length > 0 ? 1 : 0;
    if (used + separator + line.length <= maxChars) {
      kept.unshift(line);
      used += separator + line.length;
      continue;
    }
    if (kept.length === 0) return limitText(line, maxChars);
    break;
  }

  return ['[최근 발언 일부 생략]', ...kept].join('\n');
}
