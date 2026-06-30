import type {
  DecisionCandidate,
  Inconsistency,
  Issue,
  RoomAgentSpec,
} from '../../modules/agent-rooms/application/discussion/discussion.types';
import { openIssues, unresolvedInconsistencies } from '../../modules/agent-rooms/application/discussion/discussion.types';

interface DecisionCandidateRenderOptions {
  includeCommitment?: boolean;
  emptyText?: string;
  emptyListText?: string;
  tailInstruction?: string;
}

interface SpeakDiscussionStateRenderOptions {
  issues: Issue[];
  inconsistencies: Inconsistency[];
  decisionCandidate: DecisionCandidate | null;
  convergePressureHint: string;
}

export function renderCsv(items: string[], emptyText: string = '없음'): string {
  return items.join(', ') || emptyText;
}

export function renderBulletList<T>(
  items: T[],
  renderItem: (item: T) => string,
  emptyText: string = '없음',
): string {
  return items.length > 0 ? items.map(renderItem).join('\n') : emptyText;
}

export function renderOptionalSection(title: string, content: string): string {
  return content ? `\n\n${title}:\n${content}` : '';
}

export function renderOptionalLabel(label: string, content: string): string {
  return content ? `\n\n${label}: ${content}` : '';
}

function renderSectionWithFooter(title: string, content: string, footer: string): string {
  if (!content) return '';
  return renderOptionalSection(title, `${content}\n${footer}`);
}

export function renderSpeakPressure(hint: string): string {
  return hint ? `\n\n[중요] ${hint}` : '';
}

export function renderDecisionCandidate(
  candidate: DecisionCandidate | null,
  options: DecisionCandidateRenderOptions = {},
): string {
  const emptyText = options.emptyText ?? '없음';
  if (!candidate) return emptyText;

  const emptyListText = options.emptyListText ?? '없음';
  const lines = [
    `- 권고: ${candidate.recommendation}`,
    `- 조건: ${renderCsv(candidate.conditions, emptyListText)}`,
    `- 리스크: ${renderCsv(candidate.risks, emptyListText)}`,
    `- 검증: ${renderCsv(candidate.verification, emptyListText)}`,
  ];

  if (options.includeCommitment) {
    lines.push(`- 확정성: ${candidate.isCommitted ? 'committed' : 'uncommitted'}`);
  }
  if (options.tailInstruction) {
    lines.push(options.tailInstruction);
  }

  return lines.join('\n');
}

export function renderParticipantsForSpeaker(participants: RoomAgentSpec[]): string {
  return renderBulletList(participants, (p) => `- ${p.id}: ${p.name} (${p.description ?? ''})`, '');
}

export function renderAgentsForModerator(agents: RoomAgentSpec[]): string {
  return renderBulletList(agents, (a) => `- id="${a.id}" name="${a.name}"`, '');
}

export function renderOptions(options: string[]): string {
  return renderOptionalSection('핵심 선택지', renderBulletList(options, (option) => `- ${option}`, ''));
}

export function renderOpenIssueClaims(issues: Issue[]): string {
  const open = openIssues(issues);
  return renderBulletList(open, (i) => `- ${i.title}: ${renderCsv(i.claims, '기록된 주장 없음')}`, '');
}

export function renderSpeakOpenIssuesSection(issues: Issue[]): string {
  return renderSectionWithFooter(
    '이미 제기된 쟁점과 주장 (반복 금지)',
    renderOpenIssueClaims(issues),
    '위 내용을 같은 말로 반복하지 마세요. 새 주장, 반례, 리스크, 조건, 또는 열린 쟁점을 좁히는 말만 하세요.',
  );
}

export function renderOpenIssueTitles(issues: Issue[]): string {
  return renderCsv(openIssues(issues).map((i) => i.title));
}

export function renderUnresolvedInconsistencies(inconsistencies: Inconsistency[]): string {
  const unresolved = unresolvedInconsistencies(inconsistencies);
  return renderBulletList(unresolved, (i) => `- ${i.description}`, '');
}

export function renderSpeakInconsistenciesSection(inconsistencies: Inconsistency[]): string {
  return renderSectionWithFooter(
    '미해소 모순 (우선 해결)',
    renderUnresolvedInconsistencies(inconsistencies),
    '새 주장을 하기 전에 위 모순을 바로잡거나 검증 필요성을 명확히 하세요.',
  );
}

export function renderUnresolvedInconsistencySummary(inconsistencies: Inconsistency[]): string {
  return renderCsv(unresolvedInconsistencies(inconsistencies).map((i) => i.description));
}

export function renderSpeakDecisionCandidateSection(candidate: DecisionCandidate | null): string {
  return renderOptionalSection(
    '현재 결론 후보',
    renderDecisionCandidate(candidate, {
      emptyText: '',
      tailInstruction: '이 결론 후보에 동의하고 새 주장, 반례, 리스크가 없으면 같은 내용을 반복하지 말고 새로 확인할 조건이 있는 경우만 말하세요.',
    }),
  );
}

export function renderPickSpeakerDecisionCandidateSection(candidate: DecisionCandidate | null): string {
  if (!candidate) return '\n\n현재 결론 후보: 없음';
  return renderOptionalSection(
    '현재 결론 후보',
    renderDecisionCandidate(candidate, { includeCommitment: true }),
  );
}

export function renderSpeakDiscussionState(options: SpeakDiscussionStateRenderOptions): string {
  return [
    renderSpeakOpenIssuesSection(options.issues),
    renderSpeakInconsistenciesSection(options.inconsistencies),
    renderSpeakDecisionCandidateSection(options.decisionCandidate),
    renderSpeakPressure(options.convergePressureHint),
  ].join('');
}
