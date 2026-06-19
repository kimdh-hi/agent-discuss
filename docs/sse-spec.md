# SSE 스트리밍 스펙

discuss(멀티 에이전트 토론)의 실시간 스트리밍 인터페이스 계약. 토론의 모든 발언·진행 상태는 Server-Sent Events로 전달된다. 비-스트리밍 REST 엔드포인트는 [api-spec.md](./api-spec.md), 토론 동작 원리는 [discuss.md](./discuss.md)를 참고한다.

---

## 전송 메커니즘

### 와이어 포맷
`apps/be/src/common/sse.ts`

응답 헤더:
- `Content-Type: text/event-stream`
- `Cache-Control: no-cache, no-transform`
- `Connection: keep-alive`

각 이벤트는 다음 2줄 + 빈 줄로 구성된다.

```
event: <name>
data: <JSON>

```

- `data`는 항상 **1줄 JSON**이다(멀티라인 미지원).
- 인증/CORS/에러 코드는 REST와 동일하다([api-spec.md](./api-spec.md) 공통 규약).

### 스트림 개시 엔드포인트
세 엔드포인트 모두 내부적으로 `attachAndStream`을 호출한다(`apps/be/src/rooms/rooms.controller.ts`).

| Method · Path | 요청 body | 동작 |
|---|---|---|
| `POST rooms/:roomId/discuss` | `{ topic: string }` (1자 이상) | 새 topic 생성 후 토론 시작·스트림 |
| `POST rooms/:roomId/topics/:topicId/discuss` | `{ message: string }` (1자 이상) | 기존 topic 이어가기 후 스트림. `running`이면 `BAD_REQUEST(1002)` |
| `GET rooms/:roomId/topics/:topicId/stream` | 없음 | 진행 중 토론에 재연결(직전 이벤트 재생) |

### 구독 모델
- `DiscussionHubService`가 `topicId`별 RxJS `ReplaySubject<RoomEvent>`를 보유하고, 구독 측에는 `Observable`을 반환한다.
- 스트림이 없거나 이미 종료됐으면 즉시 `res.end()`로 닫는다(이벤트 0개).
- 클라이언트 연결 종료(`res.on('close')`) 시 서버는 구독을 해제한다.
- 프론트엔드는 `EventSource`가 아니라 `fetch` + `ReadableStream` 수동 파싱(`parseSse`)을 사용하므로 `Authorization` 헤더로 인증한다.

---

## 내부 이벤트 → 와이어 이벤트 매핑

`routeSse`(`apps/be/src/rooms/rooms.controller.ts`)가 내부 `RoomEvent`(`orchestrator.types.ts`)를 와이어 이벤트로 변환한다. **둘은 1:1이 아니다.**

- 내부 `turn_start` / `turn_end` → 와이어 단일 `turn` 이벤트(`phase: 'start' | 'end'`로 구분)
- 내부 `status.round`, `tool.round`는 와이어 전송 시 **누락**된다(전달 안 함)

---

## 와이어 이벤트 카탈로그

총 8종(`turn`은 `phase`로 start/end 구분).

### `status`
```typescript
{ phase: string; detail?: string }
```
노드 진행 알림. `phase` 값:

| phase | 발행 시점 |
|---|---|
| `validateTopic` | 주제 검토 시작 |
| `defineAgenda` | 토픽 분류 (유형 확정 포함) |
| `pickSpeaker` | 디렉터가 다음 발언자 선정 (`speaker-selector.service.ts`) |
| `checkCompletion` | 결론 보강을 위해 1턴 더 진행 |
| `draftDecision` | 쟁점 해소(converge) 시작 |
| `summary_degraded` | 최종 요약 실패로 임시 결론 표시 |

### `turn` (start)
```typescript
{ phase: 'start'; agentId?: string; agentName: string; round: number; role: 'moderator' | 'agent' }
```
발언 시작(`speaker.service.ts`). `round`는 턴 인덱스.

### `content`
```typescript
{ agentId?: string; text: string }
```
발언 토큰 스트리밍. 클라이언트는 해당 turn에 누적(append)한다.

### `tool`
```typescript
{ agentId?: string; name: string; args: Record<string, unknown> }
```
RAG 등 도구 호출(`speaker.service.ts`).

### `source`
```typescript
{ agentId?: string; hits: SearchHit[] }
```
검색 결과. `SearchHit`:
```typescript
{ documentId: string; filename: string; snippet: string; content: string; score: number }
```

### `turn` (end)
```typescript
{ phase: 'end'; agentId?: string }
```
발언 종료(`speaker.service.ts`).

### `final`
```typescript
{ text: string }
```
최종 결론 1회. `writeResult`(정상 종합)·`rejectTopic`(거부 사유)·`conclusion-writer`(fallback)에서 발행.

### `error`
```typescript
{ message: string }
```
스트림 에러. 내부 `error` 이벤트 외에 `attachAndStream`의 error 콜백도 이 이벤트로 응답한다.

### `done`
```typescript
{ ok: true }
```
정상 종료 직전 1회(`orchestrator.service.ts`).

---

## 라이프사이클 시퀀스

### 정상 토론
```
status(validateTopic)
status(defineAgenda)
[ 턴 반복 ]
  turn(start) → (tool / source)* → content* → turn(end)
  status(pickSpeaker)         // 디렉터 개입 시
status(draftDecision)         // converge
final
done
```

### 주제 거부
```
status(validateTopic) → final(거부 사유) → done
```

### 중단
```
POST .../cancel → 스트림 종료(done 또는 연결 close)
```

---

## 프론트엔드 소비 규칙
`consumeStream`(`apps/fe/src/components/RoomDiscussView.tsx`)

| 이벤트 | 처리 |
|---|---|
| `turn` (start) | 새 turn 아이템 생성 |
| `content` | 마지막 미완료 turn에 `text` append |
| `tool` | 해당 turn에 toolCall 부착 |
| `source` | 해당 turn에 sources 부착 |
| `turn` (end) | 해당 turn `done = true` |
| `status` | `phase === 'pickSpeaker'`이면 note로 표시, 그 외는 상태표시줄 |
| `final` | `finalText` 설정, topic `completed` |
| `error` | 에러 표시, topic `failed` |
| `done` | topic `completed` |

---

## 호환성 / 주의

- `data`는 항상 1줄 JSON이다. `parseSse`가 `data: (.*)` 단일 매칭으로 파싱하므로 멀티라인 페이로드는 지원하지 않는다.
- 재연결(`GET .../stream`) 시 `ReplaySubject` 특성상 이전 이벤트가 재생될 수 있다. 클라이언트는 멱등 누적을 전제로 동작해야 한다.
