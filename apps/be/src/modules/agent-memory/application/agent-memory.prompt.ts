import type {
  DecisionCandidate,
  Issue,
  RoomAgentSpec,
} from '../../agent-rooms/application/discussion/discussion.types';

function renderConclusion(decisionCandidate: DecisionCandidate | null, issues: Issue[]): string {
  const lines: string[] = [];
  if (decisionCandidate?.recommendation?.trim()) {
    lines.push(`권고안: ${decisionCandidate.recommendation}`);
    if (decisionCandidate.conditions.length > 0) lines.push(`조건: ${decisionCandidate.conditions.join(', ')}`);
    if (decisionCandidate.risks.length > 0) lines.push(`리스크: ${decisionCandidate.risks.join(', ')}`);
    if (decisionCandidate.verification.length > 0) lines.push(`검증 항목: ${decisionCandidate.verification.join(', ')}`);
  }
  const decidable = issues.filter((i) => i.status === 'decidable' || i.status === 'needs_verification');
  if (decidable.length > 0) {
    lines.push(`주요 쟁점: ${decidable.map((i) => i.title).join(' / ')}`);
  }
  return lines.length > 0 ? lines.join('\n') : '결론 정보 없음';
}

export function buildMemoryExtractionPrompt(
  agent: RoomAgentSpec,
  topic: string,
  ownSpeeches: string[],
  decisionCandidate: DecisionCandidate | null,
  issues: Issue[],
): string {
  return `당신은 "${agent.name}" 에이전트의 장기 기억을 관리합니다.
역할 지침: ${agent.instructions}

방금 끝난 토론에서 이 에이전트가 미래의 다른 토론에서도 기억해야 할 지속적 노트를 0~3개 추출하세요.

토론 주제: "${topic}"

[이 에이전트의 발언]
${ownSpeeches.length > 0 ? ownSpeeches.map((s, i) => `${i + 1}. ${s}`).join('\n') : '발언 없음'}

[토론 결론]
${renderConclusion(decisionCandidate, issues)}

## 추출 규칙
- 이 에이전트가 확립한 입장, 앞으로 지켜야 할 결정, 남은 미해결 우려만 적습니다.
- 이번 토픽에만 해당하는 사소한 사실, 수치, 일반론은 적지 마세요.
- 다른 주제의 토론에서도 재사용 가능하도록 간결하고 일반화된 한 문장으로 적습니다.
- 기억할 가치가 없으면 빈 배열로 응답합니다.

JSON으로 응답하세요: {"notes": ["...", "..."]}`;
}
