import { defineAgenda, rejectTopic, runDefineAgenda, runValidateTopic, validateTopic } from './topic-setup';
import type { DiscussionStateType } from './discussion-state';
import type { RoomAgentSpec } from './discussion.types';
import { ReplaySubject } from 'rxjs';
import type { RoomEvent } from './discussion.types';

const agents: RoomAgentSpec[] = [
  { id: 'a1', name: 'PM', instructions: '...', model: 'gpt-4o' },
];

const config = { moderatorModel: 'gpt-4o', agentDefaultModel: 'gpt-4o', maxRoundsPerAgent: 3, maxTotalTurns: 20, compactThreshold: 15 } as never;

function makeLlm(completeFn: jest.Mock, structuredFn?: jest.Mock) {
  return {
    complete: completeFn,
    completeStructured: structuredFn ?? jest.fn().mockResolvedValue(null),
    stream: jest.fn(),
    accumulatedUsage: jest.fn().mockReturnValue({ inputTokens: 0, outputTokens: 0 }),
    resetUsage: jest.fn(),
  } as never;
}

function makeState(overrides: Partial<DiscussionStateType> = {}): DiscussionStateType {
  return {
    turn: 0,
    turnLog: [],
    aborted: false,
    nextSpeakerId: null,
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

function makeCtx(llm: ReturnType<typeof makeLlm>, skipGate = false) {
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
    skipGate,
    maxTurns: 10,
    keepTurns: 4,
  };
}

describe('topic-setup', () => {
  describe('runValidateTopic', () => {
    it('skipGate=true이면 LLM을 호출하지 않고 valid:true를 반환한다', async () => {
      const completeFn = jest.fn();
      const structuredFn = jest.fn();
      const llm = makeLlm(completeFn, structuredFn);

      const result = await runValidateTopic('주제', agents, llm, config, true);
      expect(result.valid).toBe(true);
      expect(completeFn).not.toHaveBeenCalled();
      expect(structuredFn).not.toHaveBeenCalled();
    });

    it('구조화 응답 valid:true이면 valid:true를 반환한다', async () => {
      const llm = makeLlm(jest.fn(), jest.fn().mockResolvedValue({ valid: true }));

      const result = await runValidateTopic('주제', agents, llm, config, false);
      expect(result.valid).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('구조화 응답 valid:false이면 valid:false와 reason을 반환한다', async () => {
      const llm = makeLlm(
        jest.fn(),
        jest.fn().mockResolvedValue({ valid: false, reason: '주제가 너무 광범위합니다.' }),
      );

      const result = await runValidateTopic('주제', agents, llm, config, false);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('주제가 너무 광범위합니다.');
    });

    it('구조화 응답이 null이면 폴백으로 valid:true를 반환한다', async () => {
      const llm = makeLlm(jest.fn(), jest.fn().mockResolvedValue(null));

      const result = await runValidateTopic('주제', agents, llm, config, false);
      expect(result.valid).toBe(true);
    });
  });

  describe('runDefineAgenda', () => {
    it('existing이 있고 outputContract가 있으면 그대로 반환한다', async () => {
      const existing = { discussionType: 'decision' as const, outputContract: ['결론'], options: [] };
      const llm = makeLlm(jest.fn());

      const result = await runDefineAgenda('주제', agents, llm, config, existing);
      expect(result).toBe(existing);
    });

    it('구조화 응답이 있으면 그것을 반환한다', async () => {
      const structured = {
        discussionType: 'review' as const,
        outputContract: ['결과'],
        options: ['옵션1'],
        brief: {
          objective: '검토',
          deliverable: '결과',
          inScope: ['범위'],
          outOfScope: ['제외'],
          requiredDimensions: ['검증'],
          rolePlan: [
            { agentId: 'a1', agentName: 'PM', relevance: 'core' as const, assignedContribution: '검증 기준' },
          ],
        },
      };
      const llm = makeLlm(jest.fn(), jest.fn().mockResolvedValue(structured));

      const result = await runDefineAgenda('주제', agents, llm, config, null);
      expect(result.discussionType).toBe('review');
      expect(result.outputContract).toEqual(['결과']);
      expect(result.options).toEqual(['옵션1']);
      expect(result.brief?.rolePlan).toEqual([
        expect.objectContaining({ agentId: 'a1', relevance: 'core', assignedContribution: '검증 기준' }),
      ]);
    });

    it('구조화 응답이 null이면 기본값을 반환한다', async () => {
      const llm = makeLlm(jest.fn(), jest.fn().mockResolvedValue(null));

      const result = await runDefineAgenda('주제', agents, llm, config, null);
      expect(result.discussionType).toBe('brainstorm');
      expect(result.outputContract).toEqual(['핵심 결론', '권고 사항', '실행 항목']);
      expect(result.brief?.rolePlan).toEqual([
        expect.objectContaining({ agentId: 'a1', relevance: 'supporting' }),
      ]);
    });
  });

  describe('validateTopic (노드 핸들러)', () => {
    it('skipGate=true이면 defineAgenda로 goto한다', async () => {
      const llm = makeLlm(jest.fn());
      const ctx = makeCtx(llm, true);
      const result = await validateTopic(ctx);
      expect(result.goto).toContain('defineAgenda');
    });

    it('valid:false이면 rejectTopic으로 goto한다', async () => {
      const llm = makeLlm(
        jest.fn(),
        jest.fn().mockResolvedValue({ valid: false, reason: '부적절한 주제' }),
      );
      const ctx = makeCtx(llm, false);
      const result = await validateTopic(ctx);
      expect(result.goto).toContain('rejectTopic');
    });

    it('valid:true이면 defineAgenda로 goto한다', async () => {
      const llm = makeLlm(
        jest.fn(),
        jest.fn().mockResolvedValue({ valid: true }),
      );
      const ctx = makeCtx(llm, false);
      const result = await validateTopic(ctx);
      expect(result.goto).toContain('defineAgenda');
    });
  });

  describe('rejectTopic (노드 핸들러)', () => {
    it('final/done/complete 이벤트를 방출하고 빈 객체를 반환한다', async () => {
      const llm = makeLlm(jest.fn());
      const ctx = makeCtx(llm);
      const events: RoomEvent[] = [];
      ctx.events.subscribe((e) => events.push(e));

      const state = makeState({
        turnLog: [{ role: 'moderator', agentName: '진행자', round: 0, content: '거절 이유' }],
      });
      const result = await rejectTopic(state, ctx);

      expect(result).toEqual({});
      const types = events.map((e) => e.type);
      expect(types).toContain('final');
      expect(types).toContain('done');
    });
  });

  describe('defineAgenda (노드 핸들러)', () => {
    it('outputContract가 있는 기존 상태면 기존 값을 반환한다', async () => {
      const llm = makeLlm(jest.fn(), jest.fn().mockResolvedValue(null));
      const ctx = makeCtx(llm);
      const state = makeState({
        outputContract: ['결론'],
        discussionType: 'decision',
        options: ['기존 옵션'],
      });
      const result = await defineAgenda(state, ctx);
      expect(result.outputContract).toEqual(['결론']);
      expect(result.options).toEqual(['기존 옵션']);
    });

    it('새 agenda의 options를 상태 업데이트에 포함한다', async () => {
      const llm = makeLlm(
        jest.fn(),
        jest.fn().mockResolvedValue({
          discussionType: 'decision',
          outputContract: ['결정'],
          options: ['offset 유지', 'cursor 전환'],
        }),
      );
      const ctx = makeCtx(llm);

      const result = await defineAgenda(makeState(), ctx);

      expect(result.options).toEqual(['offset 유지', 'cursor 전환']);
    });
  });
});
