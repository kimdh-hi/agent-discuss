export interface SampleKnowledgeDocument {
  agentName: string;
  filename: string;
  content: string;
}

export const SAMPLE_KNOWLEDGE_DOCUMENTS: SampleKnowledgeDocument[] = [
  {
    agentName: "agent-discuss-PM",
    filename: "agent-discuss-pm.md",
    content: `# agent-discuss 제품 정의서 — PM

## 한 줄 정의
워크스페이스 기반 멀티 에이전트 PoC. 사용자가 워크스페이스 안에 에이전트(이름·지침·모델·전용 지식베이스)를 만들고, 단일 에이전트에 질의하거나 여러 에이전트를 룸(Room)으로 묶어 오케스트레이터 주도 토론을 진행한다.

## 제품의 4개 축
- 워크스페이스 & 멀티테넌트: 모든 리소스(에이전트·룸·지식베이스·토론)가 워크스페이스 단위로 격리. 생성자가 owner.
- 에이전트: 이름·지침(instructions)·설명·모델 + 에이전트별 RAG 지식베이스. 단일 질의 시 SSE 스트리밍 응답.
- RAG 지식베이스: 문서를 적재하면 자동 청킹·임베딩·저장. 모델이 필요하다고 판단하면 rag_search 도구로 검색.
- 룸 토론: 여러 에이전트를 룸으로 묶고 topic을 던지면 LangGraph가 오케스트레이터 주도로 토론을 진행하고 결론을 종합.

## PoC 범위 (Scope)
포함:
- dev 로그인(이메일만으로 JWT 발급), 워크스페이스 CRUD + 멤버 추가
- 에이전트 CRUD, 문서 적재, 단일 질의(SSE)
- 룸 CRUD, topic 생성/이어가기, 룸 토론(SSE 실시간 스트리밍)
- 에이전트 장기 메모리(토론 결과 누적), LangGraph 영속성

명시적 Non-goal (이번 PoC 범위 밖):
- 운영 인증·RBAC·SSO (dev 로그인만 제공)
- 과금/결제, 사용량 제한, 멀티 리전 배포
- 모바일 네이티브 앱, 외부 공개 API 게이트웨이

## 핵심 사용자 플로우 (데모 성공 기준)
1. POST /auth/dev-login 으로 로그인 → JWT 획득
2. 워크스페이스 생성 → owner 멤버십 자동 부여
3. 에이전트 2명 이상 생성 + 각 에이전트에 지식 문서 적재
4. 단일 에이전트 질의 → rag_search 자동 호출 + SSE 토큰 스트리밍 확인
5. 룸 생성(에이전트 묶기) → topic 던지기 → 다중 에이전트 토론 + 최종 결론 SSE 확인
"이 5단계가 끊김 없이 완주되는가"가 릴리즈 Go의 1차 기준이다.

## 기능 우선순위 (MoSCoW, PoC 기준)
- Must: 단일 질의 SSE, 룸 토론 전체 플로우, 워크스페이스 멤버십 격리, 문서 적재→검색.
- Should: 에이전트 장기 메모리, 토론 결론 영속화, 진행 상태 SSE 이벤트.
- Could: 임베딩 provider 전환(local/openai/litellm), 문서 비전 전사, Office→PDF 변환.
- Won't: RBAC, 과금, 모바일 앱, 운영 모니터링 대시보드.

## API 표면 (합의 근거로 사용)
- 인증: POST /auth/dev-login
- 워크스페이스: POST/GET /workspaces, POST /workspaces/:wsId/members
- 에이전트: POST/GET /workspaces/:wsId/agents, GET/DELETE /agents/:agentId
- 문서/질의: POST /agents/:agentId/documents, POST /agents/:agentId/query (SSE)
- 룸: POST/GET /workspaces/:wsId/rooms, GET /rooms/:roomId, POST /rooms/:roomId/agents
- topic: GET/POST /rooms/:roomId/topics, GET /rooms/:roomId/topics/:topicId/messages
- 토론: POST /rooms/:roomId/topics/:topicId/discuss (SSE), POST /rooms/:roomId/discuss (SSE, 새 topic)
- /auth/dev-login 외 전 라우트는 Authorization: Bearer 필요. :wsId/:agentId/:roomId 라우트는 멤버십 가드로 스코프.

## 룸 토론 제품 관점 정의
- 룸 생성 시 maxRounds 같은 필드는 없다. 턴 상한은 시스템이 "참가자 수 × 3, 최소 3턴"으로 자동 계산한다.
- 사용자는 topic(title)만 던진다. 발언자 선택·종료 판단·결론 작성은 오케스트레이터가 담당한다.
- 데모에서 사용자가 보는 것: 발언(누가/몇 라운드)·진행 상태·도구 호출(rag_search)·참고 지식(source)·최종 결론. 전부 SSE 이벤트.

## 의사결정 원칙
- 기술 난이도 논쟁은 "데모에서 사용자가 무엇을 보고 무엇을 경험하는가"로 재프레이밍한다.
- 범위 확장 요청은 Non-goal 목록과 대조해 차기 과제로 분리한다.
- PoC이므로 "운영 완성도"보다 "핵심 플로우 완주 + 설명 가능성"을 우선한다.`,
  },
  {
    agentName: "agent-discuss-BE",
    filename: "agent-discuss-be.md",
    content: `# agent-discuss 백엔드 아키텍처 — BE

## 기술 스택
- Runtime: Node.js 22+ (MikroORM 7·LangChain 1.x·SQLite 드라이버가 ESM 전용이라 require(esm) 필요)
- Framework: NestJS 11 (모듈 기반 DI)
- ORM: MikroORM 7 — 메인 SQLite + RAG PostgreSQL 두 커넥션
- LLM/그래프: LangChain.js 1.x, LangGraph 1.x (StateGraph), @langchain/openai(ChatOpenAI), @langchain/anthropic
- 영속성: @langchain/langgraph-checkpoint-postgres (토론 상태 체크포인트)
- 검증: Zod 4 (env 스키마·요청 파이프), 언어: TypeScript 6
- 문서 추출: pdfjs-dist, cheerio, fflate, @napi-rs/canvas
- 테스트: Jest + @swc/jest, e2e는 supertest

## 모듈 & 레이어링 (DDD)
모듈: auth, workspaces, agents, agent-rooms(룸+토론 오케스트레이터), rag, agent-memory, seed, common/ai/llm.
각 모듈은 레이어로 나뉜다:
- presentation: 컨트롤러, DTO, SSE 응답
- application: 서비스, 유스케이스 (discussion/ 하위에 토론 노드 서비스들)
- infrastructure: persistence(엔티티), langgraph 어댑터
- domain: 순수 타입·규칙(room, discussion 등)

## 데이터 접근 규칙 (프로젝트 강제 규약)
- 서비스/가드에 EntityManager를 직접 주입하지 않는다.
- MikroOrmModule.forFeature([Entity])로 모듈에 엔티티를 등록하고 @InjectRepository(Entity)로 EntityRepository<T>를 주입한다.
- RAG 커넥션(contextName 'rag') 엔티티는 @InjectRepository(Entity, 'rag')로 주입한다.
- EntityRepository에는 flush()가 없으므로 repo.getEntityManager().flush()를 사용한다.
- 코드에는 주석을 작성하지 않는다.

## 도메인 엔티티 (메인 SQLite)
- User(id, email, createdAt)
- Workspace(id, name, ownerUserId, createdAt)
- WorkspaceMember(id, workspaceId, userId, role, createdAt)
- Agent(id, workspaceId, name, instructions, description?, model, tools?: string[], maxToolIterations?, createdAt)
- Room(id, workspaceId, name, createdAt)
- RoomAgent(id, roomId, agentId, createdAt) — (roomId, agentId) unique, 룸↔에이전트 M:N 조인
- RoomTopic(id, roomId, title, status: open|running|completed|failed, finalText?, completedAt?, runState?: DiscussionSnapshot, createdAt)
- RoomTopicMessage(id, topicId, role: user|agent|moderator, agentId?, round?, content, createdAt)
- Message(id, scope: agent|room|topic, refId, role, agentId?, round?, content, createdAt)

## RAG 엔티티 (PostgreSQL + pgvector, 'rag' 커넥션)
- Document(id, agentId(index), uploadedById?, uploadedByName?, filename, mimeType, size, status: processing|ready|failed, stage?: extracting|embedding, storageKey?, error?, chunkCount, createdAt, deletedAt? = soft delete)
- DocumentChunk(id, documentId, content, embedding(vector, EMBEDDING_DIM 기본 1536), chunkIndex, createdAt)
- 인덱스: document_chunks_document_id, HNSW(embedding vector_cosine_ops), content GIN FTS(to_tsvector simple)

## RAG 파이프라인
1. POST /agents/:agentId/documents 로 텍스트/파일 적재 → 원본 저장(local-fs-storage, 기본 storage/rag)
2. 백그라운드 추출(extract): 텍스트 직접 적재 기본. DOC_PARSE_MODEL 설정 시 비전 전사, GOTENBERG_BASE_URL 설정 시 Office→PDF.
3. 청킹(@langchain/textsplitters) → 임베딩 → DocumentChunk 저장. status processing→ready, 실패 시 failed + error.
4. 검색: search.service가 HNSW 코사인 + FTS로 top-k(RAG_TOP_K 기본 5) 청크 반환. searchMany는 다중 쿼리 dedup.
5. rag_search 도구: 단일 질의·룸 토론 발언 모두에 자동 바인딩. 결과는 SSE source 이벤트로 노출.

## 임베딩 provider
- EMBEDDINGS_PROVIDER: local(결정적 해시 n-gram, 키 불필요·기본) | openai | litellm
- EMBEDDING_DIM 기본 1536. local은 표면형 매칭, openai/litellm으로 교체 시 의미 검색으로 향상.
- RAG_DATABASE_URL 기본 postgresql://agent_discuss:agent_discuss@localhost:5432/agent_discuss_rag (docker compose: pgvector/pgvector:pg17).

## LLM 실행 (common/ai/llm)
- LlmService.stream(): ChatOpenAI(model, temperature 0.4) 생성, tools 있으면 bindTools.
- 도구 루프: maxToolIterations(기본 5)까지 stream→tool_calls 감지→tool 실행→ToolMessage push 반복.
- StreamPart: text | tool_call | tool_result. LLM_PROVIDER=mock 이면 mockStream.
- 단일 질의: 에이전트별 model 사용. 룸 토론: 발언은 에이전트별 model, 진행자 판단은 전역 LLM_MODEL.

## 룸 토론 오케스트레이터 (LangGraph StateGraph)
흐름:
1. validateTopic — 토론 가능한 주제인지 검토
2. pickSpeaker — 다음 발언자 또는 종료 결정
3. speakTurn — 한 턴에 에이전트 1명 발언 + 다음 발언자 hand-off 제안
4. updateIssues → summarizeHistory — 발언에서 쟁점 갱신, 오래된 대화 압축
5. pickSpeaker → speakTurn 루프 — hand-off 유효하면 바로 연결, 교착이면 디렉터(moderator) 개입
6. draftDecision → checkCompletion → writeResult — 쟁점 해소 후 결론 확정안, 충족 시 최종 결론 종합
- 턴 상한: 참가자 수 × 3, 최소 3턴 (룸 API에 maxRounds 필드 없음).
- 핵심 서비스: speaker-selector, routing, turn, moderator, convergence-policy, conclusion-writer, topic-setup, discussion-brief, discussion-progress.

## 인증 & 가드
- POST /auth/dev-login: 이메일만으로 JWT 발급(없으면 User 자동 생성). 이후 전 라우트 Bearer 필요.
- AuthGuard(JWT) + WorkspaceMemberGuard: 라우트 파라미터의 워크스페이스 멤버십 검증 → 비멤버 차단.

## 응답 포맷 & SSE
- SSE는 HTTP 스트리밍(롱폴링) 채택, WebSocket 미사용(서버 상태 관리 불필요).
- 발언·상태·도구 호출·참고 지식(source)·최종 결론을 실시간 이벤트로 전달.

## 운영 명령
- npm run db-init: nest build 후 dist/db-init.js — 메인 SQLite 스키마 + sample-data/main.sql 적재.
- npm run rag-init: nest build 후 dist/rag-init.js — pgvector 스키마/인덱스 + 샘플 지식 색인.
- npm run lint(tsc --noEmit), npm run build(SWC), npm run test, npm run test:e2e, npm run infra:up/down.`,
  },
  {
    agentName: "agent-discuss-FE",
    filename: "agent-discuss-fe.md",
    content: `# agent-discuss 프론트엔드 가이드 — FE

## 기술 스택 (실제 구성)
- Framework: React 19 (react-dom 19)
- 번들러/dev 서버: Vite 6 (@vitejs/plugin-react), dev 포트 4070
- 언어: TypeScript 5.7
- 스타일링: Tailwind CSS v4 (@tailwindcss/vite 플러그인, index.css에서 로드)
- 클라이언트 상태: Zustand 5
- 마크다운 렌더링: react-markdown + remark-gfm
- 주의: Next.js·shadcn/ui·TanStack Query·Redux는 사용하지 않는다. 경량 SPA.

## 디렉터리 구성
- App.tsx, main.tsx, index.css
- components/: LoginPage, Sidebar, AgentChatView, AgentCreateModal, AgentEditModal, ChatInput, ChatMessageView, MessageMeta, DocsModal, RoomDiscussView, RoomCreateModal
- components/room/: room-runtime-store, room-state, room-typewriter, parse-room-command, room-topic-api
- lib/: api.ts(HTTP 클라이언트), types.ts(공유 타입), storage.ts(토큰), room-sse.ts(룸 SSE), markdown-typewriter.ts

## API 클라이언트 (lib/api.ts)
- BASE = '/api' (Vite dev proxy로 백엔드 연결)
- authHeaders(): localStorage 토큰을 Authorization: Bearer 로 부착, Content-Type application/json.
- apiFetch<T>(path, {method, body}): JSON 요청. 204면 undefined. 에러는 ApiError(status, message).
- apiUpload<T>(path, formData): multipart 업로드(문서 적재).
- apiStream(path, body, signal): SSE용 fetch Response 반환(POST + Bearer).
- 401 응답 시 handleError가 clearAuth() 후 window.location.reload() → 자동 재로그인 유도.

## 공유 타입 (lib/types.ts)
- User, Workspace, Agent(id,name,instructions,model,description?,workspaceId)
- Document(id, filename, status: processing|ready|failed, chunkCount, error?, stage?)
- AgentMemory(id, agentId, content, sourceTopicId, createdAt)
- Room, RoomTopic(status: open|running|completed|failed, finalText?, completedAt?, createdAt)
- RoomTopicMessage(role: user|agent|moderator, agentId?, agentName?, round?, content)
- RoomAgentSpec(id, name, model)
- ToolCall(name, args), SourceHit(filename, score)
- ChatMessage(role: user|assistant, content, toolCalls?, sources?, pending?)
- RoomTurn(agentId, agentName, round, role, content, toolCalls?, sources?, done)

## SSE 스트리밍 소비 (UI 핵심)
- 단일 질의(AgentChatView): apiStream으로 /agents/:id/query 응답을 받아 text 토큰을 누적, tool_call·source 메타를 ChatMessage에 부착.
- 룸 토론(RoomDiscussView): lib/room-sse.ts가 /rooms/:id/discuss(또는 topics/:id/discuss) SSE를 파싱해 RoomTurn 단위로 누적.
- 타이핑 효과: markdown-typewriter / room-typewriter가 토큰을 점진 렌더링. 완료 시 done=true.
- 이벤트 종류: 발언 텍스트, 진행 상태, 도구 호출(rag_search), 참고 지식(source: filename+score), 최종 결론.
- 중단 처리: AbortSignal로 진행 중 스트림 취소(화면 이탈·재요청 시).

## 상태 관리 (Zustand)
- room/room-runtime-store: 진행 중 토론의 라운드별 턴·상태를 런타임 보관.
- room/room-state: 룸/토픽 선택, 메시지 목록 등 화면 상태.
- 서버 상태 캐시 라이브러리 없음 → 필요 시 명시적 재요청. staleness는 수동 관리.

## 컴포넌트 책임
- LoginPage: 이메일 입력 → dev-login → 토큰 저장.
- Sidebar: 워크스페이스/에이전트/룸 네비게이션.
- AgentChatView + ChatInput + ChatMessageView + MessageMeta: 단일 에이전트 질의/응답, 도구·소스 메타 표시.
- AgentCreateModal / AgentEditModal: 에이전트 이름·지침·모델·설명 편집.
- DocsModal: 에이전트 지식 문서 적재/상태(processing/ready/failed) 표시.
- RoomDiscussView + RoomCreateModal: 룸 구성, topic 던지기, 다중 에이전트 토론 스트림 렌더링.

## 코드 컨벤션
- 파일명 kebab-case, 컴포넌트명 PascalCase.
- Tailwind 유틸리티 우선, 커스텀 CSS 신설 최소화.
- 모든 네트워크 호출은 lib/api.ts를 경유(직접 fetch 분산 금지).
- 주석은 작성하지 않는다(프로젝트 규약).`,
  },
  {
    agentName: "agent-discuss-QA",
    filename: "agent-discuss-qa.md",
    content: `# agent-discuss 품질 전략 — QA

## 테스트 구성 (실제 자산)
- 단위: Jest + @swc/jest. testRegex src/**/*.spec.ts. 비즈니스 로직·오케스트레이터 노드 검증.
- e2e: supertest, test/jest-e2e.json. 전체 플로우 + 워크스페이스 멤버십 스코프 검증.
- 실행: npm run test(단위), npm run test:e2e(e2e), npm run lint(tsc --noEmit), npm run build(SWC + 타입체크).

## 핵심 회귀 자산 (오케스트레이터 spec)
agent-rooms/application/discussion 하위 spec 들이 토론 품질의 안전망이다:
- speaker-selector.service.spec / speaker.spec — 다음 발언자 선택·hand-off 수용 규칙
- routing.service.spec — 발언자 라우팅, 교착 시 디렉터 개입
- convergence-policy.spec — 토론 수렴/종료 판정
- turn.service.spec — 한 턴 발언 생성, 라운드 증가, 도구 호출
- conclusion-writer.service.spec — 최종 결론 종합
- discussion.service.spec / discussion-state.spec / discussion-progress.spec — 전체 상태 전이·진행 이벤트
- topic-setup.spec / moderator.spec / parsers.spec / substantive.spec — 토픽 검증·진행자·파싱·실질 발언 판정

## 릴리즈 게이트 (Go/No-Go)
- lint(tsc --noEmit) 통과 (타입 에러 0)
- build(SWC) 성공
- 단위 테스트 100% 통과
- e2e 핵심 플로우 100% 통과 (로그인→워크스페이스→에이전트→질의→룸 토론)
- 멤버십 스코프 e2e 통과 (비멤버가 :wsId/:agentId/:roomId 접근 시 차단 확인)
- P0 버그 0건, P1 2건 이하

## 버그 심각도
- P0(Critical): 핵심 플로우 중단, 토론 무한 루프/미종료, 데이터 유실, 멤버십 격리 붕괴 → 즉시 수정.
- P1(High): 단일 질의/룸 토론 일부 동작 불가, SSE 스트림 중단, rag_search 미바인딩 → 당일 수정.
- P2(Medium): 특정 입력에서 발언 누락, 소스 메타 오표시, UI 깨짐 → 이번 사이클 내.
- P3(Low): 타이핑 렌더 미세 이슈, 오탈자, 로그 노이즈 → 백로그.

## 핵심 검증 시나리오 (Happy Path)
1. dev-login으로 JWT 발급 → 보호 라우트 접근 가능 확인.
2. 에이전트 생성 + 문서 적재 → status processing→ready 전이 확인.
3. 단일 질의 → rag_search 도구 호출 + source 이벤트 + text 스트림 수신 확인.
4. 룸 생성 + 2명 이상 에이전트 → topic 던지기 → 다중 발언 + 최종 결론(finalText) 생성 확인.
5. topic 이어가기(POST .../discuss) → 기존 컨텍스트 유지하며 토론 연장 확인.

## 엣지 케이스 (적극 발굴)
- 빈/모호한 토픽: validateTopic이 토론 불가로 처리하는가.
- 교착(hand-off 실패·지목 없음): 디렉터(moderator)가 개입해 진행을 이어가는가.
- 턴 상한: 참가자 수 × 3, 최소 3턴. 상한 도달 시 결론 작성으로 전이하는가(무한 루프 없음).
- 단일 참가자 룸: 최소 3턴 규칙과 발언자 선택이 깨지지 않는가.
- SSE 중단: 클라이언트 abort 후 서버 리소스/상태 정리, 재요청 시 일관성.
- 멤버십: 타 워크스페이스 사용자가 룸/에이전트/문서에 접근 시 가드 차단.
- 문서 처리 실패: status failed + error 메시지 노출, 검색 결과에서 제외.
- 임베딩 provider 차이: local(해시) vs openai 검색 품질·차원(EMBEDDING_DIM) 정합성.
- 영속성: 토론 중단 후 재개 시 LangGraph 체크포인트(runState) 복원 일관성.

## 비기능/회귀 관점
- 토론 종료 보장: 어떤 입력에서도 writeResult로 수렴해야 한다(미종료 = P0).
- 멱등/격리: 워크스페이스 단위 데이터 격리가 모든 신규 기능에서 유지되는가.
- 성능 회귀: 룸 토론 턴 수 증가가 상한 공식을 벗어나지 않는지.
- 비용 인식: 실제 LLM(openai) 사용 시 토론 1건당 토큰/호출 수를 가늠해 과도한 턴 상한을 경계.

## Go/No-Go 판단 원칙
- 검증 가능성 우선: 재현 절차가 없는 주장은 게이트 근거로 채택하지 않는다.
- PoC라도 "핵심 5단계 플로우 완주 + 토론 종료 보장"은 타협 불가 기준으로 본다.`,
  },
];
