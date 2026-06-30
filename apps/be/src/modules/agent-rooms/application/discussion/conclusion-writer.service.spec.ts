jest.mock('./moderator', () => ({ draftConclusion: jest.fn() }));
jest.mock('./convergence-policy', () => ({ contractSatisfied: jest.fn() }));

import { ConclusionWriterService } from './conclusion-writer.service';
import { draftConclusion as draftConclusionFn } from './moderator';
import { contractSatisfied } from './convergence-policy';
import type { DiscussionStateType } from './discussion-state';
import type { RoomAgentSpec, RoomEvent } from './discussion.types';
import { ReplaySubject } from 'rxjs';

const config = { moderatorModel: 'gpt-4o', agentDefaultModel: 'gpt-4o' } as never;

function makeState(overrides: Partial<DiscussionStateType> = {}): DiscussionStateType {
  return {
    turn: 2,
    turnLog: [
      { role: 'agent', agentId: 'a1', agentName: 'PM', round: 1, content: '의견 1' },
      { role: 'moderator', agentName: '진행자', round: 1, content: '정리' },
    ],
    aborted: false,
    nextSpeakerId: null,
    historySummary: '',
    summarizedUntilTurn: 0,
    brief: null,
    discussionType: 'brainstorm',
    outputContract: ['결론', '권고'],
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

function makeNonThinState(overrides: Partial<DiscussionStateType> = {}): DiscussionStateType {
  return makeState({
    issues: [
      {
        id: 'i1',
        title: '결정된 이슈',
        status: 'decidable',
        claims: ['채택 필요'],
        risks: [],
        proposals: ['채택'],
        lastTouchedTurn: 1,
        revisits: 0,
      },
    ],
    participantStats: { a1: { turns: 1, newClaims: 1, repeatClaims: 0 } },
    ...overrides,
  });
}

function makeLlm(completeFn?: jest.Mock) {
  return {
    complete: completeFn ?? jest.fn().mockResolvedValue('최종 결론 텍스트'),
    completeStructured: jest.fn().mockResolvedValue(null),
    stream: jest.fn(),
    accumulatedUsage: jest.fn(),
    resetUsage: jest.fn(),
  } as never;
}

function makeCtx(
  llm: ReturnType<typeof makeLlm>,
  agents: RoomAgentSpec[] = [{ id: 'a1', name: 'PM', instructions: '...', model: 'gpt-4o' }],
) {
  const events = new ReplaySubject<RoomEvent>(100);
  return {
    topic: '테스트 주제',
    agents,
    events,
    signal: { aborted: false } as AbortSignal,
    ragService: { search: jest.fn() } as never,
    llm,
    config,
    initialTurn: 0,
    skipGate: false,
    maxTurns: 10,
    keepTurns: 4,
  };
}

function makeService(
  moderatorOverrides?: { draftConclusion?: jest.Mock },
  convergenceOverrides?: { contractSatisfied?: jest.Mock },
) {
  (draftConclusionFn as jest.Mock).mockReset();
  (contractSatisfied as jest.Mock).mockReset();
  if (moderatorOverrides?.draftConclusion) {
    (draftConclusionFn as jest.Mock).mockImplementation(moderatorOverrides.draftConclusion as never);
  } else {
    (draftConclusionFn as jest.Mock).mockResolvedValue({
      issues: [],
      newClaims: 0,
      repeatClaims: 0,
      decisionCandidate: null,
      inconsistencies: [],
    });
  }
  if (convergenceOverrides?.contractSatisfied) {
    (contractSatisfied as jest.Mock).mockImplementation(convergenceOverrides.contractSatisfied as never);
  } else {
    (contractSatisfied as jest.Mock).mockReturnValue(true);
  }
  return new ConclusionWriterService();
}

describe('ConclusionWriterService', () => {
  describe('write', () => {
    it('llm.complete 결과를 반환한다', async () => {
      const service = makeService();
      const llm = makeLlm(jest.fn().mockResolvedValue('최종 결론 텍스트'));

      const result = await service.write(makeNonThinState(), llm, config, '테스트 주제');
      expect(result).toBe('최종 결론 텍스트');
    });

    it('llm.complete가 실패하면 폴백 텍스트를 반환한다', async () => {
      const service = makeService();
      const llm = makeLlm(jest.fn().mockRejectedValue(new Error('LLM 오류')));

      const result = await service.write(makeNonThinState(), llm, config, '테스트 주제');
      expect(result).toContain('테스트 주제');
      expect(result).toContain('토론 결론');
    });

    it('폴백 텍스트에 decisionCandidate 권고가 포함된다', async () => {
      const service = makeService();
      const llm = makeLlm(jest.fn().mockRejectedValue(new Error('오류')));
      const state = makeState({
        decisionCandidate: {
          recommendation: '채택 권고',
          conditions: [],
          risks: [],
          verification: [],
          isCommitted: true,
        },
      });

      const result = await service.write(state, llm, config, '주제');
      expect(result).toContain('채택 권고');
    });

    it('decidable 이슈가 있으면 폴백 텍스트에 포함된다', async () => {
      const service = makeService();
      const llm = makeLlm(jest.fn().mockRejectedValue(new Error('오류')));
      const state = makeState({
        issues: [
          { id: 'i1', title: '결정된 이슈', status: 'decidable', claims: [], risks: [], proposals: [], lastTouchedTurn: 0, revisits: 0 },
          { id: 'i2', title: '미결 이슈', status: 'open', claims: [], risks: [], proposals: [], lastTouchedTurn: 0, revisits: 0 },
        ],
      });

      const result = await service.write(state, llm, config, '주제');
      expect(result).toContain('결정된 이슈');
      expect(result).not.toContain('미결 이슈');
    });

    it('thin discussion은 LLM을 호출하지 않고 정직한 부족 메시지를 반환한다', async () => {
      const service = makeService();
      const complete = jest.fn().mockResolvedValue('호출되면 안 됨');
      const llm = makeLlm(complete);

      const result = await service.write(makeState(), llm, config, '주제');
      expect(result).toContain('실질 논의 내용이 부족');
      expect(complete).not.toHaveBeenCalled();
    });

    it('degenerate_barren은 LLM을 호출하지 않고 무응답 종료 메시지를 반환한다', async () => {
      const service = makeService();
      const complete = jest.fn().mockResolvedValue('호출되면 안 됨');
      const llm = makeLlm(complete);

      const result = await service.write(
        makeState({ terminalReason: 'degenerate_barren' }),
        llm,
        config,
        '주제',
      );
      expect(result).toContain('연속으로 실질 발언을 만들지 못해');
      expect(complete).not.toHaveBeenCalled();
    });

    it('insufficient_first_pass는 LLM을 호출하지 않고 품질 부족 메시지를 반환한다', async () => {
      const service = makeService();
      const complete = jest.fn().mockResolvedValue('호출되면 안 됨');
      const llm = makeLlm(complete);

      const result = await service.write(
        makeState({ terminalReason: 'insufficient_first_pass' }),
        llm,
        config,
        '주제',
      );
      expect(result).toContain('실질 논의 내용이 부족');
      expect(complete).not.toHaveBeenCalled();
    });

    it('쟁점 추출이 비어도 충분한 실제 발언이 있으면 LLM 결론 작성 경로를 탄다', async () => {
      const service = makeService();
      const complete = jest.fn().mockResolvedValue('LLM 결론');
      const llm = makeLlm(complete);
      const state = makeState({
        turnLog: [
          {
            role: 'agent',
            agentId: 'a1',
            agentName: 'PM',
            round: 1,
            content: 'PM 관점에서는 cursor 기반 전환 전에 기존 offset API와의 호환 기간을 정하고, 클라이언트별 마이그레이션 순서를 합의해야 합니다.',
          },
          {
            role: 'agent',
            agentId: 'a2',
            agentName: '프론트엔드',
            round: 2,
            content: '프론트엔드 관점에서는 이전 메시지 로딩 시 스크롤 앵커를 유지하고, nextCursor와 hasMore 상태가 빈 페이지에서도 안정적으로 갱신되어야 합니다.',
          },
        ],
        issues: [],
        decisionCandidate: null,
        participantStats: {},
      });
      const agents = [
        { id: 'a1', name: 'PM', instructions: '...', model: 'gpt-4o' },
        { id: 'a2', name: '프론트엔드', instructions: '...', model: 'gpt-4o' },
      ];

      const result = await service.write(state, llm, config, '주제', 4, agents);
      expect(result).toBe('LLM 결론');
      expect(complete).toHaveBeenCalledTimes(1);
    });

    it('다자 방에서 PM 1명만 실질 발화하면 LLM을 호출하지 않고 참여 부족 메시지를 반환한다', async () => {
      const service = makeService();
      const complete = jest.fn().mockResolvedValue('호출되면 안 됨');
      const llm = makeLlm(complete);
      const state = makeNonThinState({
        turnLog: [{ role: 'agent', agentId: 'a1', agentName: 'PM', round: 1, content: 'PM 주장' }],
        participantStats: { a1: { turns: 1, newClaims: 1, repeatClaims: 0 } },
      });
      const agents = [
        { id: 'a1', name: 'PM', instructions: '...', model: 'gpt-4o' },
        { id: 'a2', name: '프론트엔드', instructions: '...', model: 'gpt-4o' },
      ];

      const result = await service.write(state, llm, config, '주제', 4, agents);
      expect(result).toContain('충분한 다자 논의');
      expect(complete).not.toHaveBeenCalled();
    });

    it('PM/프론트엔드가 모두 실질 발화하고 쟁점이 있으면 기존 LLM 작성 경로를 탄다', async () => {
      const service = makeService();
      const complete = jest.fn().mockResolvedValue('LLM 결론');
      const llm = makeLlm(complete);
      const state = makeNonThinState({
        turnLog: [
          { role: 'agent', agentId: 'a1', agentName: 'PM', round: 1, content: 'PM 주장' },
          { role: 'agent', agentId: 'a2', agentName: '프론트엔드', round: 2, content: 'FE 주장' },
        ],
        participantStats: {
          a1: { turns: 1, newClaims: 1, repeatClaims: 0 },
          a2: { turns: 1, newClaims: 1, repeatClaims: 0 },
        },
      });
      const agents = [
        { id: 'a1', name: 'PM', instructions: '...', model: 'gpt-4o' },
        { id: 'a2', name: '프론트엔드', instructions: '...', model: 'gpt-4o' },
      ];

      const result = await service.write(state, llm, config, '주제', 4, agents);
      expect(result).toBe('LLM 결론');
      expect(complete).toHaveBeenCalledTimes(1);
    });
  });

  describe('draftConclusion (노드 핸들러)', () => {
    it('converging status 이벤트를 방출한다', async () => {
      const service = makeService();
      const llm = makeLlm();
      const ctx = makeCtx(llm);
      const emitted: RoomEvent[] = [];
      ctx.events.subscribe((e) => emitted.push(e));

      await service.draftConclusion(makeState(), ctx);

      const statusEvents = emitted.filter((e) => e.type === 'status');
      expect(statusEvents.some((e) => (e as { phase?: string }).phase === 'converging')).toBe(true);
    });

    it('moderator.draftConclusion 결과로 상태를 업데이트한다', async () => {
      const extraction = {
        issues: [{ id: 'i1', title: '이슈', status: 'decidable' as const, claims: [], risks: [], proposals: [], lastTouchedTurn: 1, revisits: 0 }],
        newClaims: 0,
        repeatClaims: 0,
        decisionCandidate: { recommendation: '권고', conditions: [], risks: [], verification: [], isCommitted: true },
        inconsistencies: [],
      };
      const service = makeService({ draftConclusion: jest.fn().mockResolvedValue(extraction) });
      const llm = makeLlm();
      const ctx = makeCtx(llm);

      const result = await service.draftConclusion(makeState(), ctx);
      expect(result.decisionCandidate?.recommendation).toBe('권고');
      expect(result.issues).toHaveLength(1);
    });
  });

  describe('finalizeIfReady (노드 핸들러)', () => {
    it('결론 계약이 충족되면 최종 결론을 쓰고 종료한다', async () => {
      const extraction = {
        issues: [{ id: 'i1', title: '이슈', status: 'decidable' as const, claims: [], risks: [], proposals: [], lastTouchedTurn: 1, revisits: 0 }],
        newClaims: 0,
        repeatClaims: 0,
        decisionCandidate: { recommendation: '권고', conditions: [], risks: [], verification: [], isCommitted: true },
        inconsistencies: [],
      };
      const complete = jest.fn().mockResolvedValue('결론 텍스트');
      const service = makeService(
        { draftConclusion: jest.fn().mockResolvedValue(extraction) },
        { contractSatisfied: jest.fn().mockReturnValue(true) },
      );
      const llm = makeLlm(complete);
      const ctx = makeCtx(llm);
      const emitted: RoomEvent[] = [];
      ctx.events.subscribe((e) => emitted.push(e));

      const result = await service.finalizeIfReady(makeNonThinState(), ctx);

      expect(result.goto).toContain('__end__');
      expect(complete).toHaveBeenCalledTimes(1);
      expect(emitted.map((e) => e.type)).toEqual(expect.arrayContaining(['status', 'final', 'done']));
      const update = result.update as Partial<DiscussionStateType>;
      expect(update.decisionCandidate?.recommendation).toBe('권고');
      expect(update.turnLog?.[0].content).toBe('결론 텍스트');
    });

    it('결론 계약이 미충족이면 추가 발언 없이 검증 필요 쟁점을 남기고 종료한다', async () => {
      const agents = [
        { id: 'a1', name: 'PM', instructions: '...', model: 'gpt-4o' },
        { id: 'a2', name: '프론트엔드', instructions: '...', model: 'gpt-4o' },
      ];
      const extraction = {
        issues: [],
        newClaims: 0,
        repeatClaims: 0,
        decisionCandidate: null,
        inconsistencies: [
          { id: 'c1', description: '서로 다른 비용 전제', kind: 'contradiction' as const, turn: 1, resolved: false },
        ],
      };
      const complete = jest.fn().mockResolvedValue('검증 필요 결론');
      const service = makeService(
        { draftConclusion: jest.fn().mockResolvedValue(extraction) },
        { contractSatisfied: jest.fn().mockReturnValue(false) },
      );
      const llm = makeLlm(complete);
      const ctx = makeCtx(llm, agents);
      const state = makeNonThinState({
        turnLog: [
          { role: 'agent', agentId: 'a2', agentName: '프론트엔드', round: 1, content: 'FE 주장' },
          { role: 'agent', agentId: 'a1', agentName: 'PM', round: 2, content: 'PM 주장' },
        ],
      });

      const result = await service.finalizeIfReady(state, ctx);

      expect(result.goto).toContain('__end__');
      expect(complete).toHaveBeenCalledTimes(1);
      const update = result.update as Partial<DiscussionStateType>;
      expect(update.nextSpeakerId).toBeUndefined();
      expect(update.inconsistencies).toHaveLength(1);
      expect(update.issues?.some((issue) => issue.status === 'needs_verification')).toBe(true);
    });

    it('보강 후보가 반복-heavy이면 추가 발언 대신 검증 필요 쟁점을 남기고 종료한다', async () => {
      const agents = [
        { id: 'a1', name: 'PM', instructions: '...', model: 'gpt-4o' },
        { id: 'a2', name: 'QA', instructions: '...', model: 'gpt-4o' },
      ];
      const extraction = {
        issues: [],
        newClaims: 0,
        repeatClaims: 0,
        decisionCandidate: {
          recommendation: 'Go',
          conditions: [],
          risks: [],
          verification: [],
          isCommitted: false,
        },
        inconsistencies: [],
      };
      const complete = jest.fn().mockResolvedValue('검증 필요 결론');
      const service = makeService(
        { draftConclusion: jest.fn().mockResolvedValue(extraction) },
        { contractSatisfied: jest.fn().mockReturnValue(false) },
      );
      const llm = makeLlm(complete);
      const ctx = makeCtx(llm, agents);
      const state = makeNonThinState({
        discussionType: 'decision',
        turnLog: [
          { role: 'agent', agentId: 'a1', agentName: 'PM', round: 1, content: 'PM은 Go 의견을 반복합니다.' },
          { role: 'agent', agentId: 'a2', agentName: 'QA', round: 2, content: 'QA도 Go 의견을 반복합니다.' },
        ],
        participantStats: {
          a1: { turns: 2, newClaims: 0, repeatClaims: 3 },
          a2: { turns: 2, newClaims: 0, repeatClaims: 3 },
        },
      });

      const result = await service.finalizeIfReady(state, ctx);

      expect(result.goto).toContain('__end__');
      expect(complete).toHaveBeenCalledTimes(1);
      const update = result.update as Partial<DiscussionStateType>;
      expect(update.nextSpeakerId).toBeUndefined();
      expect(update.issues?.some((issue) => issue.status === 'needs_verification')).toBe(true);
      expect(update.issues?.some((issue) => issue.title.includes('검증 필요'))).toBe(true);
    });

    it('미충족이어도 추가 턴 없이 최종 결론을 쓴다', async () => {
      const complete = jest.fn().mockResolvedValue('강제 결론');
      const service = makeService(
        undefined,
        { contractSatisfied: jest.fn().mockReturnValue(false) },
      );
      const llm = makeLlm(complete);
      const ctx = makeCtx(llm);

      const result = await service.finalizeIfReady(makeNonThinState(), ctx);

      expect(result.goto).toContain('__end__');
      expect(complete).toHaveBeenCalledTimes(1);
    });
  });

  describe('writeResult (노드 핸들러)', () => {
    it('writing_result status, final, done 이벤트를 방출하고 complete를 호출한다', async () => {
      const service = makeService();
      const llm = makeLlm(jest.fn().mockResolvedValue('결론 텍스트'));
      const ctx = makeCtx(llm);
      const emitted: RoomEvent[] = [];
      ctx.events.subscribe((e) => emitted.push(e));

      await service.writeResult(makeNonThinState(), ctx);

      const types = emitted.map((e) => e.type);
      expect(types).toContain('status');
      expect(types).toContain('final');
      expect(types).toContain('done');
    });

    it('moderator turnLog 엔트리를 반환한다', async () => {
      const service = makeService();
      const llm = makeLlm(jest.fn().mockResolvedValue('결론 텍스트'));
      const ctx = makeCtx(llm);

      const result = await service.writeResult(makeNonThinState(), ctx);
      expect(result.turnLog).toHaveLength(1);
      expect(result.turnLog![0].role).toBe('moderator');
      expect(result.turnLog![0].content).toBe('결론 텍스트');
    });
  });
});
