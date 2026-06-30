import type { TurnEntry, Issue, Inconsistency } from './discussion.types';
import { openIssues, unresolvedInconsistencies } from './discussion.types';
import { DISCUSSION_LIMITS } from './discussion-limits';
import { renderTurnLog } from './turn-log';
import type { ChatMessage } from '../../../../common/ai/llm/llm.types';

export function buildDiscussionContext(
  turnLog: TurnEntry[],
  historySummary: string,
  keepTurns: number = DISCUSSION_LIMITS.compactKeepTurns,
): string {
  const recent = turnLog.slice(-keepTurns);
  const parts: string[] = [];
  if (historySummary) {
    parts.push(`[이전 논의 요약]\n${historySummary}`);
  }
  if (recent.length > 0) {
    parts.push(`[최근 발언]\n${renderTurnLog(recent)}`);
  }
  return parts.join('\n\n');
}

export function buildDiscussionMessages(
  turnLog: TurnEntry[],
  historySummary: string,
  currentAgentId: string,
  issues: Issue[],
  inconsistencies: Inconsistency[],
  keepTurns: number = DISCUSSION_LIMITS.compactKeepTurns,
): ChatMessage[] {
  const recent = turnLog.slice(-keepTurns);
  const open = openIssues(issues);
  const unresolved = unresolvedInconsistencies(inconsistencies);

  const contextParts: string[] = [];
  if (historySummary) {
    contextParts.push(`[이전 논의 요약]\n${historySummary}`);
  }
  if (open.length > 0) {
    contextParts.push(`[열린 쟁점]\n${open.map((i) => `- ${i.title}: ${i.claims.join(', ')}`).join('\n')}`);
  }
  if (unresolved.length > 0) {
    contextParts.push(`[미해소 모순]\n${unresolved.map((i) => `- ${i.description}`).join('\n')}`);
  }

  const messages: ChatMessage[] = [];

  if (contextParts.length > 0) {
    messages.push({ role: 'user', content: contextParts.join('\n\n') });
  }

  for (const entry of recent) {
    const isOwn = entry.agentId === currentAgentId;
    if (isOwn) {
      messages.push({ role: 'assistant', content: entry.content });
    } else {
      const speaker = entry.role === 'moderator' ? '진행자' : entry.agentName;
      messages.push({ role: 'user', content: `[${speaker}]: ${entry.content}` });
    }
  }

  return messages;
}
