import { ChatMessage } from '../llm/llm.types';
import {
  DecisionCandidate,
  DiscussionType,
  Inconsistency,
  Issue,
  RoomAgentSpec,
  unresolvedInconsistencies,
} from './orchestrator.types';

export const MODERATOR = '진행자';

export const DECISION_CONTRACT = ['권고안', '채택 조건', '호환/이행', '리스크 분류', '검증 항목'];

export const TYPE_GUIDE: Record<DiscussionType, string> = {
  decision: 'a topic that requires deciding what to do or how to do it',
  review: 'a topic that inspects an already-produced result, design, or code',
  brainstorm: 'a topic that diverges broadly to generate ideas',
  risk_check: 'a topic that inspects the risks of a specific approach',
};

export interface Prompt {
  system: string;
  user: string;
}

export function toMessages(prompt: Prompt): ChatMessage[] {
  return [
    { role: 'system', content: prompt.system },
    { role: 'user', content: prompt.user },
  ];
}

export function roster(agents: RoomAgentSpec[]): string {
  return agents
    .map((a) => `- id: ${a.id}, name: ${a.name}${a.description ? `, role: ${a.description}` : ''}`)
    .join('\n');
}

export function renderIssues(issues: Issue[]): string {
  if (issues.length === 0) return '(none yet)';
  return issues
    .map((issue) => {
      const lines = [`- [${issue.id}] (${issue.status}) ${issue.title}`];
      if (issue.claims.length) lines.push(`  claims: ${issue.claims.join(' / ')}`);
      if (issue.risks.length) lines.push(`  risks: ${issue.risks.join(' / ')}`);
      if (issue.proposals.length) lines.push(`  proposals: ${issue.proposals.join(' / ')}`);
      return lines.join('\n');
    })
    .join('\n');
}

export function renderInconsistencies(items: Inconsistency[]): string {
  const open = unresolvedInconsistencies(items);
  if (open.length === 0) return '(none)';
  return open.map((item) => `- [${item.id}] (${item.kind}) ${item.description}`).join('\n');
}

export function renderDecisionCandidate(candidate: DecisionCandidate | null): string {
  if (!candidate) return '(none yet)';
  return [
    `recommendation: ${candidate.recommendation || '(undecided)'}`,
    `conditions: ${candidate.conditions.join(' / ') || '(undecided)'}`,
    `risks: ${candidate.risks.join(' / ') || '(undecided)'}`,
    `verification: ${candidate.verification.join(' / ') || '(undecided)'}`,
  ].join('\n');
}
