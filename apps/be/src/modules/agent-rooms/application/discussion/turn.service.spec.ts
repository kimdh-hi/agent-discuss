jest.mock('./speaker', () => ({ speak: jest.fn() }));
jest.mock('./moderator', () => ({ extractClaims: jest.fn() }));

import { TurnService, normalizeRecommendation, isSameRecommendation } from './turn.service';
import { extractClaims } from './moderator';
import { speak } from './speaker';
import type { DiscussionStateType } from './discussion-state';
import type { RoomAgentSpec, RoomEvent } from './discussion.types';
import { ReplaySubject } from 'rxjs';

const agents: RoomAgentSpec[] = [
  { id: 'a1', name: 'PM', instructions: '...', model: 'gpt-4o' },
];

const config = { moderatorModel: 'gpt-4o', agentDefaultModel: 'gpt-4o', compactThreshold: 15 } as never;

function makeState(overrides: Partial<DiscussionStateType> = {}): DiscussionStateType {
  return {
    turn: 1,
    turnLog: [],
    aborted: false,
    nextSpeakerId: 'a1',
    historySummary: '',
    summarizedUntilTurn: 0,
    brief: null,
    discussionType: 'brainstorm',
    outputContract: [],
    options: [],
    issues: [],
    inconsistencies: [],
    participantStats: {},
    decisionCandidate: null,
    droughtCount: 0,
    barrenStreak: 0,
    terminalReason: null,
    ...overrides,
  };
}

function makeCtx(aborted = false) {
  const events = new ReplaySubject<RoomEvent>(100);
  const signal = { aborted } as AbortSignal;
  return {
    topic: '테스트 주제',
    agents,
    events,
    signal,
    ragService: { search: jest.fn() } as never,
    llm: {
      complete: jest.fn().mockResolvedValue('요약'),
      completeStructured: jest.fn().mockResolvedValue(null),
      stream: jest.fn(),
      accumulatedUsage: jest.fn().mockReturnValue({ inputTokens: 0, outputTokens: 0 }),
      resetUsage: jest.fn(),
    } as never,
    config,
    initialTurn: 0,
    skipGate: false,
    maxTurns: 10,
    keepTurns: 4,
  };
}

function makeLlm() {
  return {
    complete: jest.fn().mockResolvedValue('요약'),
    completeStructured: jest.fn().mockResolvedValue(null),
    stream: jest.fn(),
    accumulatedUsage: jest.fn().mockReturnValue({ inputTokens: 0, outputTokens: 0 }),
    resetUsage: jest.fn(),
  } as never;
}

describe('TurnService', () => {
  beforeEach(() => {
    (speak as jest.Mock).mockReset();
    (extractClaims as jest.Mock).mockReset();
  });

  describe('runSpeak', () => {
    it('signal이 aborted이면 { aborted: true }를 반환한다', async () => {
      const service = new TurnService();

      const result = await service.runSpeak(makeState(), agents, makeCtx(true) as never, makeLlm(), config, '주제');
      expect(result).toEqual({ aborted: true });
    });

    it('에이전트가 없으면 { aborted: true }를 반환한다', async () => {
      const service = new TurnService();

      const result = await service.runSpeak(makeState({ nextSpeakerId: null }), [], makeCtx() as never, makeLlm(), config, '주제');
      expect(result).toEqual({ aborted: true });
    });

    it('speaker.speak 결과로 turnLog와 stats를 업데이트한다', async () => {
      const speakResult = {
        entry: { role: 'agent' as const, agentId: 'a1', agentName: 'PM', round: 1, content: '발언' },
        yieldTo: null,
        passReason: null,
        done: false,
        sources: [],
        substantive: true,
      };
      (speak as jest.Mock).mockResolvedValue(speakResult);
      const service = new TurnService();

      const result = await service.runSpeak(makeState(), agents, makeCtx() as never, makeLlm(), config, '주제');
      expect(result.turn).toBe(2);
      expect(result.turnLog).toHaveLength(1);
      expect((result.participantStats as Record<string, unknown>)?.['a1']).toBeDefined();
    });

    it('participantStats는 reducer용 delta만 반환한다', async () => {
      const speakResult = {
        entry: { role: 'agent' as const, agentId: 'a1', agentName: 'PM', round: 2, content: '발언' },
        yieldTo: null,
        passReason: null,
        done: false,
        sources: [],
        substantive: true,
      };
      (speak as jest.Mock).mockResolvedValue(speakResult);
      const service = new TurnService();

      const result = await service.runSpeak(
        makeState({ participantStats: { a1: { turns: 5, newClaims: 2, repeatClaims: 1 } } }),
        agents,
        makeCtx() as never,
        makeLlm(),
        config,
        '주제',
      );
      expect(result.participantStats).toEqual({
        a1: { turns: 1, newClaims: 0, repeatClaims: 0 },
      });
    });

    it('비실질 발언이면 turnLog/turn을 생략하고 barrenStreak을 증가시킨다', async () => {
      const speakResult = {
        entry: { role: 'agent' as const, agentId: 'a1', agentName: 'PM', round: 1, content: '' },
        yieldTo: null,
        passReason: null,
        done: false,
        sources: [],
        substantive: false,
      };
      (speak as jest.Mock).mockResolvedValue(speakResult);
      const service = new TurnService();

      const result = await service.runSpeak(makeState({ barrenStreak: 1 }), agents, makeCtx() as never, makeLlm(), config, '주제');
      expect(result.turn).toBeUndefined();
      expect(result.turnLog).toBeUndefined();
      expect(result.barrenStreak).toBe(2);
    });

    it('비실질 + yieldTo는 제어 신호를 폐기하고 barrenStreak을 증가시킨다', async () => {
      const speakResult = {
        entry: { role: 'agent' as const, agentId: 'a1', agentName: 'PM', round: 1, content: '' },
        yieldTo: 'a2',
        passReason: null,
        done: false,
        sources: [],
        substantive: false,
      };
      (speak as jest.Mock).mockResolvedValue(speakResult);
      const service = new TurnService();

      const result = await service.runSpeak(makeState({ barrenStreak: 1 }), agents, makeCtx() as never, makeLlm(), config, '주제');
      expect(result.turn).toBeUndefined();
      expect(result.barrenStreak).toBe(2);
    });

    it('비실질 + done:true는 종료 신호를 폐기하고 barrenStreak을 증가시킨다', async () => {
      const speakResult = {
        entry: { role: 'agent' as const, agentId: 'a1', agentName: 'PM', round: 1, content: '' },
        yieldTo: null,
        passReason: null,
        done: true,
        sources: [],
        substantive: false,
      };
      (speak as jest.Mock).mockResolvedValue(speakResult);
      const service = new TurnService();

      const result = await service.runSpeak(makeState({ barrenStreak: 2 }), agents, makeCtx() as never, makeLlm(), config, '주제');
      expect(result.barrenStreak).toBe(3);
      expect(result.terminalReason).toBe('degenerate_barren');
    });

    it('barrenStreak이 maxConsecutiveBarren(3)에 도달하면 degenerate terminalReason을 포함한다', async () => {
      const speakResult = {
        entry: { role: 'agent' as const, agentId: 'a1', agentName: 'PM', round: 1, content: '' },
        yieldTo: null,
        passReason: null,
        done: false,
        sources: [],
        substantive: false,
      };
      (speak as jest.Mock).mockResolvedValue(speakResult);
      const service = new TurnService();

      // barrenStreak=2, 이번 비실질로 3이 되면 캡 도달
      const result = await service.runSpeak(makeState({ barrenStreak: 2 }), agents, makeCtx() as never, makeLlm(), config, '주제');
      expect(result.barrenStreak).toBe(3);
      expect(result.terminalReason).toBe('degenerate_barren');
    });

    it('실질 발언이면 barrenStreak을 0으로 리셋한다', async () => {
      const speakResult = {
        entry: { role: 'agent' as const, agentId: 'a1', agentName: 'PM', round: 1, content: '새 주장' },
        yieldTo: null,
        passReason: null,
        done: false,
        sources: [],
        substantive: true,
      };
      (speak as jest.Mock).mockResolvedValue(speakResult);
      const service = new TurnService();

      const result = await service.runSpeak(makeState({ barrenStreak: 2 }), agents, makeCtx() as never, makeLlm(), config, '주제');
      expect(result.barrenStreak).toBe(0);
      expect(result.turn).toBe(2);
    });

    it('state.aborted가 true이면 { aborted: true }를 반환한다', async () => {
      const service = new TurnService();

      const result = await service.runSpeak(makeState({ aborted: true }), agents, makeCtx() as never, makeLlm(), config, '주제');
      expect(result).toEqual({ aborted: true });
    });
  });

  describe('speak (노드 핸들러)', () => {
    it('aborted 시 __end__로 goto하고 aborted:true를 업데이트한다', async () => {
      const service = new TurnService();

      const result = await service.speak(makeState(), makeCtx(true) as never);
      expect(result.goto).toContain('__end__');
      const update = result.update as Record<string, unknown> | undefined;
      expect(update?.['aborted']).toBe(true);
    });

    it('실질 발언이면 updateIssues로 goto한다', async () => {
      const speakResult = {
        entry: { role: 'agent' as const, agentId: 'a1', agentName: 'PM', round: 1, content: '발언' },
        yieldTo: null,
        passReason: null,
        done: false,
        sources: [],
        substantive: true,
      };
      (speak as jest.Mock).mockResolvedValue(speakResult);
      const service = new TurnService();

      const result = await service.speak(makeState(), makeCtx() as never);
      expect(result.goto).toContain('updateIssues');
    });

    it('비실질 발언이면 moderate로 goto한다', async () => {
      const speakResult = {
        entry: { role: 'agent' as const, agentId: 'a1', agentName: 'PM', round: 1, content: '' },
        yieldTo: null,
        passReason: null,
        done: false,
        sources: [],
        substantive: false,
      };
      (speak as jest.Mock).mockResolvedValue(speakResult);
      const service = new TurnService();

      const result = await service.speak(makeState(), makeCtx() as never);
      expect(result.goto).toContain('moderate');
    });
  });

  describe('updateIssues (노드 핸들러)', () => {
    it('ctx에서 llm/config를 읽어 runUpdateIssues를 위임한다', async () => {
      const extraction = {
        issues: [],
        newClaims: 1,
        repeatClaims: 0,
        decisionCandidate: { recommendation: '진행', conditions: [], risks: [], verification: [], isCommitted: false },
        inconsistencies: [],
      };
      (extractClaims as jest.Mock).mockResolvedValue(extraction);
      const service = new TurnService();

      const state = makeState({
        turnLog: [{ role: 'agent', agentId: 'a1', agentName: 'PM', round: 1, content: '발언' }],
        droughtCount: 2,
      });
      const result = await service.updateIssues(state, makeCtx() as never);
      expect(result.droughtCount).toBe(0);
    });
  });

  describe('compactHistory (노드 핸들러)', () => {
    it('turnLog가 짧으면 빈 객체를 반환한다', async () => {
      const service = new TurnService();
      const result = await service.compactHistory(makeState({ turnLog: [] }), makeCtx() as never);
      expect(result).toEqual({});
    });
  });

  describe('runUpdateIssues', () => {
    it('새 발언이 있으면 droughtCount를 0으로 리셋한다', async () => {
      const extraction = {
        issues: [],
        newClaims: 1,
        repeatClaims: 0,
        decisionCandidate: { recommendation: '진행', conditions: [], risks: [], verification: [], isCommitted: false },
        inconsistencies: [],
      };
      (extractClaims as jest.Mock).mockResolvedValue(extraction);
      const service = new TurnService();

      const result = await service.runUpdateIssues(makeState({ droughtCount: 3 }), makeLlm(), config, '발언');
      expect(result.droughtCount).toBe(0);
    });

    it('새 발언이 없으면 droughtCount를 증가시킨다', async () => {
      const extraction = { issues: [], newClaims: 0, repeatClaims: 1, decisionCandidate: null, inconsistencies: [] };
      (extractClaims as jest.Mock).mockResolvedValue(extraction);
      const service = new TurnService();

      const result = await service.runUpdateIssues(makeState({ droughtCount: 2 }), makeLlm(), config, '발언');
      expect(result.droughtCount).toBe(3);
    });

    it('순반복(repeatClaims > newClaims)이면 droughtCount를 증가시킨다', async () => {
      const extraction = { issues: [], newClaims: 1, repeatClaims: 2, decisionCandidate: null, inconsistencies: [] };
      (extractClaims as jest.Mock).mockResolvedValue(extraction);
      const service = new TurnService();

      const result = await service.runUpdateIssues(makeState({ droughtCount: 1 }), makeLlm(), config, '발언');
      expect(result.droughtCount).toBe(2);
    });

    it('새 주장이 반복보다 많으면 droughtCount를 0으로 리셋한다', async () => {
      const extraction = {
        issues: [
          { id: 'i1', title: '새 쟁점', status: 'open', claims: ['새 주장'], risks: [], proposals: [], lastTouchedTurn: 1, revisits: 0 },
          { id: 'i2', title: '다른 쟁점', status: 'open', claims: ['다른 주장'], risks: [], proposals: [], lastTouchedTurn: 1, revisits: 0 },
        ],
        newClaims: 2,
        repeatClaims: 1,
        decisionCandidate: null,
        inconsistencies: [],
      };
      (extractClaims as jest.Mock).mockResolvedValue(extraction);
      const service = new TurnService();

      const result = await service.runUpdateIssues(makeState({ droughtCount: 2 }), makeLlm(), config, '발언');
      expect(result.droughtCount).toBe(0);
    });

    it('마지막 에이전트 발언의 agentId로 stats를 기록한다', async () => {
      const extraction = {
        issues: [
          { id: 'i1', title: '새 쟁점', status: 'open', claims: ['새 주장'], risks: [], proposals: [], lastTouchedTurn: 1, revisits: 0 },
          { id: 'i2', title: '다른 쟁점', status: 'open', claims: ['다른 주장'], risks: [], proposals: [], lastTouchedTurn: 1, revisits: 0 },
        ],
        newClaims: 2,
        repeatClaims: 0,
        decisionCandidate: null,
        inconsistencies: [],
      };
      (extractClaims as jest.Mock).mockResolvedValue(extraction);
      const service = new TurnService();

      const state = makeState({
        turnLog: [{ role: 'agent', agentId: 'a1', agentName: 'PM', round: 1, content: '발언' }],
      });
      const result = await service.runUpdateIssues(state, makeLlm(), config, '발언');
      expect((result.participantStats as Record<string, unknown>)?.['a1']).toEqual({
        turns: 0,
        newClaims: 2,
        repeatClaims: 0,
      });
    });

    it('extraction이 null 후보를 반환해도 기존 decisionCandidate를 보존한다', async () => {
      const existing = {
        recommendation: 'cursor 기반으로 전환한다',
        conditions: ['createdAt/id 복합 커서 사용'],
        risks: ['직접 이동 제한'],
        verification: ['중복/누락 메시지 테스트'],
        isCommitted: false,
      };
      const extraction = { issues: [], newClaims: 0, repeatClaims: 1, decisionCandidate: null, inconsistencies: [] };
      (extractClaims as jest.Mock).mockResolvedValue(extraction);
      const service = new TurnService();

      const result = await service.runUpdateIssues(
        makeState({ decisionCandidate: existing }),
        makeLlm(),
        config,
        '반복 발언',
      );

      expect(result.decisionCandidate).toEqual(existing);
    });

    it('agentId가 없는 마지막 발언이면 stats를 기록하지 않는다', async () => {
      const extraction = { issues: [], newClaims: 1, repeatClaims: 0, decisionCandidate: null, inconsistencies: [] };
      (extractClaims as jest.Mock).mockResolvedValue(extraction);
      const service = new TurnService();

      const state = makeState({
        turnLog: [{ role: 'moderator', agentName: '진행자', round: 1, content: '정리' }],
      });
      const result = await service.runUpdateIssues(state, makeLlm(), config, '발언');
      expect(Object.keys(result.participantStats ?? {})).toHaveLength(0);
    });

    it('substantive issue id가 다시 추출되면 현재 턴으로 lastTouchedTurn을 정규화한다', async () => {
      const extraction = {
        issues: [{ id: 'cursor', title: '커서 전환 검증', status: 'needs_verification', claims: ['커서 전환'], risks: [], proposals: ['중복/누락 검증을 추가한다'], lastTouchedTurn: 0, revisits: 0 }],
        newClaims: 1,
        repeatClaims: 0,
        decisionCandidate: null,
        inconsistencies: [],
      };
      (extractClaims as jest.Mock).mockResolvedValue(extraction);
      const service = new TurnService();

      const result = await service.runUpdateIssues(
        makeState({
          turn: 4,
          outputContract: ['커서 전환 검증'],
          issues: [{ id: 'cursor', title: '커서 전환', status: 'open', claims: [], risks: [], proposals: [], lastTouchedTurn: 2, revisits: 1 }],
        }),
        makeLlm(),
        config,
        '커서 전환 검증 발언',
      );

      expect(result.issues?.[0]?.lastTouchedTurn).toBe(4);
    });

    it('주요 쟁점과 무관한 새 issue는 merge하지 않고 drought를 증가시킨다', async () => {
      const extraction = {
        issues: [{
          id: 'push',
          title: '푸시 알림 과부하',
          status: 'open' as const,
          claims: ['푸시 알림 빈도 제어가 필요하다'],
          risks: [],
          proposals: [],
          lastTouchedTurn: 4,
          revisits: 0,
        }],
        newClaims: 1,
        repeatClaims: 0,
        decisionCandidate: null,
        inconsistencies: [],
      };
      (extractClaims as jest.Mock).mockResolvedValue(extraction);
      const service = new TurnService();

      const result = await service.runUpdateIssues(
        makeState({
          droughtCount: 1,
          turnLog: [{ role: 'agent', agentId: 'a1', agentName: 'PM', round: 4, content: '푸시 알림 발언' }],
          brief: {
            objective: 'SSE 스트림 설계',
            deliverable: 'SSE 계약',
            inScope: ['SSE'],
            outOfScope: [],
            requiredDimensions: ['topic/event mapping', 'done/error 이벤트', 'reconnect/retry'],
            rolePlan: [],
          },
        }),
        makeLlm(),
        config,
        '푸시 알림 발언',
      );

      expect(result.issues).toEqual([]);
      expect(result.droughtCount).toBe(2);
      expect((result.participantStats as Record<string, unknown>)?.['a1']).toEqual({
        turns: 0,
        newClaims: 0,
        repeatClaims: 1,
      });
    });

    it('결론 프레임이 잡힌 뒤 반복 의견은 drought와 repeat stats로 보정한다', async () => {
      const existingCandidate = {
        recommendation: '채팅 메시지 조회를 cursor 기반 페이지네이션으로 전환한다',
        conditions: ['기존 offset API와 호환 기간을 둔다'],
        risks: ['클라이언트 전환 시 중복 또는 누락 메시지가 발생할 수 있다'],
        verification: ['동일 createdAt에서 id 보조 정렬로 중복/누락을 검증한다'],
        isCommitted: false,
      };
      const existingIssue = {
        id: 'feedback',
        title: '사용자 피드백 루프',
        status: 'open' as const,
        claims: ['사용자 피드백을 수집하고 반영하는 과정은 중요하다'],
        risks: [],
        proposals: [],
        lastTouchedTurn: 2,
        revisits: 0,
      };
      const extraction = {
        issues: [{
          ...existingIssue,
          claims: ['사용자 피드백을 체계적으로 수집하고 이를 반영하는 과정이 중요합니다'],
          lastTouchedTurn: 5,
        }],
        newClaims: 2,
        repeatClaims: 0,
        decisionCandidate: null,
        inconsistencies: [],
      };
      (extractClaims as jest.Mock).mockResolvedValue(extraction);
      const service = new TurnService();

      const result = await service.runUpdateIssues(
        makeState({
          droughtCount: 1,
          decisionCandidate: existingCandidate,
          issues: [existingIssue],
          turnLog: [{ role: 'agent', agentId: 'a1', agentName: 'PM', round: 5, content: '반복 발언' }],
        }),
        makeLlm(),
        config,
        '반복 발언',
      );

      expect(result.droughtCount).toBe(2);
      expect((result.participantStats as Record<string, unknown>)?.['a1']).toEqual({
        turns: 0,
        newClaims: 0,
        repeatClaims: 2,
      });
    });

    it('LLM이 새 주장으로 보고해도 최근 발언과 의미가 같고 구조적 진전이 없으면 반복으로 보정한다', async () => {
      const extraction = {
        issues: [],
        newClaims: 1,
        repeatClaims: 0,
        decisionCandidate: null,
        inconsistencies: [],
      };
      (extractClaims as jest.Mock).mockResolvedValue(extraction);
      const service = new TurnService();

      const repeatedSpeech = 'PM 관점에서는 Go로 진행하되 QA 검증이 필요합니다.';
      const result = await service.runUpdateIssues(
        makeState({
          droughtCount: 1,
          turnLog: [
            { role: 'agent', agentId: 'a2', agentName: 'QA', round: 4, content: 'Go로 진행하되 QA 검증이 필요합니다.' },
            { role: 'agent', agentId: 'a1', agentName: 'PM', round: 5, content: repeatedSpeech },
          ],
        }),
        makeLlm(),
        config,
        repeatedSpeech,
      );

      expect(result.droughtCount).toBe(2);
      expect((result.participantStats as Record<string, unknown>)?.['a1']).toEqual({
        turns: 0,
        newClaims: 0,
        repeatClaims: 1,
      });
    });

    it('같은 화자가 4턴 간격으로 동일 주제를 재진술하면 윈도우 밖이어도 반복으로 보정한다', async () => {
      const extraction = {
        issues: [],
        newClaims: 1,
        repeatClaims: 0,
        decisionCandidate: null,
        inconsistencies: [],
      };
      (extractClaims as jest.Mock).mockResolvedValue(extraction);
      const service = new TurnService();

      // 토큰 jaccard >= 0.68을 확실히 넘도록 핵심 토큰을 그대로 유지한 재진술 사용
      const originalSpeech = 'cursor 기반 페이지네이션 전환이 필요합니다 offset 호환 기간을 두어야 합니다.';
      const restatement = 'cursor 기반 페이지네이션 전환이 필요합니다 offset 호환 기간을 두어야 합니다. 다시 말씀드립니다.';

      const result = await service.runUpdateIssues(
        makeState({
          droughtCount: 1,
          turnLog: [
            { role: 'agent', agentId: 'a1', agentName: 'PM', round: 1, content: originalSpeech },
            { role: 'agent', agentId: 'a2', agentName: 'BE', round: 2, content: '백엔드 기준으로는 문제없습니다.' },
            { role: 'agent', agentId: 'a3', agentName: 'FE', round: 3, content: '프론트 관점 의견입니다.' },
            { role: 'agent', agentId: 'a4', agentName: 'QA', round: 4, content: 'QA 단계에서 확인하겠습니다.' },
            { role: 'agent', agentId: 'a1', agentName: 'PM', round: 5, content: restatement },
          ],
        }),
        makeLlm(),
        config,
        restatement,
      );

      expect(result.droughtCount).toBe(2);
      expect((result.participantStats as Record<string, unknown>)?.['a1']).toEqual({
        turns: 0,
        newClaims: 0,
        repeatClaims: 1,
      });
    });

    it('같은 화자 재진술이지만 신규 issue가 있으면 구조적 진전으로 보정하지 않는다', async () => {
      const extraction = {
        issues: [{
          id: 'issue-5-1',
          title: '배포 게이트 조건',
          status: 'open' as const,
          claims: ['배포 게이트 조건을 별도로 정의해야 한다'],
          risks: [],
          proposals: [],
          lastTouchedTurn: 5,
          revisits: 0,
        }],
        newClaims: 1,
        repeatClaims: 0,
        decisionCandidate: null,
        inconsistencies: [],
      };
      (extractClaims as jest.Mock).mockResolvedValue(extraction);
      const service = new TurnService();

      const originalSpeech = 'cursor 기반 페이지네이션 전환이 필요합니다 offset 호환 기간을 두어야 합니다.';
      const speechWithNewIssue = 'cursor 기반 페이지네이션 전환이 필요합니다 offset 호환 기간을 두어야 합니다. 그리고 배포 게이트 조건도 별도로 정의해야 합니다.';

      const result = await service.runUpdateIssues(
        makeState({
          droughtCount: 1,
          turnLog: [
            { role: 'agent', agentId: 'a1', agentName: 'PM', round: 1, content: originalSpeech },
            { role: 'agent', agentId: 'a2', agentName: 'BE', round: 2, content: '백엔드 의견입니다.' },
            { role: 'agent', agentId: 'a3', agentName: 'FE', round: 3, content: '프론트 의견입니다.' },
            { role: 'agent', agentId: 'a4', agentName: 'QA', round: 4, content: 'QA 의견입니다.' },
            { role: 'agent', agentId: 'a1', agentName: 'PM', round: 5, content: speechWithNewIssue },
          ],
        }),
        makeLlm(),
        config,
        speechWithNewIssue,
      );

      expect(result.droughtCount).toBe(0);
    });
  });

  describe('runCompactHistory', () => {
    it('turnLog가 compactKeepTurns 이하이면 빈 객체를 반환한다', async () => {
      const service = new TurnService();

      const result = await service.runCompactHistory(makeState({ turnLog: [] }), makeLlm(), config);
      expect(result).toEqual({});
    });

    it('압축할 항목이 없으면 빈 객체를 반환한다', async () => {
      const service = new TurnService();

      const log = Array.from({ length: 20 }, (_, i) => ({
        role: 'agent' as const, agentName: 'PM', round: i, content: `발언 ${i}`,
      }));
      const result = await service.runCompactHistory(
        makeState({ turnLog: log, summarizedUntilTurn: 100 }),
        makeLlm(),
        config,
      );
      expect(result).toEqual({});
    });

    it('충분한 turnLog가 있으면 요약을 생성한다', async () => {
      const service = new TurnService();
      const llm = {
        complete: jest.fn().mockResolvedValue('새 요약'),
        completeStructured: jest.fn(),
        stream: jest.fn(),
        accumulatedUsage: jest.fn(),
        resetUsage: jest.fn(),
      } as never;

      const log = Array.from({ length: 20 }, (_, i) => ({
        role: 'agent' as const, agentName: 'PM', round: i, content: `발언 ${i}`,
      }));
      const result = await service.runCompactHistory(makeState({ turnLog: log }), llm, config);
      expect(result.historySummary).toContain('새 요약');
    });

    it('기존 historySummary가 있으면 이어붙인다', async () => {
      const service = new TurnService();
      const llm = {
        complete: jest.fn().mockResolvedValue('추가 요약'),
        completeStructured: jest.fn(),
        stream: jest.fn(),
        accumulatedUsage: jest.fn(),
        resetUsage: jest.fn(),
      } as never;

      const log = Array.from({ length: 20 }, (_, i) => ({
        role: 'agent' as const, agentName: 'PM', round: i, content: `발언 ${i}`,
      }));
      const result = await service.runCompactHistory(
        makeState({ turnLog: log, historySummary: '이전 요약' }),
        llm,
        config,
      );
      expect(result.historySummary).toContain('이전 요약');
      expect(result.historySummary).toContain('추가 요약');
    });

    it('combined가 maxHistorySummaryChars 초과 시 재요약을 호출한다', async () => {
      const service = new TurnService();
      const longSummary = 'A'.repeat(1600);
      const llm = {
        complete: jest.fn()
          .mockResolvedValueOnce('새 요약')
          .mockResolvedValueOnce('재압축 요약'),
        completeStructured: jest.fn(),
        stream: jest.fn(),
        accumulatedUsage: jest.fn(),
        resetUsage: jest.fn(),
      } as never;

      const log = Array.from({ length: 20 }, (_, i) => ({
        role: 'agent' as const, agentName: 'PM', round: i, content: `발언 ${i}`,
      }));
      const result = await service.runCompactHistory(
        makeState({ turnLog: log, historySummary: longSummary }),
        llm,
        config,
      );
      expect((llm as never as { complete: jest.Mock }).complete).toHaveBeenCalledTimes(2);
      expect(result.historySummary).toBe('재압축 요약');
    });

    it('재요약 후에도 초과이면 slice 폴백한다', async () => {
      const service = new TurnService();
      const longSummary = 'A'.repeat(1600);
      const stillLong = 'B'.repeat(2000);
      const llm = {
        complete: jest.fn()
          .mockResolvedValueOnce('새 요약')
          .mockResolvedValueOnce(stillLong),
        completeStructured: jest.fn(),
        stream: jest.fn(),
        accumulatedUsage: jest.fn(),
        resetUsage: jest.fn(),
      } as never;

      const log = Array.from({ length: 20 }, (_, i) => ({
        role: 'agent' as const, agentName: 'PM', round: i, content: `발언 ${i}`,
      }));
      const result = await service.runCompactHistory(
        makeState({ turnLog: log, historySummary: longSummary }),
        llm,
        config,
      );
      expect(result.historySummary?.length).toBeLessThanOrEqual(1500);
    });

    it('재요약 실패 시 slice 폴백한다', async () => {
      const service = new TurnService();
      const longSummary = 'A'.repeat(1600);
      const llm = {
        complete: jest.fn()
          .mockResolvedValueOnce('새 요약')
          .mockRejectedValueOnce(new Error('LLM 오류')),
        completeStructured: jest.fn(),
        stream: jest.fn(),
        accumulatedUsage: jest.fn(),
        resetUsage: jest.fn(),
      } as never;

      const log = Array.from({ length: 20 }, (_, i) => ({
        role: 'agent' as const, agentName: 'PM', round: i, content: `발언 ${i}`,
      }));
      const result = await service.runCompactHistory(
        makeState({ turnLog: log, historySummary: longSummary }),
        llm,
        config,
      );
      expect(result.historySummary?.length).toBeLessThanOrEqual(1500);
    });

    it('keepTurns 인자를 명시하면 해당 값으로 압축 윈도우를 조정한다', async () => {
      const service = new TurnService();
      const llm = {
        complete: jest.fn().mockResolvedValue('요약'),
        completeStructured: jest.fn(),
        stream: jest.fn(),
        accumulatedUsage: jest.fn(),
        resetUsage: jest.fn(),
      } as never;

      const log = Array.from({ length: 10 }, (_, i) => ({
        role: 'agent' as const, agentName: 'PM', round: i, content: `발언 ${i}`,
      }));
      const result = await service.runCompactHistory(makeState({ turnLog: log }), llm, config, 6);
      expect(result.summarizedUntilTurn).toBe(4);
    });
  });
});

describe('normalizeRecommendation', () => {
  it('앞뒤 공백을 제거한다', () => {
    expect(normalizeRecommendation('  연기  ')).toBe('연기');
  });

  it('소문자로 변환한다', () => {
    expect(normalizeRecommendation('Postpone')).toBe('postpone');
  });

  it('연속 공백을 한 칸으로 축소한다', () => {
    expect(normalizeRecommendation('다음  스프린트로  연기')).toBe('다음 스프린트로 연기');
  });

  it('구두점을 제거한다', () => {
    expect(normalizeRecommendation('연기합니다.')).toBe('연기합니다');
  });

  it('빈 문자열을 반환할 수 있다', () => {
    expect(normalizeRecommendation('   ')).toBe('');
  });
});

describe('isSameRecommendation', () => {
  it('동일 문자열은 true이다', () => {
    expect(isSameRecommendation('연기', '연기')).toBe(true);
  });

  it('공백/구두점 차이는 무시한다', () => {
    expect(isSameRecommendation('다음 스프린트로 연기합니다.', '다음 스프린트로 연기합니다')).toBe(true);
  });

  it('대소문자 차이는 무시한다', () => {
    expect(isSameRecommendation('Postpone to next sprint', 'postpone to next sprint')).toBe(true);
  });

  it('완전히 다른 문자열은 false이다', () => {
    expect(isSameRecommendation('연기', '승인')).toBe(false);
  });

  it('양쪽 모두 빈 문자열이면 false이다', () => {
    expect(isSameRecommendation('', '')).toBe(false);
  });

  it('한쪽이 빈 문자열이면 false이다', () => {
    expect(isSameRecommendation('연기', '')).toBe(false);
    expect(isSameRecommendation('', '연기')).toBe(false);
  });

  it('토큰 1개 차이(자카드 0.75)는 false이다', () => {
    // "다음 스프린트로 연기"와 "다음 스프린트로 연기 권고" — 교집합 4/합집합 5 = 0.8 → false
    expect(isSameRecommendation('다음 스프린트로 연기', '다음 스프린트로 연기 권고')).toBe(false);
  });

  it('자카드 유사도 0.9 이상이면 true이다(20토큰 중 1개 차이)', () => {
    // 20토큰 중 1개만 다름: 교집합 19 / 합집합 21 = 0.905 >= 0.9 → true
    // 1개 차이 시 합집합 = 교집합 + 2 이므로 N >= 19여야 임계를 넘는다
    const common = '가 나 다 라 마 바 사 아 자 차 카 타 파 하 갸 냐 댜 랴 먀';
    const a = common + ' 뱌';
    const b = common + ' 샤';
    expect(isSameRecommendation(a, b)).toBe(true);
  });
});
