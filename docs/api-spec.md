# REST API 스펙

discuss(멀티 에이전트 토론) 기능의 HTTP REST 인터페이스 계약. 라우트는 `apps/be/src/rooms/rooms.controller.ts` 기준이며, 스트리밍(SSE) 엔드포인트는 [sse-spec.md](./sse-spec.md)를 참고한다.

---

## 공통 규약

### Base prefix
- 프론트엔드는 모든 요청에 `/api` 프리픽스를 붙이고 Vite 프록시가 백엔드(포트 `3000`)로 전달한다(`apps/fe/src/lib/api.ts`).
- 백엔드 자체에는 global prefix가 없다(`apps/be/src/main.ts`).
- 본 문서의 경로는 **백엔드 라우트 기준**으로 적는다. 브라우저에서 호출할 때는 앞에 `/api`를 붙인다. 예: `POST /api/rooms/:roomId/topics`.

### 인증
- 모든 라우트는 `AuthGuard` + `WorkspaceMemberGuard`로 보호된다.
- `Authorization: Bearer <token>` 헤더 필수. 토큰 누락/무효 시 `401 UNAUTHORIZED(2001)`.
- 워크스페이스 비멤버 접근 시 `FORBIDDEN_NOT_MEMBER(2002)`.

### CORS
- 허용 origin: `http://localhost:3001`, `http://127.0.0.1:3001`.

### 요청 검증
- 요청 body는 zod 스키마(`zodBody`)로 검증한다. 위반 시 `VALIDATION_FAILED(1001)`.

### 에러 응답 형식
모든 에러는 `AllExceptionsFilter`(`apps/be/src/common/all-exceptions.filter.ts`)를 거쳐 다음 형식으로 응답한다.

```jsonc
{
  "errorCode": "3006",        // ErrorCode 문자열
  "message": "Topic을 찾을 수 없습니다.", // 사용자 메시지 또는 null
  "details": null              // BaseException일 때만 포함
}
```

- `BaseException`: UNAUTHORIZED 계열은 `401`, 그 외는 `400`.
- `HttpException`: 예외 자체의 status. `401`이면 `errorCode`는 `UNAUTHORIZED`, 그 외는 `VALIDATION_FAILED`.
- 미처리 예외: `500 INTERNAL(9999)`, `message`는 `null`.

### ErrorCode

| code | 이름 | 의미 |
|---|---|---|
| `1001` | VALIDATION_FAILED | 요청 검증 실패 |
| `1002` | BAD_REQUEST | 잘못된 요청(예: running topic 삭제) |
| `2001` | UNAUTHORIZED | 인증 실패 |
| `2002` | FORBIDDEN_NOT_MEMBER | 워크스페이스 비멤버 |
| `3001` | WORKSPACE_NOT_FOUND | 워크스페이스 없음 |
| `3002` | AGENT_NOT_FOUND | 에이전트 없음 |
| `3003` | ROOM_NOT_FOUND | room 없음 |
| `3004` | USER_NOT_FOUND | 사용자 없음 |
| `3005` | DATA_NOT_FOUND | 데이터 없음 |
| `3006` | TOPIC_NOT_FOUND | topic 없음 |
| `4001` | ROOM_HAS_NO_AGENTS | room에 에이전트 없음 |
| `4002` | FILE_TOO_LARGE | 파일 용량 초과 |
| `9999` | INTERNAL | 서버 내부 오류 |

---

## 엔드포인트

스트리밍 3종(`POST rooms/:roomId/discuss`, `POST rooms/:roomId/topics/:topicId/discuss`, `GET rooms/:roomId/topics/:topicId/stream`)은 본 문서에서 제외한다 → [sse-spec.md](./sse-spec.md).

### 1. room 생성
`POST workspaces/:wsId/rooms`

- 요청: `{ name: string, agentIds: string[] }` (`name` 1자 이상, `agentIds` 1개 이상)
- 응답: `Room`
- 비고: `agentIds`는 해당 워크스페이스 소유 에이전트로 필터링된다.

### 2. 워크스페이스 room 목록
`GET workspaces/:wsId/rooms`

- 응답: `Room[]` (`createdAt` 오름차순)

### 3. room 상세 + 참가 에이전트
`GET rooms/:roomId`

- 응답: `{ room: Room, agents: { id: string, name: string, model: string }[] }`

### 4. topic 목록
`GET rooms/:roomId/topics`

- 응답: `RoomTopic[]` (`createdAt` 내림차순)

### 5. topic 생성
`POST rooms/:roomId/topics`

- 요청: `{ title: string }` (1자 이상)
- 응답: `RoomTopic` (`status: 'open'`)

### 6. topic 메시지 이력
`GET rooms/:roomId/topics/:topicId/messages`

- 응답: `{ topic: RoomTopic, messages: TopicMessageDto[] }` (메시지 `createdAt` 오름차순)
- 에러: 미존재 topic → `TOPIC_NOT_FOUND(3006)`

### 7. 에이전트 추가
`POST rooms/:roomId/agents`

- 요청: `{ agentId: string }`
- 응답: `{ ok: true }`
- 비고: 이미 추가된 에이전트면 변경 없이 `ok: true`. 워크스페이스 소유가 아니면 `AGENT_NOT_FOUND(3002)`.

### 8. 에이전트 제거
`DELETE rooms/:roomId/agents/:agentId`

- 응답: `{ ok: true }` (링크 없어도 `ok: true`)

### 9. topic 삭제
`DELETE rooms/:roomId/topics/:topicId`

- 응답: `{ ok: true }` (해당 topic의 message도 함께 삭제)
- 에러: `running` 상태 topic 삭제 시 `BAD_REQUEST(1002)`. 미존재 topic → `TOPIC_NOT_FOUND(3006)`.

### 10. 진행 중 토론 중단
`POST rooms/:roomId/topics/:topicId/cancel`

- 응답: `{ ok: boolean }` (`ok`는 중단 대상 스트림 존재 여부)
- 에러: 미존재 topic → `TOPIC_NOT_FOUND(3006)`

---

## 데이터 모델

### Room
```typescript
{ id: string; workspaceId: string; name: string; createdAt: string }
```

### RoomTopic
```typescript
{
  id: string;
  roomId: string;
  title: string;
  status: 'open' | 'running' | 'completed' | 'failed';
  finalText?: string | null;     // 직전 토론의 최종 결론
  completedAt?: string | null;
  createdAt: string;
}
```

### TopicMessageDto
`apps/be/src/rooms/rooms.service.ts`

```typescript
{
  id: string;
  role: 'user' | 'agent' | 'moderator';
  agentId?: string;
  agentName?: string;   // moderator는 MODERATOR 상수, agent는 에이전트명
  round?: number;       // 라운드가 아니라 턴 인덱스
  content: string;
  createdAt: string;
}
```

> `round`는 라운드 번호가 아니라 **턴 인덱스**다(스키마 마이그레이션 회피, [glossary/discuss.md](./glossary/discuss.md) 참고).
