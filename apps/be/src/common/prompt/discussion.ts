import type {
  RoomAgentSpec,
  Issue,
  Inconsistency,
  DiscussionType,
  DecisionCandidate,
  DiscussionBrief,
} from '../../modules/agent-rooms/application/discussion/discussion.types';
import { DISCUSSION_LIMITS } from '../../modules/agent-rooms/application/discussion/discussion-limits';
import {
  renderAgentsForModerator,
  renderBulletList,
  renderCsv,
  renderDecisionCandidate,
  renderOpenIssueTitles,
  renderOptionalLabel,
  renderOptions,
  renderPickSpeakerDecisionCandidateSection,
  renderParticipantsForSpeaker,
  renderSpeakDiscussionState,
  renderUnresolvedInconsistencySummary,
} from './discussion-sections';

export const MODERATOR = '진행자';

function renderSpeakerBrief(brief: DiscussionBrief | null, agentId: string): string {
  if (!brief) return '';
  const plan = brief.rolePlan.find((item) => item.agentId === agentId);
  const contribution = plan?.assignedContribution?.trim() || '이번 토픽 결론에 직접 필요한 기여만 제시';
  const relevance = plan?.relevance ?? 'supporting';
  return `
이번 토픽 브리프:
- objective: ${brief.objective}
- deliverable: ${brief.deliverable}
- inScope: ${renderCsv(brief.inScope, '없음')}
- outOfScope: ${renderCsv(brief.outOfScope, '없음')}
- requiredDimensions: ${renderCsv(brief.requiredDimensions, '없음')}
- 내 relevance: ${relevance}
- 내 assignedContribution: ${contribution}`;
}

function renderModeratorBrief(brief: DiscussionBrief | null): string {
  if (!brief) return '';
  const rolePlan = brief.rolePlan
    .map((plan) => {
      const reason = plan.relevance === 'out_of_scope'
        ? `excluded: ${plan.exclusionReason ?? '범위 밖'}`
        : `assigned: ${plan.assignedContribution ?? '기여 항목 미정'}`;
      return `- ${plan.agentId}${plan.agentName ? ` (${plan.agentName})` : ''}: ${plan.relevance}, ${reason}`;
    })
    .join('\n');
  return `토픽 브리프:
- objective: ${brief.objective}
- deliverable: ${brief.deliverable}
- inScope: ${renderCsv(brief.inScope, '없음')}
- outOfScope: ${renderCsv(brief.outOfScope, '없음')}
- requiredDimensions: ${renderCsv(brief.requiredDimensions, '없음')}
rolePlan:
${rolePlan}`;
}

function renderIssueExtractionBrief(brief: DiscussionBrief | null): string {
  if (!brief) return '';
  return `
토픽 브리프:
- objective: ${brief.objective}
- inScope: ${renderCsv(brief.inScope, '없음')}
- outOfScope: ${renderCsv(brief.outOfScope, '없음')}
- requiredDimensions: ${renderCsv(brief.requiredDimensions, '없음')}
- rolePlan: ${brief.rolePlan.map((plan) => `${plan.agentId}:${plan.relevance}:${plan.assignedContribution ?? plan.exclusionReason ?? ''}`).join(' | ')}`;
}

export function buildValidateTopicPrompt(topic: string, agentNames: string[]): string {
  return `당신은 멀티에이전트 토론 진행자입니다.
다음 토픽이 에이전트들이 토론하기에 적합한지 판단하세요.

토픽: "${topic}"
참가 에이전트: ${agentNames.join(', ')}

적합하지 않은 경우: 너무 짧거나, 의미 없거나, 에이전트 역할과 무관한 경우.
인사, 테스트 입력, 잡문, 단일 단어, 랜덤 문자열은 토론 주제가 아닙니다.

예시:
- 토픽 "hello" => {"valid": false, "reason": "인사말은 토론 주제가 아닙니다."}
- 토픽 "안녕" => {"valid": false, "reason": "인사말은 토론 주제가 아닙니다."}
- 토픽 "test" => {"valid": false, "reason": "테스트 입력은 토론 주제가 아닙니다."}
- 토픽 "신규 결제 모듈 도입 검토" => {"valid": true}

다음 JSON 형식으로 응답하세요:
{"valid": true} 또는 {"valid": false, "reason": "거절 이유"}`;
}

export function buildDefineAgendaPrompt(topic: string, agents: RoomAgentSpec[]): string {
  const roles = agents
    .map((a) => `- ${a.name}: ${a.description ?? a.instructions.slice(0, DISCUSSION_LIMITS.agentRolePreviewChars)}`)
    .join('\n');
  return `토론 주제를 분석하고 분류하세요.

토픽: "${topic}"
참가자:
${roles}

discussionType: decision | review | brainstorm | risk_check
outputContract: 결론에 반드시 포함되어야 할 항목 목록
options: (decision/review 유형일 때) 핵심 선택지 목록
brief: 이번 토픽의 토론 제어 브리프
  - objective: 토픽의 실제 목표
  - deliverable: 토론 종료 시 산출물
  - inScope: 토론에서 다룰 범위
  - outOfScope: 다루지 않을 범위
  - requiredDimensions: 결론 전에 반드시 채워야 할 이번 토픽의 주요 쟁점. 이 값이 비어 있으면 outputContract를 주요 쟁점 기준으로 사용
  - rolePlan: 모든 참가자별 계획. agentId, agentName, relevance(core | supporting | out_of_scope), assignedContribution 또는 exclusionReason 포함

역할 분류 규칙:
- core/supporting 역할만 발언 대상입니다. out_of_scope 역할은 이번 토픽에서 발언시키지 않습니다.
- rolePlan.assignedContribution은 역할 체크리스트가 아니라 이번 토픽 결론에 직접 필요한 기여만 적습니다.
- 고정된 직무 taxonomy를 가정하지 말고, 각 agent의 name/description/instructions와 토픽의 objective/inScope를 비교해 relevance를 판단하세요.
- 특정 agent가 평소 잘 아는 분야라도 이번 토픽의 requiredDimensions를 직접 채우지 못하면 out_of_scope로 분류하세요.
- supporting은 직접 결론을 주도하지는 않지만 특정 required dimension이나 검증 공백을 채울 수 있을 때만 사용하세요.
- exclusionReason에는 왜 이번 토픽 결론에 직접 기여하지 않는지 구체적으로 쓰세요.

JSON으로 응답하세요.`;
}

export function buildSpeakSystemPrompt(
  agent: RoomAgentSpec,
  topic: string,
  participants: RoomAgentSpec[],
  issues: Issue[] = [],
  inconsistencies: Inconsistency[] = [],
  decisionCandidate: DecisionCandidate | null = null,
  convergePressureHint: string = '',
  brief: DiscussionBrief | null = null,
): string {
  const discussionState = renderSpeakDiscussionState({
    issues,
    inconsistencies,
    decisionCandidate,
    convergePressureHint,
  });
  const assignment = renderSpeakerBrief(brief, agent.id);

  return `당신은 "${agent.name}" 역할의 AI 에이전트입니다.
역할 지침: ${agent.instructions}

토론 주제: "${topic}"
${assignment}

참가자 목록:
${renderParticipantsForSpeaker(participants)}${discussionState}

## 발언 규칙
- 역할 체크리스트를 말하지 말고, 이번 토픽의 assigned contribution만 다루세요.
- 직전 발언의 부가 주제를 확장하지 말고 requiredDimensions 중 하나(없으면 outputContract 항목)에 직접 답하세요.
- 반드시 자신의 역할 렌즈에서만 말하세요. 다른 역할의 관점이 필요하면 어떤 검토가 필요한지만 본문에 적으세요.
- 현재 상태·수치가 입력, 지식, 이전 발언에 없으면 임의로 만들지 말고 '확인 필요'라고 말하세요.
- 인사, 감사, 자기소개, 서론 없이 바로 의견을 말하세요.
- 한 턴에는 새 주장 1개만 제시하세요. 여러 논점을 목록으로 나열하지 마세요.
- 발언 길이는 논점의 복잡도에 맞추세요. 단순 동의·반례는 1-2문장으로 짧게, 조건·리스크·근거가 필요한 새 주장은 더 길게 설명해도 됩니다.
- 이전 발언이나 이미 형성된 쟁점을 반복하지 마세요. 표현만 바꾼 재진술도 반복입니다.
- 일반론, 배경 설명, 용어 정의를 나열하지 마세요.
- 이전 발언에 동의하더라도 새 조건, 반례, 리스크 중 하나를 추가하세요. 추가할 새 축이 없으면 한 문장으로 동의만 표하고 발언을 마치세요(같은 내용을 길게 늘려 쓰지 마세요).
- 조기 결론, 최종 문서, 전체 요약을 작성하지 마세요.
- 원래 주제 결론에 직접 기여하지 않는 사이드 토픽은 꺼내지 마세요.
- outOfScope 항목은 새 쟁점으로 확장하지 마세요.
- requiredDimensions/outputContract 또는 현재 결론 후보를 전진시키지 못하는 새 주제는 말하지 마세요.
- 이 응답은 토론 참가자로서의 의견 본문만 포함합니다. 진행자 역할의 문장이나 시스템 제어 문장은 쓰지 마세요.`;
}

export function buildPickSpeakerPrompt(
  topic: string,
  agents: RoomAgentSpec[],
  context: string,
  issues: Issue[],
  lastSpeakerId: string | null,
  options: string[] = [],
  decisionCandidate: DecisionCandidate | null = null,
  convergencePressure: string = '',
  inconsistencies: Inconsistency[] = [],
  brief: DiscussionBrief | null = null,
): string {
  const optionSection = renderOptions(options);
  const candidateSection = renderPickSpeakerDecisionCandidateSection(decisionCandidate);
  const briefSection = renderModeratorBrief(brief);

  return `멀티에이전트 토론의 진행자입니다.

토론 주제: "${topic}"
${briefSection}
참가자:
${renderAgentsForModerator(agents)}
직전 발언자 id: ${lastSpeakerId ?? '없음'}
${optionSection}${candidateSection}${renderOptionalLabel('수렴 압력', convergencePressure)}

${context}

열린 쟁점: ${renderOpenIssueTitles(issues)}
미해소 모순: ${renderUnresolvedInconsistencySummary(inconsistencies)}

이번 토픽의 eligible(core/supporting) 역할 중에서 새 기여를 할 수 있는 참가자만 지명하세요.
requiredDimensions를 우선 채우고, requiredDimensions가 비어 있으면 outputContract를 주요 쟁점 기준으로 사용하세요.
서로 다른 역할 관점에서 새 기여를 할 수 있는 참가자를 우선하되, rolePlan 범위를 넘기지 마세요.
out_of_scope 역할은 사용자 대화에 노출하지 말고 지명하지 마세요.
미해소 모순이 있으면 결론보다 모순을 해소할 수 있는 참가자를 우선 지명하세요.
같은 주장을 반복하는 참가자보다 아직 해당 쟁점을 평가하지 않은 역할을 우선하세요.
직전 발언자가 같은 쟁점을 반복했다면 다른 역할 관점의 참가자를 우선 지명하세요.
반복 주장만 늘고 결론 후보를 전진시키지 못한 포화 참가자는 새 쟁점·반례·검증 공백을 메울 수 있을 때만 다시 지명하세요.
핵심 선택지가 있으면 done=true 전에 각 선택지가 최소 한 번은 진지하게 검토되었는지 확인하세요.
남은 열린 쟁점이 모두 out_of_scope이거나 결론 후보에 새 주장·반례·리스크를 더할 수 없으면 done=true로 종료를 권고하세요.

다음 발언자를 선택하거나(next: "<id>"), 토론 종료를 권고(done: true, next: null)하세요.
{"next": "<id 또는 null>", "reason": "<선택 이유>", "done": <종료 권고면 true>}`;
}

export function buildUpdateIssuesPrompt(
  topic: string,
  speech: string,
  turn: number,
  existingIssues: Issue[],
  decisionCandidate: DecisionCandidate | null = null,
  brief: DiscussionBrief | null = null,
): string {
  const briefSection = renderIssueExtractionBrief(brief);
  return `다음 발언에서 쟁점, 주장, 리스크, 제안을 추출하세요.

토론 주제:
${topic}
${briefSection}

발언 (턴 ${turn}):
${speech}

기존 쟁점:
${renderBulletList(existingIssues, (i) => `- [${i.id}] ${i.title}: ${renderCsv(i.claims, '')}`)}

현재 결론 후보:
${renderDecisionCandidate(decisionCandidate, { includeCommitment: true })}

## 추출 규칙

**status 분류:**
- open: 아직 논의 중이거나 결론이 나지 않은 쟁점
- decidable: 충분한 논의로 결정 가능한 쟁점
- needs_verification: 사실 확인·검증이 필요한 쟁점
- out_of_scope: 현재 토론 범위를 벗어난 쟁점

**revisits / lastTouchedTurn:**
- 기존 쟁점(같은 id)이 이 발언에서 다시 언급되면 revisits를 1 증가시키고, lastTouchedTurn을 현재 턴(${turn})으로 갱신한다.
- 표현·예시·문장구조·일반화 수준이 달라도 핵심 주장이 기존 쟁점과 같은 의미면 반드시 그 기존 id를 재사용하고 revisits를 1 증가시킨다. 새 id는 만들지 않는다. 기존 쟁점의 제목뿐 아니라 그 안의 주장·리스크·제안과도 의미를 대조한다.
- 새 id("issue-${turn}-1" 형식)는 정말로 새로운 쟁점·새로운 축일 때만 생성하고 revisits=0, lastTouchedTurn=${turn}으로 초기화한다.

**inconsistencies 추출:**
- 수치 계산 오류: kind="arithmetic"
- 단위 불일치(예: kg vs ton): kind="unit"
- 주장 간 논리 모순: kind="contradiction"
- 모순이 없으면 빈 배열([])로 응답한다.

**newClaims / repeatClaims:**
- newClaims: 이 발언에서 처음 등장한 새 주장의 수.
- repeatClaims: 기존 쟁점을 반복하거나 재언급한 주장의 수(revisits 와 소비처가 다르므로 둘 다 명시한다).
- newClaims는 실제로 새 주장, 제약, 반례, 트레이드오프, 리스크를 추가할 때만 증가시킨다.
- 같은 의미의 반복, 표현만 바꾼 재진술, 이미 나온 주장에 숫자나 예시만 덧붙인 경우는 repeatClaims로 센다.
- 동의어·재배열·재요약으로 같은 말을 다시 하는 발언은, requiredDimensions/outputContract 또는 결론 후보를 실제로 전진시키지 않는 한 newClaims=0, repeatClaims>=1로 센다(앞 발언에 대한 동의·부연만 있고 새 축이 없으면 반복이다).
- requiredDimensions를 직접 채우거나 현재 decisionCandidate를 보강한 경우만 주요 진행으로 본다.
- requiredDimensions가 비어 있으면 outputContract 항목을 직접 채우는 경우만 주요 진행으로 본다.
- 발언이 원 주제 결론이 아니라 후속 구현·부가 기능·사이드 토픽으로 흘러가면 out_of_scope로 분류한다.
- brief.outOfScope에 해당하거나 rolePlan.assignedContribution 밖의 발언이면 out_of_scope로 분류하고 newClaims를 올리지 않는다.
- 주요 쟁점 밖의 새 주제, 직전 발언의 사이드 토픽 확장, requiredDimensions/outputContract 또는 inScope를 실제로 채우지 않는 역할 체크리스트/일반론은 repeatClaims 또는 out_of_scope로 분류하고 newClaims를 올리지 않는다.
- 같은 권고·결론을 표현만 바꿔 다시 말하면(동일 화자가 이전 자기 발언을 재진술하는 경우 포함) 무조건 newClaims=0, repeatClaims>=1로 센다.
- 여러 역할의 의견을 종합하거나 토론 전체를 요약하는 발언은 새 축을 더하지 않는 한 항상 repeatClaims로 센다(전체 요약·3버킷 재진술은 newClaims=0).

**decisionCandidate:**
- 이 발언에서 명확한 권고안이 보이면 추출한다.
- 기존 결론 후보가 있고 이 발언이 후보를 보강하면 조건, 리스크, 검증 항목을 누적 반영한다.
- isCommitted: 권고가 확정적(단언·결정)이면 true, 헤지(~할 수 있다, ~를 고려, 잠정)이면 false.
- 권고안 변화나 보강이 없으면 null로 응답한다. null은 기존 후보를 삭제하라는 뜻이 아니다.
- 발언에 없는 내용, 아직 논의되지 않은 근거, 추측한 권고안을 발명하지 않는다.

JSON으로 응답하세요.`;
}

export function buildSpeakRetryPrompt(): string {
  return '직전 응답에 발언 본문이 없었습니다. 도구 호출 안내나 제어 블록 없이, 당신의 역할 관점에서 새 주장·반례·리스크 중 하나를 논점의 복잡도에 맞는 길이의 본문으로만 작성하세요.';
}

export function buildCompactHistoryPrompt(entries: string, maxChars: number): string {
  return `다음 토론 내용을 최대 ${maxChars}자로 요약하세요. 결정·근거·미해결 질문을 우선 보존하고 잡담·중복은 폐기하세요. 가능하면 [결정] / [근거] / [열린 쟁점] / [미해결 질문] 섹션으로 구조화하세요.

${entries}`;
}

export function buildResummarizePrompt(combined: string, maxChars: number): string {
  return `다음 토론 요약을 ${maxChars}자 이내로 재압축하세요. 결정·근거·미해결 질문을 우선 보존하고 [결정] / [근거] / [열린 쟁점] / [미해결 질문] 섹션 구조를 유지하세요. 잡담·중복은 폐기하세요.

${combined}`;
}

export function buildDraftConclusionPrompt(
  topic: string,
  context: string,
  outputContract: string[],
  discussionType: DiscussionType,
  decisionCandidate: DecisionCandidate | null = null,
): string {
  const decisionDirective = discussionType === 'decision'
    ? `\n**decision 유형 전용:**\n논의에 분명히 나온 차단 사유(미해소 모순, 명시된 게이트 미달 수치, 미해결 P0 결함)가 있으면 recommendation을 '재검토' 또는 '추가 논의 필요' 같은 회피형으로 작성하지 말고 Go 또는 No-Go 중 하나를 단언하세요. Go/No-Go 토픽에서 P0 > 0, P1 > 0, 또는 핵심 E2E 기준 미달이 논의에 있으면 No-Go로 단언합니다. 논의에 나오지 않은 수치나 차단 사유를 발명해서는 안 됩니다.\n`
    : '';

  return `토론이 수렴 단계입니다. 최종 결론을 작성하세요.

토픽: "${topic}"
유형: ${discussionType}
필수 결론 항목: ${outputContract.join(', ')}
현재 결론 후보:
${renderDecisionCandidate(decisionCandidate, { includeCommitment: true })}

${context}

## 지시 사항

실제 논의에 나온 내용만 사용하세요. 논의되지 않은 권고안, 조건, 리스크, 검증 항목을 발명하지 마세요.
${decisionDirective}
모든 쟁점을 다음 기준으로 최종 분류하세요:
- decidable: 논의로 결론이 명확한 쟁점
- needs_verification: 미해소 모순이 있거나 사실 확인이 필요한 쟁점
- out_of_scope: 토론 범위 밖의 쟁점

outputContract의 모든 항목(${outputContract.join(', ')})은 실제 논의 내용이나 기존 결론 후보로 채울 수 있을 때만 decisionCandidate에 반영하세요.

**decisionCandidate.isCommitted 판단 기준:**
- true: 결정형 — 참가자 합의 또는 명확한 권고가 있고 미해소 모순이 없다.
- false: 헤지/유보형 — 아직 미해소 모순이 있거나 추가 검증이 필요하다.
미해소 모순은 verification 배열에 편입한 뒤 isCommitted를 판단하세요.

JSON으로 응답하세요.`;
}

export function buildWriteResultPrompt(
  topic: string,
  context: string,
  candidate: DecisionCandidate | null,
  issues: Issue[],
  outputContract: string[],
  discussionType: DiscussionType = 'brainstorm',
): string {
  const decidable = issues.filter((i) => i.status === 'decidable');
  const needsVerification = issues.filter((i) => i.status === 'needs_verification');
  const contractItems = outputContract.length > 0
    ? outputContract.map((item) => `- ${item}`).join('\n')
    : '- 지정된 필수 항목 없음';
  const decisionDirective = discussionType === 'decision'
    ? `\nGo/No-Go 토픽이면 첫 줄은 반드시 '판정: Go' 또는 '판정: No-Go'입니다. 논의에 분명히 나온 차단 사유(미해소 모순, 명시된 게이트 미달 수치, 미해결 P0 결함)가 있으면 결론의 권고를 '재검토' 또는 '추가 논의 필요' 같은 회피형으로 작성하지 말고 Go 또는 No-Go 중 하나를 단언하세요. P0 > 0, P1 > 0, 또는 핵심 E2E 기준 미달이 논의에 있으면 '판정: No-Go'로 시작하세요. 논의에 나오지 않은 수치나 차단 사유를 발명해서는 안 됩니다.\n`
    : '';

  return `토론 결론을 최종 정리하세요.

토픽: "${topic}"
결론 필수 항목: ${outputContract.join(', ')}

반드시 반영할 필수 항목:
${contractItems}

확정 권고안:
${renderDecisionCandidate(candidate, { emptyListText: '' })}

결론 쟁점:
${renderBulletList(decidable, (i) => `- ${i.title}: ${renderCsv(i.proposals, '')}`, '')}

검증 필요 쟁점:
${renderBulletList(needsVerification, (i) => `- ${i.title}: ${renderCsv(i.proposals, '')}`, '')}

${context}

실제 논의에 나온 내용과 확정 권고안만 반영하세요.
발언에 없는 조건, 리스크, 실행 계획, 근거를 추측하거나 발명하지 마세요.
최종 답변에는 "필수 항목 반영" 섹션을 만들고, 각 결론 필수 항목을 반드시 한 번씩 다루세요.
논의에서 확인된 항목은 결론을 쓰고, 논의 근거가 부족한 항목은 "검증 필요" 또는 "보류"로 표시하세요.${decisionDirective}참가자들이 납득할 수 있는 구조화된 결론을 마크다운으로 작성하세요.`;
}
