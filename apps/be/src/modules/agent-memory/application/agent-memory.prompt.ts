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

방금 끝난 토론에서 이 에이전트가 미래의 다른 토론에서도 재사용할 장기 기억 후보를 0~10개 추출하세요.

토론 주제: "${topic}"

[이 에이전트의 발언]
${ownSpeeches.length > 0 ? ownSpeeches.map((s, i) => `${i + 1}. ${s}`).join('\n') : '발언 없음'}

[토론 결론]
${renderConclusion(decisionCandidate, issues)}

## 저장 대상 (kind)
- judgment_criterion: 반복 적용할 판단 기준
- verification_rule: 결론 전 확인할 검증 규칙
- decision_preference: 선호된 의사결정 기준
- role_constraint: 역할 수행 시 지켜야 할 장기 제약

## 제외 대상
- 단순 발언 로그, 일회성 토픽 상태, 임시 합의, 범위 밖 항목, 민감정보(키/비밀번호/토큰 등)

## 근거·플래그 규칙
- confidence 숫자는 만들지 말고 evidenceLevel과 flags만 반환합니다.
- evidenceLevel: final_conclusion | final_and_snapshot | repeated_by_agent | explicit_user_preference | single_agent_unopposed | weak_or_ambiguous
- flags(해당 시): needs_verification | unresolved_inconsistency | speculative
- 각 후보는 다른 주제에서도 재사용 가능하도록 간결하고 일반화된 한 문장으로 적습니다.
- 기억할 가치가 없으면 candidates를 빈 배열로 응답합니다.

JSON으로 응답하세요:
{"candidates":[{"key":"...","kind":"judgment_criterion","content":"...","evidenceLevel":"repeated_by_agent","flags":[],"sourceRounds":[]}]}`;
}
