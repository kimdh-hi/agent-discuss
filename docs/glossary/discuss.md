# Discuss 용어 사전

`apps/be/src/orchestrator/` 멀티 에이전트 토론(discuss) 기능의 핵심 용어. 동작 흐름은 [discuss.md](../discuss.md) 참고.

## 구조

| 용어 | 의미 | 위치 |
|---|---|---|
| Discussion | 여러 에이전트가 턴 단위로 발언권을 주고받는 멀티 에이전트 토론 1회 실행 | `orchestrator.service.ts:38` |
| Topic | 토론 안건. room에 속하며 이어가기 토론을 누적하는 저장 단위(`RoomTopic`) | `room-topic.entity.ts:7` |
| Room | 에이전트·토픽 목록을 소유하는 토론 공간 | `room.entity.ts` |
| Turn | 한 명이 한 번 발언하는 단위. `round` 필드는 라운드 번호가 아닌 **턴 인덱스** | `orchestrator.types.ts:57` |
| maxTurns | 턴 상한 `initialTurn + max(참가자수×5, 5)`. 도달 시 converge | `orchestrator.service.ts` |

## 참가자

| 용어 | 의미 | 위치 |
|---|---|---|
| Agent | 고유 instructions·model·역할에 더해 `tools`·`maxToolIterations` 역량을 가진 AI 참가자(`RoomAgentSpec`) | `orchestrator.types.ts:3` |
| Agent capability | 에이전트별 도구 키 목록(`tools`)과 턴당 ReAct 반복 한도(`maxToolIterations`). `Agent` 엔티티에 영속 | `agent.entity.ts` |
| Moderator (진행자) | 검증·분류·발언자 선정·쟁점 갱신·메모리 압축·결론 확정·요약을 LLM으로 판단하는 시스템 역할 | `moderator.service.ts:30` |
| Director (디렉터) | 발언권 넘김으로 발언자를 못 정할 때만 개입해 다음 발언자/종료를 정하는 모더레이터 기능(`pickSpeaker`) | `moderator.service.ts` |
| Speaker | 실제 LLM 스트리밍 발언을 수행하는 실행 단위 | `speaker.service.ts:24` |

## 상태 / 단계

| 용어 | 의미 | 위치 |
|---|---|---|
| DiscussionState | LangGraph로 정의한 토론 전체 상태 | `discussion-state.ts` |
| converging | converge 단계 진입 여부. `moderate`가 켜면 이후 발언 복귀는 곧장 `draftConclusion`으로 가고, 발언 압박 문구도 강화 | `discussion-state.ts` |
| DiscussionType | 주제 분류: `decision`·`review`·`brainstorm`·`risk_check` | `orchestrator.types.ts:11` |
| 그래프 노드 | `validateTopic`→`defineAgenda`→(`moderate`↔`speak`→`updateIssues`→`compactHistory`)→`draftConclusion`→`reviewConclusion`→`writeResult` | `orchestrator.service.ts` |

## 쟁점 목록 (Issues)

| 용어 | 의미 | 위치 |
|---|---|---|
| Issue | 발언에서 추출돼 매 턴 갱신·병합되는 논점(claims·risks·proposals 보유) | `orchestrator.types.ts:17` |
| IssueStatus | `open`·`decidable`·`needs_verification`·`out_of_scope` | `orchestrator.types.ts:15` |
| newClaims / repeatClaims | 발언이 신규 논점인지 기존 반복인지 카운트. 정체·발언권 넘김 차단 판단에 사용 | `orchestrator.types.ts:49` |
| ParticipantStat | 참가자별 누적 `{turns, newClaims, repeatClaims}`. `repeat>new`면 발언권 넘김 차단 | `orchestrator.types.ts:28` |
| Inconsistency | 모더레이터가 재계산으로 검출한 수치 모순(`arithmetic`·`unit`·`contradiction`) | `orchestrator.types.ts:41` |

## 결론

| 용어 | 의미 | 위치 |
|---|---|---|
| outputContract | 최종 결론에 반드시 포함될 항목. defineAgenda가 확정 | `discussion-state.ts` |
| DECISION_CONTRACT | decision 유형 고정 항목: 권고안·채택 조건·호환/이행·리스크 분류·검증 항목 | `prompts.ts:36` |
| DecisionCandidate | 점진 갱신되는 결론 초안 `{recommendation, conditions, risks, verification}` | `orchestrator.types.ts:34` |
| contractSatisfied | 권고안이 있고(헤지 아님) 조건·검증이 충족됐는지 검사. `reviewConclusion`이 호출해 final 분기 | `orchestrator.service.ts` |
| options | "A vs B" 주제의 핵심 선택지. 모두 옹호돼야 종료 | `moderator.service.ts:26` |

## 라우팅 / converge

| 용어 | 의미 | 위치 |
|---|---|---|
| Command(goto) | 의사결정 노드(`validateTopic`·`moderate`·`reviewConclusion`)가 다음 노드를 직접 지정하는 LangGraph 라우팅 수단 | `orchestrator.service.ts` |
| Yield | 발언자가 제어 블록 `yieldTo`로 다음 발언자를 직접 지목(LLM 호출 없음). 감독자(`moderate`)가 가드를 거쳐 승인/거부 | `orchestrator.service.ts` |
| Control Block | 발언 끝의 ```` ```control ```` JSON. `{yieldTo, passReason, done}`. 사용자에 노출 안 됨 | `prompts.ts:12` |
| yieldStreak | 연속 yield 카운터. `3`회 연속 시 디렉터 개입(핑퐁 방지) | `orchestrator.service.ts` |
| Claim drought | 새 주장 없이 흐른 연속 턴(`droughtCount`). `2`회면 `moderate`가 `draftConclusion`으로 converge | `orchestrator.service.ts` |
| Resolve retries | `reviewConclusion`이 결론 미충족으로 보강 1턴을 요구한 횟수(`resolveRetries`). `1` 도달 시 강제 final | `orchestrator.service.ts` |
| Cold-start guard | 발언 0건인데 종료 판정 시, 종료 보류하고 발언자 지명(빈 토론 방지) | `orchestrator.service.ts` |

## 컨텍스트 / 메모리

| 용어 | 의미 | 위치 |
|---|---|---|
| Turn log | 누적 발언 원문(저장용, concat 보존). `historySummary`(압축 요약)와 분리 | `discussion-state.ts` |
| historySummary | 오래된 발언의 압축 요약(최대 1,500자). 프롬프트엔 요약+최근 원문 사용 | `discussion-state.ts` |
| DiscussionContext | 프롬프트용 컴팩트 문맥(요약 + 최근 4턴 원문, 글자 예산 내) | `discussion-context.ts:22` |

## 스트리밍 / 이어가기

| 용어 | 의미 | 위치 |
|---|---|---|
| RoomEvent | 토론 진행 중 발행되는 내부 이벤트 유니온 → SSE로 변환 | `orchestrator.types.ts:73` |
| DiscussionHubService | 이벤트를 버퍼링·fan-out하고 재접속·취소를 지원하는 허브 | `discussion-hub.service.ts:18` |
| Reattach | 진행 중 토론 스트림에 재연결(버퍼 재생 후 이후 이벤트 잇기) `GET .../stream` | `rooms.controller.ts:112` |
| Continuation | 직전 transcript·결론을 문맥에 넣어 같은 topic 토론을 이어 실행 | `orchestrator.types.ts:65` |
| Abort / Cancel | `AbortSignal`로 토론 중단(연결 종료 또는 cancel 엔드포인트) | `discussion-hub.service.ts:70` |

## 저장

| 용어 | 의미 | 위치 |
|---|---|---|
| Message | 저장된 발언. `scope='topic'`, `refId=topic.id`. `round`는 턴 인덱스 | `message.entity.ts:8` |
| RoomTopicStatus | 토픽 진행 상태: `open`·`running`·`completed`·`failed` | `room-topic.entity.ts:4` |

## RAG

| 용어 | 의미 | 위치 |
|---|---|---|
| rag_search | 에이전트가 근거 검색 시 호출하는 도구. `tool`/`source` 이벤트 발행 | `rag/rag.tool.ts` |
| buildToolsForAgent | 에이전트의 `tools` 키 목록을 실제 도구로 조립하는 레지스트리(미지정 시 `['rag_search']`, `[]`면 도구 없음) | `orchestrator/agent-tools.ts` |
