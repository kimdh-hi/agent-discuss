# agent-discuss

워크스페이스 기반 멀티 에이전트 PoC. 사용자가 워크스페이스 안에 **에이전트**(이름·지침·모델·전용 지식베이스)를 만들고, 단일 에이전트에 질의하거나, 여러 에이전트를 **룸(Room)** 으로 묶어 **오케스트레이터 주도 토론**을 진행한다.

**스택**: NestJS 11 · MikroORM 7(SQLite) · LangChain.js 1.x / LangGraph 1.x · Zod 4 · TypeScript 6 · Vite + React(프론트)

> Node.js 22 이상 필수. MikroORM 7 · LangChain 1.x · SQLite 드라이버가 ESM 전용이라 Node 22의 `require(esm)`이 필요하다.

---

## 주요 기능

### 워크스페이스 & 멀티테넌트
- 워크스페이스 단위로 모든 리소스(에이전트·룸·지식베이스·토론)가 격리된다.
- 생성자가 owner가 되며, 이메일로 멤버를 추가할 수 있다.
- `WorkspaceMemberGuard`가 라우트 파라미터로 소속 워크스페이스를 검증해 비멤버 접근을 차단한다.

### 에이전트
- **이름·지침·설명·모델**을 지정해 에이전트를 생성한다.
- 에이전트별 **RAG 지식베이스**를 보유한다. 문서를 적재하면 자동으로 청킹 · 임베딩 · 저장된다.
- 질의 시 `rag_search` 도구를 모델에 바인딩하고, 모델이 필요하다고 판단하면 업로드된 문서를 검색해 응답한다. 응답은 **SSE 스트리밍**으로 반환된다.

### 룸 토론 (LangGraph)
- 여러 에이전트를 룸으로 묶고 `topic`을 던지면 LangGraph `StateGraph`가 다음 흐름으로 토론을 진행한다.
  1. `validateTopic` — 토론 가능한 주제인지 검토
  2. `pickSpeaker` — 다음 발언자 또는 종료 여부 결정
  3. `speakTurn` — 한 턴에 에이전트 1명이 발언하고 다음 발언자 hand-off 제안
  4. `updateIssues → summarizeHistory` — 발언에서 쟁점을 갱신하고 오래된 대화를 압축
  5. `pickSpeaker → speakTurn` 루프 — hand-off가 유효하면 바로 다음 발언자로 연결하고, 지목이 없거나 교착되면 디렉터가 개입
  6. `draftDecision → checkCompletion → writeResult` — 쟁점을 해소해 결론 확정안을 만들고, 충족되면 최종 결론 종합
- 턴 상한은 현재 `참가자 수 × 3`, 최소 3턴으로 계산된다. 룸 생성 API에 별도 `maxRounds` 필드는 없다.
- 발언 · 상태 · 도구 호출 · 참고 지식 · 최종 결론이 **SSE 실시간 스트리밍**으로 전달된다. 자세한 동작은 [docs/discuss.md](docs/discuss.md)를 참고한다.

### RAG 파이프라인
- **임베딩**: `local`(결정적 해시, 키 불필요) / `openai` / `litellm` 전환 가능.
- **벡터 스토어**: RAG 전용 PostgreSQL + pgvector 커넥션을 사용한다.
- **문서 추출**: 텍스트 직접 적재 기본. `DOC_PARSE_MODEL` 설정 시 비전 전사 활성화, `GOTENBERG_BASE_URL` 설정 시 Office → PDF 변환 활성화.
- 문서 업로드는 원본 파일 저장 후 백그라운드로 추출 · 청킹 · 임베딩 · 색인을 진행한다.

### LLM 실행
- 현재 채팅/토론 LLM 경로는 LangChain `ChatOpenAI`를 사용한다.
- 에이전트 단일 질의는 에이전트별 `model` 값을 사용한다.
- 룸 토론에서 에이전트 발언은 에이전트별 `model` 값을 사용하고, 진행자 판단은 전역 `LLM_MODEL` 값을 사용한다.
- 도구 호출은 LangChain tool binding으로 `rag_search`를 모델에 노출한다.

### RAG 도구
- `rag_search`는 단일 에이전트 질의와 룸 토론 발언 모두에 자동 바인딩된다.
- 검색 결과가 있으면 SSE `source` 이벤트로 전달된다.

### 인증
- PoC용 `POST /auth/dev-login` — 이메일만으로 JWT 발급(없으면 User 자동 생성).
- 이후 모든 라우트는 `Authorization: Bearer <token>` 필요.

---

## 빠른 시작

```bash
# 1. 환경 변수 복사
cp apps/be/.env.example apps/be/.env

# 2. 의존성 설치 (루트에서)
npm install

# 3. 개발 서버 실행 (백엔드 + 프론트 동시)
npm run dev
```

브라우저에서 `http://localhost:4070` 접속 → 로그인 → 워크스페이스 생성 → 에이전트 생성 → 질의 / 룸 토론 확인.

### OpenAI 사용

`apps/be/.env`에서 아래만 변경하면 실제 OpenAI 모델로 동작한다(도구 function-calling · RAG 자율 호출 활성화).

```env
OPENAI_API_KEY=sk-...
LLM_MODEL=gpt-4o-mini
```

### RAG 인프라 (선택)

실 pgvector + gotenberg 변환을 사용하려면 Docker가 필요하다.

```bash
# 인프라 시작 (rag-postgres / gotenberg)
npm run infra:up

# 인프라 종료
npm run infra:down
```

그 다음 `apps/be/.env`에서 아래를 변경한다.

```env
EMBEDDINGS_PROVIDER=openai
OPENAI_API_KEY=sk-...
```

---

## API 엔드포인트

| 메서드 | 경로 | 설명 |
|---|---|---|
| POST | `/auth/dev-login` | `{email}` → JWT (없으면 User 자동 생성) |
| POST | `/workspaces` | 워크스페이스 생성 (생성자 = owner) |
| GET | `/workspaces` | 내가 멤버인 워크스페이스 목록 |
| POST | `/workspaces/:wsId/members` | `{email}` 멤버 추가 |
| POST | `/workspaces/:wsId/agents` | 에이전트 생성 `{name, instructions, model?, description?}` |
| GET | `/workspaces/:wsId/agents` | 에이전트 목록 |
| GET | `/agents/:agentId` | 에이전트 단건 조회 |
| DELETE | `/agents/:agentId` | 에이전트 삭제 |
| POST | `/agents/:agentId/documents` | `{text}` 지식베이스 적재 (청킹 · 임베딩) |
| POST | `/agents/:agentId/query` | `{message}` → **SSE** 단일 에이전트 응답 |
| POST | `/workspaces/:wsId/rooms` | 룸 생성 `{name, agentIds}` |
| GET | `/workspaces/:wsId/rooms` | 룸 목록 |
| GET | `/rooms/:roomId` | 룸 + 참여 에이전트 |
| POST | `/rooms/:roomId/agents` | `{agentId}` 룸에 에이전트 추가 |
| GET | `/rooms/:roomId/topics` | 룸 topic 목록 |
| POST | `/rooms/:roomId/topics` | topic 생성 `{title}` |
| GET | `/rooms/:roomId/topics/:topicId/messages` | topic 메시지 + 최종 결론 |
| POST | `/rooms/:roomId/topics/:topicId/discuss` | `{message}` → **SSE** topic 이어가기 |
| POST | `/rooms/:roomId/discuss` | `{topic}` → **SSE** 새 topic 생성 + 룸 토론 |

`/auth/dev-login` 외 모든 라우트는 `Authorization: Bearer <token>` 필요.  
`:wsId` / `:agentId` / `:roomId` 라우트는 멤버십 가드로 스코프된다.

---

## 아키텍처

```
apps/
├── be/                  # NestJS 백엔드
│   └── src/
│       ├── auth/        # dev 로그인(JWT) + AuthGuard + WorkspaceMemberGuard
│       ├── llm/         # LlmService — ChatOpenAI 기반 SSE 스트림
│       ├── rag/         # 문서 색인, pgvector 검색, rag_search 도구
│       ├── agents/      # 에이전트 CRUD + 단일 질의 (RAG 주입 + 도구 바인딩)
│       ├── orchestrator/# LangGraph StateGraph 룸 토론 오케스트레이터
│       ├── rooms/       # 룸 CRUD
│       └── workspaces/  # 워크스페이스 · 멤버십 관리
└── fe/                  # Vite + React 프론트엔드
```

- **해시 임베딩**: 문자 n-gram 기반 표면형 매칭. OpenAI 또는 LiteLLM 임베딩으로 교체하면 의미 검색으로 향상된다.
- **인증**: PoC용 dev 로그인만. 운영 인증·RBAC는 범위 외.

---

## 개발 명령어

```bash
npm run lint        # TypeScript 타입 체크 (tsc --noEmit)
npm run build       # NestJS 빌드 (SWC + 타입체크)
npm run test        # 단위 테스트
npm run test:e2e    # 전체 플로우 + 멤버십 스코프 e2e
```
