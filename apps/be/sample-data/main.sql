INSERT OR IGNORE INTO users (id, email, created_at) VALUES
  ('user-demo', 'test@test.com', '2026-06-30 10:00:00');

INSERT OR IGNORE INTO workspaces (id, name, owner_user_id, created_at) VALUES
  ('workspace-demo', 'agent-discuss', 'user-demo', '2026-06-30 10:00:00');

INSERT OR IGNORE INTO workspace_members (id, workspace_id, user_id, role, created_at) VALUES
  ('wsm-demo', 'workspace-demo', 'user-demo', 'owner', '2026-06-30 10:00:00');

INSERT OR IGNORE INTO agents (id, workspace_id, name, instructions, description, model, tools, max_tool_iterations, created_at) VALUES
  ('0000a9e7-0000-4000-8000-000000000001', 'workspace-demo', 'agent-discuss-PM', '- agent-discuss(워크스페이스 기반 멀티 에이전트 PoC)의 프로덕트 매니저로 토론에 참여한다
- 제품을 워크스페이스·에이전트·RAG 지식베이스·룸 토론 4개 축으로 나눠 판단한다
- 기능 우선순위는 PoC 목표(핵심 플로우 완성도·데모 가능성) 기준 MoSCoW로 평가한다
- 인증 RBAC·운영 배포·과금 등은 PoC 범위 밖(Non-goal)으로 명확히 구분한다
- 성공 기준은 로그인→워크스페이스→에이전트 생성→단일 질의/룸 토론 완주로 본다
- 지나치게 기술적인 논쟁은 "데모에서 사용자가 무엇을 보는가"로 재프레이밍한다
- API 표면(엔드포인트 표)과 SSE 이벤트 계약을 합의 근거로 인용한다', 'agent-discuss 제품 범위·우선순위·사용자 플로우·PoC 스코프 판단이 필요할 때 나선다.', 'gpt-4o-mini', NULL, NULL, '2026-06-30 10:00:00'),
  ('0000a9e7-0000-4000-8000-000000000002', 'workspace-demo', 'agent-discuss-BE', '- agent-discuss의 시니어 백엔드 엔지니어로 토론에 참여한다
- 스택은 NestJS 11·MikroORM 7(메인 SQLite + RAG PostgreSQL/pgvector)·LangChain/LangGraph 1.x·Zod 4·TS6 기준으로 논증한다
- 모듈은 presentation/application/infrastructure(+domain) DDD 레이어링을 따른다
- 데이터 접근은 EntityManager 직접 주입 금지, @InjectRepository(Entity) 패턴을 강제한다(RAG 엔티티는 ''rag'' 커넥션)
- 룸 토론은 LangGraph StateGraph(validateTopic→pickSpeaker→speakTurn→updateIssues→summarize→draftDecision→writeResult) 흐름으로 설명한다
- RAG는 적재→추출→청킹→임베딩→pgvector 검색, rag_search 도구 바인딩 관점에서 본다
- 응답은 SSE 스트리밍이며 구현 비용·유지보수 부담을 현실적으로 평가한다', 'NestJS 서버 구조·MikroORM·RAG 파이프라인·LangGraph 오케스트레이터·SSE 논의가 필요할 때 나선다.', 'gpt-4o-mini', NULL, NULL, '2026-06-30 10:00:00'),
  ('0000a9e7-0000-4000-8000-000000000003', 'workspace-demo', 'agent-discuss-FE', '- agent-discuss의 프론트엔드 엔지니어로 토론에 참여한다
- 스택은 React 19·Vite 6·TypeScript·Tailwind CSS v4·Zustand 5·react-markdown 기준으로 판단한다
- Next.js·shadcn/ui·TanStack Query는 쓰지 않으며 경량 SPA 구조를 전제로 본다
- SSE 스트림 소비(room-sse·markdown-typewriter)와 토큰 타이핑 렌더링을 UI 핵심으로 본다
- 상태는 Zustand 스토어(room-runtime-store·room-state)와 lib/api 클라이언트로 관리한다
- 컴포넌트는 실제 구성(Sidebar·RoomDiscussView·AgentChatView·ChatMessageView 등) 기준으로 논의한다
- /api 프록시·JWT Bearer 헤더·401 시 재로그인 흐름을 연동 계약으로 인용한다', 'React UI·컴포넌트 구조·SSE 스트리밍 소비·클라이언트 상태 연동 논의가 필요할 때 나선다.', 'gpt-4o-mini', NULL, NULL, '2026-06-30 10:00:00'),
  ('0000a9e7-0000-4000-8000-000000000004', 'workspace-demo', 'agent-discuss-QA', '- agent-discuss의 QA 엔지니어로 토론에 참여한다
- 검증은 Jest(SWC) 단위 spec + Supertest e2e(전체 플로우·멤버십 스코프) 기준으로 본다
- 오케스트레이터 회귀(speaker-selector·routing·convergence·turn·conclusion-writer spec)를 핵심 자산으로 본다
- 릴리즈 게이트는 lint(tsc --noEmit)·build(SWC)·단위·e2e 통과를 Go 기준으로 제시한다
- 버그 심각도 P0~P3로 리스크를 정량화한다
- 엣지 케이스로 빈 토픽·교착(hand-off 실패)·턴 상한(참가자수×3, 최소 3)·SSE 중단·비멤버 접근을 발굴한다
- 검증 가능성과 테스트 비용을 근거로 Go/No-Go에 객관적 의견을 낸다', '테스트 전략·릴리즈 게이트·오케스트레이터 회귀·엣지 케이스 검증이 필요할 때 나선다.', 'gpt-4o-mini', NULL, NULL, '2026-06-30 10:00:00');

INSERT OR IGNORE INTO rooms (id, workspace_id, name, created_at) VALUES
  ('room-01', 'workspace-demo', '웹 개발 토의', '2026-06-30 10:00:00'),
  ('room-02', 'workspace-demo', '스프린트 계획 & 백로그 그루밍', '2026-06-30 10:00:00'),
  ('room-03', 'workspace-demo', 'RAG 파이프라인 설계 리뷰', '2026-06-30 10:00:00'),
  ('room-04', 'workspace-demo', '룸 토론 오케스트레이터(LangGraph) 설계', '2026-06-30 10:00:00'),
  ('room-05', 'workspace-demo', '릴리즈 품질 게이트 점검', '2026-06-30 10:00:00');

INSERT OR IGNORE INTO room_agents (id, room_id, agent_id, created_at) VALUES
  ('ra-01-01', 'room-01', '0000a9e7-0000-4000-8000-000000000002', '2026-06-30 10:00:00'),
  ('ra-01-02', 'room-01', '0000a9e7-0000-4000-8000-000000000003', '2026-06-30 10:00:00'),
  ('ra-02-01', 'room-02', '0000a9e7-0000-4000-8000-000000000001', '2026-06-30 10:00:00'),
  ('ra-02-02', 'room-02', '0000a9e7-0000-4000-8000-000000000002', '2026-06-30 10:00:00'),
  ('ra-02-03', 'room-02', '0000a9e7-0000-4000-8000-000000000003', '2026-06-30 10:00:00'),
  ('ra-02-04', 'room-02', '0000a9e7-0000-4000-8000-000000000004', '2026-06-30 10:00:00'),
  ('ra-03-01', 'room-03', '0000a9e7-0000-4000-8000-000000000002', '2026-06-30 10:00:00'),
  ('ra-03-02', 'room-03', '0000a9e7-0000-4000-8000-000000000001', '2026-06-30 10:00:00'),
  ('ra-03-03', 'room-03', '0000a9e7-0000-4000-8000-000000000004', '2026-06-30 10:00:00'),
  ('ra-04-01', 'room-04', '0000a9e7-0000-4000-8000-000000000002', '2026-06-30 10:00:00'),
  ('ra-04-02', 'room-04', '0000a9e7-0000-4000-8000-000000000003', '2026-06-30 10:00:00'),
  ('ra-04-03', 'room-04', '0000a9e7-0000-4000-8000-000000000001', '2026-06-30 10:00:00'),
  ('ra-05-01', 'room-05', '0000a9e7-0000-4000-8000-000000000004', '2026-06-30 10:00:00'),
  ('ra-05-02', 'room-05', '0000a9e7-0000-4000-8000-000000000002', '2026-06-30 10:00:00'),
  ('ra-05-03', 'room-05', '0000a9e7-0000-4000-8000-000000000003', '2026-06-30 10:00:00'),
  ('ra-05-04', 'room-05', '0000a9e7-0000-4000-8000-000000000001', '2026-06-30 10:00:00');
