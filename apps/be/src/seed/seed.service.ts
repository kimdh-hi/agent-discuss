import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { EntityRepository } from '@mikro-orm/core';
import { InjectRepository } from '@mikro-orm/nestjs';
import { Agent, Room, RoomAgent, User, Workspace, WorkspaceMember } from '../entities';
import { RagService } from '../rag/rag.service';

const SEED_EMAIL = 'test@test.com';
const SEED_WORKSPACE = 'demo';
const DEFAULT_MODEL = 'gpt-4o-mini';

const AGENTS: { name: string; instructions: string; description: string }[] = [
  {
    name: 'PM',
    instructions:
      'IT 회사의 프로덕트 매니저로서 토론에 참여한다. 사용자 요구사항과 비즈니스 가치를 최우선으로 판단하며, 기능의 필요성과 우선순위를 MoSCoW 프레임워크 기준으로 평가한다. 스프린트 목표와 출시 일정 현실성을 검토하고, 지나치게 기술적인 논의는 사용자 가치 중심으로 재프레이밍한다. 데이터 기반 의사결정을 선호하며 DAU·NPS·전환율 등 제품 KPI를 근거로 주장한다.',
    description: '요구사항·사용자 스토리·우선순위·출시 일정 판단이 필요할 때 나선다.',
  },
  {
    name: '백엔드 엔지니어',
    instructions:
      'IT 회사의 시니어 백엔드 엔지니어로서 토론에 참여한다. NestJS·MikroORM·PostgreSQL 기반 서버 아키텍처와 API 설계에 전문성을 갖추고 있다. 기술적 타당성·성능 SLA·확장성 관점에서 의견을 제시하며, ADR(아키텍처 결정 기록) 근거로 설계 결정을 논증한다. 구현 비용과 유지보수 부담을 현실적으로 평가하고 cursor 기반 페이지네이션·UUID v7 등 구체적 기술 선택의 이유를 설명한다.',
    description: '서버 아키텍처·API 설계·DB 스키마·성능/확장성 논의가 필요할 때 나선다.',
  },
  {
    name: '프론트엔드 엔지니어',
    instructions:
      'IT 회사의 프론트엔드 엔지니어로서 토론에 참여한다. Next.js 14 App Router·shadcn/ui·TanStack Query 기반 UI 개발과 Core Web Vitals 최적화에 집중한다. Atomic Design 원칙과 접근성(WCAG 2.1 AA) 기준에서 컴포넌트 설계를 평가하며, 번들 크기·FCP·LCP 등 측정 가능한 지표로 성능 논의를 이끈다. 서버 컴포넌트와 클라이언트 컴포넌트 분리 원칙을 토론에서 명확히 짚는다.',
    description: 'UI/UX·컴포넌트 설계·클라이언트 성능·접근성 논의가 필요할 때 나선다.',
  },
  {
    name: '모바일 엔지니어',
    instructions:
      'IT 회사의 모바일 엔지니어로서 토론에 참여한다. React Native(New Architecture)·Expo EAS Build 기반으로 iOS·Android 앱을 개발한다. 앱스토어 심사 정책·OTA 업데이트·푸시 알림 권한 전략·앱 크래시 대응 절차에 밝다. 플랫폼별 차이(iOS Info.plist 권한 문구, Android targetSdkVersion 정책)를 구체적으로 짚고, 웹과 모바일 간 코드 공유 전략을 논의에서 대변한다.',
    description: 'iOS/Android·앱스토어·푸시 알림·모바일 UX·OTA 업데이트 논의가 필요할 때 나선다.',
  },
  {
    name: 'QA 엔지니어',
    instructions:
      'IT 회사의 QA 엔지니어로서 토론에 참여한다. 테스트 피라미드(단위 70%/통합 20%/E2E 10%) 전략과 릴리즈 게이트 기준 수립에 전문화되어 있다. 버그 심각도(P0~P3) 분류 기준으로 리스크를 정량화하고, 경계값·오프라인·다크모드 등 엣지 케이스를 발굴한다. 기능의 검증 가능성과 테스트 비용을 현실적으로 평가하며 Go/No-Go 판단에 객관적 근거를 제시한다.',
    description: '품질 기준·테스트 전략·릴리즈 게이트·엣지 케이스 검증이 필요할 때 나선다.',
  },
  {
    name: '인사팀 담당자',
    instructions:
      '회사 인사팀 담당자로서 토론에 참여한다. 채용 프로세스(서류→코딩테스트→기술면접→컬처핏→처우협의)·온보딩 30/60/90일 플랜·연 2회 성과 평가 제도(S/A/B/C 등급)를 운영한다. 복리후생(연차·재택·자기계발비)과 인력 계획(헤드카운트 조정, 직급 밴드)에 대한 현실적 제약을 논의에서 대변한다. 조직 문화와 직원 경험 관점에서 정책 변경의 영향을 평가한다.',
    description: '채용·온보딩·성과평가·복리후생·인력 계획 논의가 필요할 때 나선다.',
  },
  {
    name: '총무팀 담당자',
    instructions:
      '회사 총무팀 담당자로서 토론에 참여한다. 비품 구매 결재 프로세스(50만원 미만 팀장 결재·이상 대표 결재)·장비 관리 정책(지급 기준·교체 주기·반납 절차)·외부 벤더 계약 관리를 담당한다. 직원 복지 프로그램(동호회·건강검진·간식)과 사무환경 운영 현실을 논의에서 구체적으로 짚는다. 행정 처리 소요 시간과 규정 준수 요건을 이유로 무리한 요구에 현실적 한계를 제시한다.',
    description: '사무환경·비품·시설관리·복지 프로그램·외부 벤더 계약 논의가 필요할 때 나선다.',
  },
  {
    name: '회계팀 담당자',
    instructions:
      '회사 회계팀 담당자로서 토론에 참여한다. 경비 청구 절차(ERP 입력→팀장 승인→회계팀 검토→지급 10일/25일)·부서별 예산 편성 및 집행 현황·월말 결산 마감 일정을 운영한다. 세무(부가세·원천세·법인세) 신고 일정과 세금계산서 수취 기한 규정을 근거로 정책 변경의 세무 리스크를 평가한다. 비용 절감 목표와 예산 초과 시 승인 절차를 논의에서 명확히 제시한다.',
    description: '예산·경비정산·재무보고·세무·원가절감 논의가 필요할 때 나선다.',
  },
  {
    name: '마케팅 담당자',
    instructions:
      'B2B SaaS 회사의 마케팅 담당자로서 토론에 참여한다. 제품 출시 캠페인·고객 커뮤니케이션·Go-to-Market 전략을 담당한다. 배포 일정이 외부 공지·런치 캠페인·고객 이메일 발송 타이밍과 어떻게 연결되는지 논거로 제시한다. MQL·SQL·CAC·LTV 등 B2B 마케팅 지표를 근거로 기능 출시 우선순위를 평가하며, 고객 이탈 리스크와 브랜드 신뢰 훼손 관점에서 배포 결정의 비즈니스 임팩트를 대변한다.',
    description: '출시 캠페인·고객 공지·마케팅 일정·Go-to-Market 논의가 필요할 때 나선다.',
  },
  {
    name: '영업 담당자',
    instructions:
      'B2B SaaS 회사의 영업 담당자로서 토론에 참여한다. 고객 약속·계약 갱신 일정·엔터프라이즈 데모 스케줄을 대변한다. 배포 지연이나 기능 결함이 파이프라인 딜 클로징, 고객 SLA 위반, 계약 이탈로 이어지는 위험을 수치로 제시한다. ARR·Churn·NRR 지표를 근거로 배포 Go/No-Go 결정이 영업에 미치는 직접 영향을 논의에서 대변한다.',
    description: '고객 약속·계약 갱신·영업 파이프라인·SLA 준수 논의가 필요할 때 나선다.',
  },
];

const ROOMS: { name: string; agentNames: string[] }[] = [
  {
    name: '스프린트 계획 회의',
    agentNames: ['PM', '백엔드 엔지니어', '프론트엔드 엔지니어', '모바일 엔지니어', 'QA 엔지니어'],
  },
  {
    name: '기능 개발 리뷰',
    agentNames: ['PM', '백엔드 엔지니어', '프론트엔드 엔지니어'],
  },
  {
    name: '모바일 릴리즈 준비',
    agentNames: ['모바일 엔지니어', 'QA 엔지니어', 'PM'],
  },
  {
    name: '연간 예산 계획 회의',
    agentNames: ['인사팀 담당자', '총무팀 담당자', '회계팀 담당자'],
  },
  {
    name: '복지제도 개선 검토',
    agentNames: ['인사팀 담당자', '총무팀 담당자'],
  },
  {
    name: '경비 정산 프로세스 개선',
    agentNames: ['총무팀 담당자', '회계팀 담당자'],
  },
  {
    name: '배포 전 최종 점검 회의',
    agentNames: ['PM', '백엔드 엔지니어', '프론트엔드 엔지니어', 'QA 엔지니어', '마케팅 담당자', '영업 담당자'],
  },
];

const AGENT_KNOWLEDGE: Record<string, string> = {
  PM: `# 제품 개발 운영 가이드 — PM

## 스프린트 계획 프로세스
스프린트 주기: 2주 (월요일 시작, 금요일 스프린트 리뷰)
- 스프린트 계획(Planning): 스프린트 1일차 오전, 최대 4시간
- 데일리 스탠드업: 매일 오전 10시, 15분 이내
- 스프린트 리뷰: 스프린트 마지막 날 오후, 1시간
- 회고(Retrospective): 리뷰 직후, 45분

## 백로그 우선순위 프레임워크 (MoSCoW)
- Must Have: 출시 기준이 되는 P0 기능. 없으면 릴리즈 불가.
- Should Have: 높은 비즈니스 가치. 이번 릴리즈에 포함 목표.
- Could Have: 있으면 좋지만 제거해도 릴리즈 가능.
- Won't Have: 이번 릴리즈 범위 밖. 차기 로드맵으로 이동.

## 스토리 포인트 기준
- 1pt: 1~2시간 내 완료 (설정값 변경, 문구 수정)
- 2pt: 반나절 (단일 API 수정, UI 컴포넌트 1개)
- 3pt: 1일 (새 API 엔드포인트 + 단순 UI)
- 5pt: 2~3일 (신규 기능 개발)
- 8pt: 스프린트 하나를 대부분 차지. 8pt 이상은 에픽으로 분리.
- 스프린트 팀 총 velocity 기준: 40~50pt (개발자 4인 기준)

## 제품 핵심 KPI
- DAU(일간 활성 사용자): 목표 500명 (3개월 내)
- 기능 채택률: 신기능 출시 후 2주 내 DAU 30% 이상 사용
- NPS(순고객추천지수): 40 이상 유지
- 스프린트당 신규 P1 버그: 3건 이하
- 출시 지연률: 스프린트 약속 기능의 90% 이상 납기 준수

## 현재 분기 로드맵 (Q3)
- 7월: 소셜 로그인(Google/Apple) 완성, 워크스페이스 CRUD, 채팅 SSE 스트리밍
- 8월: RAG 문서 업로드 + 벡터 검색, 모바일 앱 iOS 베타 출시
- 9월: Android 앱 정식 출시, 결제 시스템 연동, 관리자 대시보드

## 사용자 스토리 작성 규칙
형식: "나는 [역할]로서 [기능]을 원한다. 왜냐하면 [이유]이기 때문이다."
인수 조건(AC): Given/When/Then 형식으로 3개 이상 작성.
정의완료(DoD): 코드 리뷰 완료 + QA 승인 + 문서 업데이트 + 스테이징 배포.

## 배포 관리 및 릴리즈 프로세스

### 릴리즈 주기
- 정기 배포: 격주 (스프린트 종료 다음 영업일 새벽 2~4시)
- 긴급 핫픽스: P0 버그 확인 즉시, PM + 팀장 구두 승인 후 진행
- 배포 공지: 서비스 영향 있는 배포 24시간 전 사용자 이메일 발송

### Go/No-Go 의사결정 권한
- 최종 Go/No-Go 결정권: PM (기술 판단은 백엔드·QA 의견 수렴 후 PM이 결정)
- No-Go 후 재배포: 원인 해소 확인 후 최소 24시간 뒤 재시도
- 롤백 지시 권한: PM 또는 온콜 엔지니어 (에러율 5% 초과 3분 지속 시 자동 판단)

### 점진 배포(Canary) 및 Feature Flag 정책
- 점진 롤아웃: 1% → 10% → 30% → 100% (각 단계 최소 30분 모니터링)
- Feature Flag: LaunchDarkly 사용, PM이 플래그 ON/OFF 권한 보유
- Kill Switch: P0 이슈 발생 시 PM 승인 없이 엔지니어가 즉시 플래그 OFF 가능

### 배포 후 PM 모니터링 항목 (24시간)
- DAU 이탈 여부 (전일 대비 10% 이상 감소 시 원인 파악)
- 신기능 채택률 (배포 후 48시간 내 DAU 30% 이상 사용 목표)
- 사용자 CS 인입 건수 (이전 주 동일 시간대 대비 200% 초과 시 알림)
- NPS 점수 변동 (주간 NPS 40 미만 진입 시 원인 분석 착수)

### 현재 릴리즈 현황 (v2.1.0)
- 배포 예정: 2026-06-25(목) 02:00
- 주요 기능: RAG 문서 업로드 비동기 처리, 벡터 검색 API
- 사전 공지 발송 완료: 2026-06-24(수) 18:00
- Q3 로드맵 연계: 8월 iOS 베타 출시를 위한 RAG 백엔드 필수 선행 조건`,

  '백엔드 엔지니어': `# 백엔드 기술 아키텍처 문서

## 기술 스택
- Runtime: Node.js 22 LTS
- Framework: NestJS 10 (모듈 기반 DI)
- ORM: MikroORM 6 (PostgreSQL 드라이버, Unit of Work 패턴)
- 메시지 큐: BullMQ (Redis 기반, 파일 처리 비동기화)
- 캐시: Redis 7 (세션, Rate Limit, 조회 캐시)
- 파일 스토리지: S3 호환 오브젝트 스토리지 (MinIO 로컬 / AWS S3 프로덕션)
- 컨테이너: Docker + Kubernetes (EKS), HPA 적용 (CPU 70% 임계값)

## API 설계 원칙
- REST 컨벤션: 리소스 중심 URL, 동사 금지 (GET /users, not GET /getUsers)
- 응답 포맷 통일: { data: T, meta?: PaginationMeta, error?: ErrorDto }
- HTTP 상태 코드: 200(조회), 201(생성), 204(삭제), 400(검증실패), 401(미인증), 403(권한없음), 404(미존재), 422(비즈니스룰위반), 429(과호출)
- API 버저닝: URL 경로 방식 /v1/. Breaking change 시 /v2/ 신설, /v1/ 최소 6개월 병행 운영.
- 페이지네이션: cursor 기반 (offset 방식 금지 — 대규모 데이터 성능 저하)

## DB 스키마 주요 원칙
- PK: UUID v7 (시간 정렬 가능, 인덱스 단편화 최소화)
- Soft Delete: deleted_at 컬럼 사용. 실제 삭제 금지.
- 감사 컬럼: created_at, updated_at 모든 테이블 필수.
- 외래키: DB 레벨 FK 제약 사용 (ORM 레벨만으로 불충분).
- 인덱스 전략: 조회 빈도 높은 컬럼 복합 인덱스, EXPLAIN ANALYZE로 쿼리 플랜 검증 필수.
- 벡터 컬럼: pgvector HNSW 인덱스 (vector_cosine_ops), 차원 수 3072 (text-embedding-3-large 기준).

## 아키텍처 결정 사항 (ADR)
- ADR-001: ORM으로 TypeORM 대신 MikroORM 채택 → Unit of Work 패턴, Identity Map 내장으로 N+1 문제 방지.
- ADR-002: 파일 업로드 처리를 BullMQ 비동기 큐로 처리 → 업로드 요청 타임아웃 방지.
- ADR-003: LLM 호출은 별도 llm.service로 격리 → Provider 변경 시 영향 범위 최소화.
- ADR-004: SSE 스트리밍은 HTTP 롱폴링 채택, WebSocket 미사용 → 서버 상태 관리 불필요.

## 성능 SLA
- API P95 응답시간: 200ms 이하 (LLM 제외)
- LLM SSE 첫 토큰 도달(TTFT): 3초 이하
- DB 커넥션 풀: PgBouncer 최대 100 커넥션
- 캐시 히트율: 주요 조회 API 70% 이상

## 배포 절차 및 인프라 운영

### 배포 환경 및 파이프라인
- 환경 순서: 로컬 → 스테이징(staging.agent-discuss.internal) → 프로덕션(agent-discuss.io)
- 스테이징 배포: main 브랜치 머지 시 GitHub Actions 자동 배포
- 프로덕션 배포: GitHub Actions workflow_dispatch 수동 트리거 (엔지니어 승인 필수)
- 무중단 배포: Kubernetes Rolling Update (maxUnavailable: 0, maxSurge: 1)
- 배포 소요 시간: 이미지 빌드 4분 + 롤링 업데이트 3분 = 총 약 7분

### DB 마이그레이션 가이드라인
- 인덱스 추가: CREATE INDEX CONCURRENTLY 사용 (테이블 Lock 없음, 권장)
- Lock 유발 작업(컬럼 추가·타입 변경): 유지보수 시간(새벽 2~4시) 한정 실행
- 마이그레이션 검증: 스테이징에서 실행 시간 측정 후 프로덕션 예상 소요 산정
- 롤백 스크립트: 모든 마이그레이션에 down 스크립트 작성 필수
- 현재 예정 마이그레이션(v2.1.0): document_chunks 테이블 HNSW 인덱스 추가 — 예상 5분, Lock 발생 → 해당 시간 검색 API 503 응답

### Feature Flag 운영 (LaunchDarkly)
- 네이밍 규칙: {feature}-{version} (예: rag-upload-v2, social-login-v1)
- 점진 활성화: 1% → 10% → 30% → 100% (각 단계 30분 모니터링)
- Kill Switch: P0 이슈 발생 시 플래그 OFF로 서비스 영향 즉시 격리
- 플래그 정리: 100% 전환 후 다음 스프린트 내 코드에서 제거 (기술 부채 방지)

### BullMQ 큐 운영 및 배포 절차
- 배포 전 확인: ACTIVE 작업 0건 확인 (WAITING은 배포 후 자동 재개)
- Worker graceful shutdown: 진행 중 작업 완료 후 종료, 최대 30초 대기
- 배포 전 큐 pause: 대량 작업 처리 중일 경우 queue.pause() 후 배포
- 현황(v2.1.0 배포 전): Redis 큐 잔여 작업 12건 → drain 또는 pause 필요

### 롤백 기준 및 절차
1. 에러율 5% 초과 3분 지속 → 즉시 롤백 시작
2. P0 버그 확인 → PM 보고 후 롤백 실행 (PM 부재 시 온콜 엔지니어 자체 판단 가능)
3. 롤백 방법: 이전 Docker 이미지로 Kubernetes deployment 재배포 (소요 약 3분)
4. DB 롤백: migration down 실행 (Lock 유발 작업 포함 시 영향도 재검토)
5. 롤백 후: 원인 분석 RCA 문서 작성 + 48시간 내 재배포 계획 수립

### 모니터링 대시보드
- 에러율: Sentry (임계값 1% → Slack #alerts 채널 알림)
- API 응답시간: Datadog APM (P95 > 500ms → PagerDuty 알림)
- 인프라: AWS CloudWatch (CPU > 70% → HPA 스케일 아웃)
- 큐 상태: Bull Dashboard (내부망 admin.agent-discuss.internal/queues)`,

  '프론트엔드 엔지니어': `# 프론트엔드 개발 가이드

## 기술 스택
- Framework: Next.js 14 (App Router)
- 언어: TypeScript 5
- UI 컴포넌트: shadcn/ui (Radix UI 기반, 소스 직접 소유)
- 스타일링: Tailwind CSS 3
- 서버 상태: TanStack Query v5 (staleTime 5분, gcTime 30분)
- 클라이언트 상태: Zustand v4
- 폼 관리: React Hook Form + Zod
- 번들러: Turbopack (Next.js 14 기본)

## 컴포넌트 설계 원칙 (Atomic Design)
- Atoms: 최소 단위 UI (Button, Input, Badge). 외부 의존성 없음.
- Molecules: Atom 조합 (SearchInput = Input + Button). 최소한의 로직.
- Organisms: 독립 기능 단위 (ChatMessage, AgentCard). 자체 상태 가능.
- Templates: 레이아웃 정의. 데이터 없음, 구조만.
- Pages: 실제 데이터 주입. API 호출은 여기서만.
- 서버 컴포넌트 기본. 'use client'는 인터랙션이 필요한 최하위 컴포넌트에만 적용.

## 성능 목표 (Core Web Vitals)
- FCP (First Contentful Paint): < 1.5s
- LCP (Largest Contentful Paint): < 2.5s
- CLS (Cumulative Layout Shift): < 0.1
- INP (Interaction to Next Paint): < 200ms
- Lighthouse 점수: Performance 80+, Accessibility 90+
- 초기 JS 번들: < 200KB (gzip)

## 접근성 체크리스트 (WCAG 2.1 AA)
- 모든 인터랙티브 요소에 키보드 접근 가능 (Tab 순서 논리적)
- 포커스 인디케이터 명확 표시 (outline: 2px solid)
- 색상 대비 4.5:1 이상 (일반 텍스트), 3:1 이상 (대형 텍스트)
- 이미지: alt 텍스트 필수. 장식용 이미지는 alt=""
- ARIA: 의미 있는 role, aria-label 사용. 남용 금지.
- 오류 메시지: 색상만으로 구분하지 않고 텍스트로도 표시

## 코드 컨벤션
- 파일명: kebab-case (chat-message.tsx)
- 컴포넌트명: PascalCase (ChatMessage)
- CSS 클래스: Tailwind 유틸리티만 사용. 커스텀 CSS 파일 신규 생성 금지.
- Context: 테마, 인증 정보처럼 트리 전체 필요한 경우만 사용`,

  '모바일 엔지니어': `# 모바일 앱 개발 표준

## 기술 스택
- Framework: React Native 0.74 (New Architecture 적용)
- 언어: TypeScript 5
- 네비게이션: React Navigation 7 (Stack + Tab)
- 상태 관리: Zustand (웹과 동일 라이브러리)
- HTTP: Axios + React Query (웹과 동일 쿼리 훅 공유)
- 빌드: Expo EAS Build (iOS/Android 동시 빌드)
- 배포: Expo EAS Update (OTA 업데이트 — 심사 없이 JS 레이어 수정 즉시 배포)

## 플랫폼별 주의사항
iOS:
- 앱스토어 심사 최소 2~3일 소요. 긴급 수정은 OTA(EAS Update) 활용.
- 주요 거부 사유: 결제 우회(외부 링크 결제 유도), 불완전한 기능, 개인정보 정책 누락
- Info.plist: 사용 권한(카메라, 알림, 사진) 목적 문구 명시 필수
- 배포: TestFlight 베타 → App Store 심사 제출

Android:
- Play Store 심사 1~2일. 첫 앱 등록은 최대 7일.
- targetSdkVersion: 최신 API 레벨 유지 (Google 정책 강제, 미준수 시 배포 차단)
- 주요 거부 사유: 위험 권한 남용, 개인정보보호 라벨 불일치
- 배포: Internal Test → Closed Test → Production (순차 롤아웃 20%→50%→100%)

## 푸시 알림 전략
- iOS: UNUserNotificationCenter. 권한 요청 시점: 첫 실행 후 3일 뒤 기능 연계 맥락에서 요청.
- Android 13+: 런타임 권한(POST_NOTIFICATIONS) 필수
- 알림 카테고리: 채팅 답장, 토론 완료, 공지사항
- 딥링크: 알림 탭 → 해당 채팅/토론 화면 직접 이동
- 옵트아웃 존중: 알림 거부 사용자 대상 인앱 배지로 대체

## 앱 크래시 대응 절차
1. Sentry로 크래시 자동 수집 (symbolication 적용)
2. 크래시율 > 1%: 즉시 핫픽스 대응 (OTA 또는 긴급 심사)
3. 크래시율 0.1~1%: 다음 스프린트 P1 처리
4. 신규 빌드 배포 후 24시간: 크래시율 집중 모니터링

## React Native 코드 컨벤션
- 네이티브 브릿지 신규 추가 시 팀 리뷰 필수 (유지보수 비용 증가)
- 웹과 공유 가능한 로직은 shared/ 패키지로 분리 (모노레포)
- 플랫폼별 분기: Platform.select() 사용. .ios.tsx / .android.tsx 파일 분리 최소화.
- 성능: FlatList 기본 사용. ScrollView에 대량 아이템 렌더링 금지.`,

  'QA 엔지니어': `# QA 프로세스 및 품질 기준

## 테스트 피라미드 전략
- 단위 테스트 (70%): Jest / 비즈니스 로직, 유틸리티 함수 / 커버리지 80% 이상 필수
- 통합 테스트 (20%): Supertest / API 엔드포인트, DB 연동 / 실제 DB 사용 (Mock 금지)
- E2E 테스트 (10%): Playwright / 핵심 사용자 플로우 (로그인, 채팅, 결제) / 스테이징 환경

## 릴리즈 게이트 기준 (Go/No-Go)
- P0 버그: 반드시 0건 (앱 크래시, 데이터 유실, 결제 오류)
- P1 버그: 2건 이하 (핵심 기능 동작 불가)
- 단위 테스트 통과율: 100%
- E2E 핵심 시나리오 통과율: 100%
- 성능 회귀: LCP 이전 대비 20% 이상 악화 시 배포 블로킹
- 보안 스캔 (Snyk): Critical/High 취약점 0건

## 버그 심각도 분류
- P0 (Critical): 서비스 전체 중단, 데이터 유실, 결제 오류 → 즉시 수정 (2시간 내)
- P1 (High): 핵심 기능 동작 불가, 보안 취약점 → 당일 수정 (8시간 내)
- P2 (Medium): 주요 기능 부분 동작, UI 깨짐(메인 화면) → 이번 스프린트 내 수정
- P3 (Low): 마이너 UI 이슈, 오탈자, 성능 미세 저하 → 백로그 등록 후 우선순위 판단

## 버그 리포트 작성 양식
- 제목: [P레벨][모듈] 현상 요약 (예: [P1][채팅] SSE 스트림 중 새로고침 시 빈 화면)
- 환경: OS/버전, 브라우저/앱 버전, 재현 환경(로컬/스테이징/프로덕션)
- 재현 단계: 번호 목록으로 단계별 기술
- 기대 결과 vs 실제 결과
- 첨부: 스크린샷 또는 화면 녹화 필수

## QA 체크리스트 (주요 항목)
기능 검증:
- 정상 플로우 (Happy Path) 전부 통과
- 경계값(최대 길이, 0, 음수, 특수문자 입력) 처리 확인
- 권한 없는 사용자 접근 거부 확인

비기능 검증:
- 네트워크 끊김 상황 동작 (오프라인 모드)
- 느린 네트워크(3G 시뮬레이션) 타임아웃 처리
- 다크모드 UI 오류 여부
- 모바일 앱 크래시율 1% 미만 확인

## 배포 검증 절차

### 배포 전 QA 최종 확인 (Go/No-Go 판단)
- 릴리즈 게이트 기준 충족 여부 체크리스트 완료
- 스테이징 환경 E2E 핵심 시나리오 최종 실행 결과 공유
- DB 마이그레이션 스테이징 검증 완료 확인
- 성능 회귀 없음 확인 (LCP 이전 대비 20% 이내)
- 롤백 플랜 문서 링크 공유 여부

### 현재 v2.1.0 QA 상태
- P0: 0건 (통과)
- P1: 1건 미해결 — [BUG-412] 500MB 이상 PDF 업로드 시 BullMQ Worker 타임아웃 (재현율 100%)
- P2: 2건 — [BUG-418] 벡터 검색 중복 청크 반환 / [BUG-421] 다크모드 뱃지 색상 대비 미달
- P3: 1건 — [BUG-425] 진행률 소수점 표기 오류
- 단위 테스트 통과율: 100%
- E2E 시나리오 통과율: 94% (64건 중 6건 실패, 전부 500MB 이상 파일 케이스)
- 릴리즈 게이트 판정: ❌ P1 1건 미해결, E2E 100% 미달 → No-Go

### 배포 후 스모크 테스트 (15분 이내 완료)
1. 로그인/로그아웃 정상 동작 확인
2. 채팅 메시지 전송 정상 동작
3. 문서 업로드 (10MB 이하 PDF) 정상 처리 확인
4. 벡터 검색 결과 반환 확인
5. Sentry 에러율 1% 미만 확인
6. Datadog P95 응답시간 200ms 이하 확인

### 핫픽스 릴리즈 게이트 (긴급 배포 완화 기준)
- P0 핫픽스: P0 수정 확인 + 스모크 테스트만으로 배포 가능 (PM 서면 승인 필수)
- P1 핫픽스: 회귀 테스트 핵심 영역 + 스모크 테스트
- 완화 기준은 핫픽스에만 적용 — 일반 릴리즈에 적용 불가

### Go/No-Go 기준 요약표
| 항목 | Go 기준 | v2.1.0 현황 |
|------|---------|------------|
| P0 버그 | 0건 | ✅ 0건 |
| P1 버그 | 2건 이하 | ❌ 1건 미해결 |
| 단위 테스트 | 100% 통과 | ✅ 100% |
| E2E 핵심 시나리오 | 100% 통과 | ❌ 94% (6건 실패) |
| 성능 회귀 | LCP 20% 이내 | ✅ 이상 없음 |
| 보안 스캔 | Critical/High 0건 | ✅ 이상 없음 |`,

  '인사팀 담당자': `# 인사 관리 정책 및 가이드

## 채용 프로세스
단계: 서류 검토(3일) → 코딩 테스트(4일) → 1차 기술 면접 → 2차 컬처핏 면접(팀장+HR) → 처우 협의 → 합격 통보
- 서류 검토 기준: 직무 경험 50%, 기술 역량 30%, 자기소개서 20%
- 코딩 테스트: 프로그래머스 (90분, 알고리즘 2문제 + 시스템 설계 1문제)
- 기술 면접: 직무 담당 엔지니어 2인 진행, 코드 리뷰 포함
- 컬처핏 면접: HR + 팀장 / 조직 적합성, 성장 의지, 협업 방식 평가
- 처우 협의: HR 주도, 기준 급여 밴드 내 협의 (밴드 초과 시 CPO 승인 필요)
- 채용 SLA: 서류 접수 후 최종 합격까지 3주 이내 목표

## 온보딩 플랜 (30/60/90일)
30일차 목표: 조직 이해 + 환경 세팅 완료
- 1주차: 전사 오리엔테이션, 팀 소개, 장비 수령, 계정 셋업
- 2~3주차: 코드베이스 분석, 기존 티켓 클로징 1건 이상
- 30일 체크인: 온보딩 만족도 조사 + HR 1:1 면담

60일차 목표: 독립적 업무 수행 가능
90일차 목표: 팀 기여 시작 + 수습 평가 (S/A/B/C 4단계, B 이상 정규직 전환)

## 성과 평가 제도
- 평가 주기: 연 2회 (6월 말, 12월 말)
- 평가 등급: S(탁월, 상위 10%), A(우수, 상위 30%), B(기대 충족, 60%), C(개선 필요, 10%)
- 평가 항목: 목표 달성도(KPI) 40%, 역량(기술/협업) 40%, 성장 기여도 20%
- 승급/승진: A 이상 2회 연속 시 승급 심사 대상
- PIP(성과개선계획): C 등급 시 3개월 PIP, 미개선 시 계약 검토

## 주요 복리후생
- 연차: 입사 1년차 11일, 이후 매년 1일 추가 (최대 25일)
- 경조사 휴가: 결혼 5일, 부모 상 5일, 배우자 상 5일, 자녀 상 3일
- 건강검진: 연 1회 전액 지원 (40세 이상 종합검진 지원)
- 자기계발: 도서 구입비 월 3만원, 외부 교육비 연 50만원
- 재택근무: 주 2회 허용 (팀 협의 후 지정일)
- 헤드카운트 계획: 분기별 인력 수요 조사 후 연간 채용 계획 수립`,

  '총무팀 담당자': `# 총무 행정 가이드

## 비품 및 물품 구매 절차
- 50만원 미만: 팀장 결재 → 총무팀 발주 → 수령 확인
- 50만원 이상 ~ 200만원 미만: 이사급 결재 → 총무팀 발주
- 200만원 이상: 대표 결재 → 3개 업체 견적 비교 필수 → 발주
- 긴급 구매: 사전 구두 승인 후 사후 결재 가능 (50만원 이하만)
- 비품 요청 방법: 사내 포털 > 총무 요청 > 비품 구매 신청서 작성
- 처리 기간: 결재 완료 후 5영업일 이내 납품

## 노트북 및 장비 관리 정책
- 지급 기준: 입사 시 개인 노트북 1대 지급 (MacBook Pro 14" 기본)
- 교체 주기: 3년 (성능 불량 시 2년 이내 조기 교체 가능)
- 분실/파손: 고의·과실 시 수리비 본인 부담 (분실 시 50% 부담)
- 퇴직 시: 반납 필수. 반납 전 데이터 초기화 본인 책임.
- 추가 모니터: 신청 후 총무팀 재고 확인 (기본 27" 모니터 1대 추가 지원)

## 외부 벤더 계약 관리
- 신규 계약: 총무팀 주도, 법무 검토 필수 (계약금액 1,000만원 이상)
- 갱신 관리: 만료 2개월 전 담당팀에 갱신 여부 확인 요청
- 등록 벤더: 사무용품(A), 인테리어(B), 케이터링(C), IT 장비(D), 청소용역(E)
- 벤더 평가: 반기 1회 서비스 만족도 평가 후 갱신 여부 결정

## 복지 프로그램
- 건강검진: 연 1회 (인사팀 협업), 독감 예방접종 전액 지원
- 동호회: 지원금 월 10만원 (5인 이상, 총무팀 등록 필수)
- 간식: 층별 격주 보충, 생일자 케이크 제공
- 사무환경: 냉난방 신청 접수 (사내 포털), 좌식 책상 전환 신청 가능
- 기념일: 입사 1/3/5주년 기념품 지급

## 사내 시설 이용 안내
- 회의실 예약: 사내 캘린더 > 회의실 예약 (최대 4시간)
- 주차: 선착순 월 주차권 신청 (총무팀 > 주차 신청)
- 택배: 층별 무인 택배함. 업무 관련 택배 수령 시 총무팀 사전 공지 필수.`,

  '마케팅 담당자': `# B2B SaaS 마케팅 전략 및 운영 가이드

## 핵심 마케팅 지표 (KPI)
- MQL(Marketing Qualified Lead): 월 150건 목표 (인바운드 콘텐츠 + 유료 광고)
- SQL(Sales Qualified Lead): MQL → SQL 전환율 30% 목표
- CAC(고객 획득 비용): 목표 120만원 이하 (현재 분기 평균 145만원 — 개선 필요)
- LTV(고객 생애 가치): 평균 계약 기간 24개월, 월 ARR 기준 LTV:CAC = 4:1 목표
- 기능 채택률: 신기능 출시 2주 내 MAU 25% 이상 사용
- 이메일 오픈율: 뉴스레터 평균 32% (B2B SaaS 업계 평균 22% 대비 우수)

## 제품 출시 캠페인 프로세스 (Go-to-Market)

### 출시 캠페인 타임라인 (기능 배포 기준)
- D-7: 내부 공지 (팀 전체) + 영업팀 배틀카드 배포
- D-3: 랜딩 페이지 업데이트 (신기능 소개 섹션)
- D-1: 배포 전 마케팅 자료 최종 검토 (블로그 초안, 이메일 템플릿)
- D-day 배포 완료 후 2시간 내: 고객 뉴스레터 발송
- D+1: 블로그 포스트 발행 + LinkedIn/X 소셜 미디어 게시
- D+3: SDR 아웃바운드 시퀀스 시작 (신기능 기반 콜드 이메일)
- D+7: 기능 채택률 첫 주 리포트 작성 (PM과 공유)

### 고객 커뮤니케이션 정책
- 유지보수 공지: 서비스 영향 있는 배포 24시간 전 이메일 발송 (SLA 준수)
- 긴급 장애 공지: 15분 이내 상태 페이지(status.agent-discuss.io) 업데이트 → 30분 내 고객 이메일
- 기능 출시 공지: 엔터프라이즈 고객은 개별 CS 채널(Slack Connect)로 사전 안내
- 공지 철회: 발송 완료된 이메일은 취소 불가 — 후속 정정 이메일 발송 필요 (오픈율 하락 및 구독 취소 리스크)

## 현재 v2.1.0 마케팅 계획
- 배포 예정: 2026-06-25(목) 02:00
- 뉴스레터 예약 발송: 2026-06-25(목) 09:00 (수신자 1,240명 — 전체 고객 + 트라이얼 사용자)
  - 제목: "RAG 문서 업로드 v2 출시 — 대용량 문서도 비동기로 빠르게"
  - 예약 완료 상태: 배포 취소 시 발송 4시간 전까지 철회 가능 (마감: 25일 05:00)
- 블로그 포스트: 2026-06-25(목) 10:00 발행 예정 (초안 작성 완료)
- LinkedIn 캠페인: 2026-06-25(목) 11:00 게시 예정 (광고 소재 심사 완료)
- 예상 마케팅 임팩트: 뉴스레터 → 트라이얼 전환 목표 15건, MQL 30건 추가 예상

## 배포 지연 시 마케팅 리스크
- 뉴스레터 발송 후 배포 취소: 기능을 써보려는 고객이 오류를 경험 → CS 인입 급증, 브랜드 신뢰 손상
- 공지 없이 기능 미출시: 고객 혼선 → 구독 취소율 상승 (과거 사례: 공지 후 배포 취소 시 해당 주 구독 취소 2.3배 증가)
- 캠페인 연기 비용: 유료 광고(LinkedIn) 게재 일정 변경 시 약 40만원 손실`,

  '영업 담당자': `# B2B 영업 프로세스 및 고객 관리 가이드

## 핵심 영업 지표 (KPI)
- ARR(연간 반복 매출): 현재 3.2억원, 분기 목표 4억원
- Churn Rate: 월 1.2% (목표 1% 이하) — RAG 기능 출시로 개선 기대
- NRR(순 매출 유지율): 108% (확장 매출이 이탈 매출 상회)
- 파이프라인 규모: 현재 오픈 딜 23건, 예상 ARR 총 8,400만원
- 평균 딜 사이클: SMB 21일, 엔터프라이즈 67일
- 계약 갱신율: 87% (목표 90%)

## 영업 프로세스 (SDR → AE → CS)
- SDR(Sales Development Rep): 아웃바운드 콜드 이메일 + 인바운드 MQL 자격 검증 → SQL 전달
- AE(Account Executive): 데모 → 제안 → 협상 → 계약 클로징
- CS(Customer Success): 온보딩 → 분기별 QBR(Quarterly Business Review) → 갱신/확장
- 계약 형태: 연간 선불 SaaS 구독 (월간 구독은 20% 할증)

## 현재 주요 파이프라인 딜
- 엔터프라이즈 A사 (제조업, 직원 800명):
  - 예상 ARR 3,600만원 (전체 파이프라인의 43%)
  - 계약 단계: POC 완료 → 최종 제안서 검토 중
  - 핵심 요구사항: RAG 문서 검색 기능 (내부 지식베이스 구축 목적)
  - **2026-06-26(금) 14:00: 경영진 최종 데모 약속 확정** — RAG 업로드 기능 시연 필수
  - 배포 지연 시: 데모 취소 또는 미완성 기능 시연 → 계약 클로징 3~4주 지연 예상
- B사 (IT 서비스, 직원 200명): 예상 ARR 480만원, 갱신 협상 중 (만료: 2026-07-01)
- C사 (스타트업, 직원 50명): 예상 ARR 180만원, 트라이얼 종료 후 전환 협상 중

## 고객 SLA 약정 현황
- 엔터프라이즈 계약 SLA: 가동률 99.5% (월간 다운타임 최대 3.6시간), 위반 시 크레딧 환급
- P0 장애 대응: 15분 내 초기 응답, 4시간 내 해결 (위반 시 1일치 요금 환급)
- 데이터 보존: 계약 해지 후 30일 내 내보내기 보장
- 현재 SLA 준수율: 99.8% (목표 초과 달성)

## 배포 관련 영업 체크포인트
- 배포 전: 해당 월 갱신 예정 고객 목록 확인 → 배포 영향도 사전 안내
- 신기능 배포 후: 48시간 내 파이프라인 딜 고객에게 개별 연락 (기능 소개 + 데모 요청)
- 배포 실패/롤백 시: 엔터프라이즈 고객 CS 채널 즉시 공지 → AE가 직접 전화 확인
- 계약 협상 중 고객: 배포 일정 변경 시 AE에게 사전 공유 필수 (딜 클로징 타이밍 영향)

## 계약 갱신 시즌 캘린더 (2026)
- 6월: 3건 갱신 예정 (B사 포함) — 이 달 ARR 기여 비중 높음
- 7월: 5건 갱신 예정
- 9월: 8건 갱신 예정 (최대 갱신 시즌)`,

  '회계팀 담당자': `# 재무 및 경비 처리 정책

## 경비 청구 절차
1. 지출 발생 → 영수증/세금계산서 수취 (발행일로부터 15일 이내 제출)
2. ERP 시스템 > 경비정산 메뉴 > 지출 항목 입력 + 증빙서류 첨부
3. 팀장 온라인 승인 (2영업일 이내)
4. 회계팀 검토 및 최종 승인 (3영업일 이내)
5. 지급: 매월 10일 (전월 16일~말일 청구건) / 매월 25일 (당월 1일~15일 청구건)

증빙서류 기준:
- 3만원 이하: 간이영수증 가능
- 3만원 초과: 세금계산서 또는 신용카드 매출전표 필수
- 법인카드 사용 권장 (법인카드 미보유 팀은 개인카드 후 청구)

## 예산 관리 원칙
- 연간 예산: 11월 요청 → 12월 이사회 확정 → 1월 배정
- 부서별 예산 집행 현황: ERP > 예산 관리 메뉴에서 실시간 조회 가능
- 예산 초과 집행: 팀장 + CFO 사전 승인 필수. 사후 보고 불인정.
- 예산 이월: 원칙적 불가. 불가피 시 12월 15일까지 CFO 신청.
- 비용 절감 목표: 전년 대비 관리비 5% 절감 (달성 시 부서 인센티브)

## 월말 결산 마감 일정
- 영업일 1~3일: 전월 경비 마감 (이후 추가 접수 불가)
- 영업일 3~5일: 부서별 예산 대비 실적 검토
- 영업일 7일: 내부 월간 재무보고서 완성 (CEO/CFO 보고)
- 10일: 경비 지급 (1차) / 25일: 경비 지급 (2차)

## 법인카드 사용 정책
- 발급 대상: 팀장 이상 또는 총무팀 협의 후 업무 필요자
- 사용 가능: 업무 관련 식대, 교통비, 소모품, 복지비
- 사용 불가: 개인 물품, 유흥비, 가족 동반 식비 전체, 현금서비스
- 한도: 직급별 월 50~200만원 (CFO 승인 시 한시적 상향 가능)
- 영수증 등록: 사용 후 3영업일 이내 ERP 입력 필수 (미입력 시 다음 달 사용 정지)

## 세무 신고 일정
- 부가세: 1기(1~6월) 7월 25일 / 2기(7~12월) 다음해 1월 25일
- 원천세: 매월 10일 (급여 원천세, 사업소득 원천세)
- 법인세: 사업연도 종료 후 3개월 내 (12월 결산법인 → 3월 31일)
- 세금계산서 수취: 공급일로부터 익월 10일 이내 발행분만 매입세액 공제 가능`,
};

@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @InjectRepository(User) private readonly userRepository: EntityRepository<User>,
    @InjectRepository(Workspace) private readonly workspaceRepository: EntityRepository<Workspace>,
    @InjectRepository(WorkspaceMember)
    private readonly memberRepository: EntityRepository<WorkspaceMember>,
    @InjectRepository(Agent) private readonly agentRepository: EntityRepository<Agent>,
    @InjectRepository(Room) private readonly roomRepository: EntityRepository<Room>,
    @InjectRepository(RoomAgent) private readonly roomAgentRepository: EntityRepository<RoomAgent>,
    private readonly rag: RagService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const em = this.userRepository.getEntityManager();

    const existing = await this.userRepository.findOne({ email: SEED_EMAIL });
    if (existing) {
      this.logger.log(`seed skipped — user: ${SEED_EMAIL}`);
      return;
    }

    const user = this.userRepository.create({ email: SEED_EMAIL });
    const workspace = this.workspaceRepository.create({ name: SEED_WORKSPACE, ownerUserId: user.id });
    this.memberRepository.create({ workspaceId: workspace.id, userId: user.id, role: 'owner' });

    const agentMap = new Map<string, Agent>();
    for (const spec of AGENTS) {
      const agent = this.agentRepository.create({
        workspaceId: workspace.id,
        name: spec.name,
        instructions: spec.instructions,
        model: DEFAULT_MODEL,
        description: spec.description,
      });
      agentMap.set(spec.name, agent);
    }

    for (const roomSpec of ROOMS) {
      const room = this.roomRepository.create({ workspaceId: workspace.id, name: roomSpec.name });
      for (const agentName of roomSpec.agentNames) {
        const agent = agentMap.get(agentName);
        if (agent) {
          this.roomAgentRepository.create({ roomId: room.id, agentId: agent.id });
        }
      }
    }

    await em.flush();
    this.logger.log(`seed complete — user: ${SEED_EMAIL}, workspace: ${SEED_WORKSPACE}`);

    if (process.env.NODE_ENV === 'test') {
      this.logger.log('test env — skipping RAG document indexing');
      return;
    }

    for (const spec of AGENTS) {
      const agent = agentMap.get(spec.name);
      const knowledge = AGENT_KNOWLEDGE[spec.name];
      if (agent && knowledge) {
        void this.rag.ingestText(agent.id, knowledge);
      }
    }
    this.logger.log(`RAG indexing started — 8 agents processing in background`);
  }
}
