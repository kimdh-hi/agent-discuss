jest.mock('./moderator', () => ({ pickSpeaker: jest.fn() }));

import { RoutingService } from './routing.service';
import { pickSpeaker } from './moderator';
import type { DiscussionStateType } from './discussion-state';
import type { RoomAgentSpec, RoomEvent } from './discussion.types';
import { ReplaySubject } from 'rxjs';

const agents: RoomAgentSpec[] = [
  { id: 'a1', name: 'PM', instructions: '...', model: 'gpt-4o' },
  { id: 'a2', name: '개발자', instructions: '...', model: 'gpt-4o' },
];

const threeAgents: RoomAgentSpec[] = [
  { id: 'a1', name: 'PM', instructions: '...', model: 'gpt-4o' },
  { id: 'a2', name: '프론트엔드', instructions: '...', model: 'gpt-4o' },
  { id: 'a3', name: '백엔드', instructions: '...', model: 'gpt-4o' },
];

function makeState(overrides: Partial<DiscussionStateType> = {}): DiscussionStateType {
  return {
    turn: 1,
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

function makeService(moderatorOverrides?: { pickSpeaker?: jest.Mock }) {
  (pickSpeaker as jest.Mock).mockReset();
  if (moderatorOverrides?.pickSpeaker) {
    (pickSpeaker as jest.Mock).mockImplementation(moderatorOverrides.pickSpeaker as never);
  } else {
    (pickSpeaker as jest.Mock).mockResolvedValue({ next: 'a1', done: false });
  }
  return new RoutingService();
}

function makeCtx(overrides: Partial<{ aborted: boolean }> = {}) {
  const events = new ReplaySubject<RoomEvent>(100);
  return {
    topic: '테스트',
    agents,
    events,
    signal: { aborted: overrides.aborted ?? false } as AbortSignal,
    ragService: { search: jest.fn() } as never,
    keepTurns: 4,
    llm: {
      complete: jest.fn(),
      completeStructured: jest.fn().mockResolvedValue(null),
      stream: jest.fn(),
      accumulatedUsage: jest.fn(),
      resetUsage: jest.fn(),
    } as never,
    config: { moderatorModel: 'gpt-4o' } as never,
    initialTurn: 0,
    skipGate: false,
    maxTurns: 10,
  };
}

describe('RoutingService', () => {
  describe('route', () => {
    it('directorResult.done이 true이고 turn>0이면 finalizeIfReady로 라우팅한다', () => {
      const service = makeService();
      const result = service.route(makeState({ turn: 2 }), agents, 0, { done: true, next: null });
      expect(result.goto).toContain('finalizeIfReady');
    });

    it('directorResult.done이 true이고 turn===0이면 speak으로 폴백한다', () => {
      const service = makeService();
      const result = service.route(makeState({ turn: 0 }), agents, 0, { done: true, next: null });
      expect(result.goto).toContain('speak');
    });

    it('directorResult에 next가 있으면 speak으로 라우팅한다', () => {
      const service = makeService();
      const result = service.route(makeState({ turn: 2 }), agents, 0, { done: false, next: 'a1' });
      expect(result.goto).toContain('speak');
      const update = result.update as Record<string, unknown> | undefined;
      expect(update?.['nextSpeakerId']).toBe('a1');
    });

    it('directorResult가 직전 발언자를 다시 지목하면 다중 에이전트 방에서는 다른 에이전트로 완화한다', () => {
      const service = makeService();
      const result = service.route(
        makeState({
          turn: 3,
          turnLog: [
            { role: 'agent', agentId: 'a1', agentName: 'PM', round: 0, content: '...' },
            { role: 'agent', agentId: 'a2', agentName: '개발자', round: 1, content: '...' },
            { role: 'agent', agentId: 'a1', agentName: 'PM', round: 2, content: '...' },
          ],
        }),
        agents,
        0,
        { done: false, next: 'a1' },
      );

      expect(result.goto).toContain('speak');
      const update = result.update as Record<string, unknown> | undefined;
      expect(update?.['nextSpeakerId']).toBe('a2');
    });

    it('에이전트가 없으면 __end__로 라우팅한다', () => {
      const service = makeService();
      const result = service.route(makeState({ turn: 1 }), [], 0, null);
      expect(result.goto).toContain('__end__');
    });

    it('첫 바퀴 중 pendingYield가 있어도 미발언자 순회를 먼저 완료한다', () => {
      const service = makeService();
      const roomAgents: RoomAgentSpec[] = [
        { id: 'a1', name: 'PM', instructions: '...', model: 'gpt-4o' },
        { id: 'a2', name: '프론트엔드', instructions: '...', model: 'gpt-4o' },
        { id: 'a3', name: '백엔드', instructions: '...', model: 'gpt-4o' },
      ];
      const result = service.route(
        makeState({
          turn: 1,
          turnLog: [{ role: 'agent', agentId: 'a1', agentName: 'PM', round: 0, content: '...' }],
        }),
        roomAgents,
        0,
        null,
      );

      expect(result.goto).toContain('speak');
      const update = result.update as Record<string, unknown> | undefined;
      expect(update?.['nextSpeakerId']).toBe('a2');
    });

    it('첫 바퀴 중 pendingYield 대상이 이미 발언했으면 미발언자 순회를 유지한다', () => {
      const service = makeService();
      const roomAgents: RoomAgentSpec[] = [
        { id: 'a1', name: 'PM', instructions: '...', model: 'gpt-4o' },
        { id: 'a2', name: '프론트엔드', instructions: '...', model: 'gpt-4o' },
        { id: 'a3', name: '백엔드', instructions: '...', model: 'gpt-4o' },
      ];
      const result = service.route(
        makeState({
          turn: 2,
          turnLog: [
            { role: 'agent', agentId: 'a1', agentName: 'PM', round: 0, content: '...' },
            { role: 'agent', agentId: 'a3', agentName: '백엔드', round: 1, content: '...' },
          ],
        }),
        roomAgents,
        0,
        null,
      );

      expect(result.goto).toContain('speak');
      const update = result.update as Record<string, unknown> | undefined;
      expect(update?.['nextSpeakerId']).toBe('a2');
    });

    it('director가 포화 참가자를 지명해도 생산적인 후보로 보정한다', () => {
      const service = makeService();
      const result = service.route(
        makeState({
          turn: 5,
          turnLog: [
            { role: 'agent', agentId: 'a1', agentName: 'PM', round: 0, content: 'PM 의견' },
            { role: 'agent', agentId: 'a2', agentName: '프론트엔드', round: 1, content: 'FE 의견' },
            { role: 'agent', agentId: 'a3', agentName: '백엔드', round: 2, content: 'BE 의견' },
            { role: 'agent', agentId: 'a3', agentName: '백엔드', round: 3, content: 'BE 반복' },
            { role: 'agent', agentId: 'a1', agentName: 'PM', round: 4, content: 'PM 반복' },
          ],
          participantStats: {
            a1: { turns: 2, newClaims: 1, repeatClaims: 4 },
            a2: { turns: 1, newClaims: 3, repeatClaims: 0 },
            a3: { turns: 2, newClaims: 1, repeatClaims: 5 },
          },
        }),
        threeAgents,
        0,
        { done: false, next: 'a1' },
      );

      expect(result.goto).toContain('speak');
      const update = result.update as Record<string, unknown> | undefined;
      expect(update?.['nextSpeakerId']).toBe('a2');
    });

    it('생산적 후보가 없고 결론 가능하면 finalizeIfReady로 간다', () => {
      const service = makeService();
      const result = service.route(
        makeState({
          turn: 3,
          discussionType: 'decision',
          droughtCount: 3,
          turnLog: [
            { role: 'agent', agentId: 'a1', agentName: 'PM', round: 0, content: 'PM 의견입니다.' },
            { role: 'agent', agentId: 'a2', agentName: '개발자', round: 1, content: '개발자 의견입니다.' },
          ],
          participantStats: {
            a1: { turns: 2, newClaims: 1, repeatClaims: 3 },
            a2: { turns: 2, newClaims: 1, repeatClaims: 2 },
          },
          decisionCandidate: {
            recommendation: 'cursor 기반 페이지네이션으로 전환한다',
            conditions: ['offset API 호환 기간을 둔다'],
            risks: [],
            verification: ['동시 삽입에서 중복/누락이 없어야 한다'],
            isCommitted: false,
          },
        }),
        agents,
        0,
        { done: false, next: 'a1' },
      );

      expect(result.goto).toContain('finalizeIfReady');
    });

    it('모든 후보가 반복-heavy이고 결론 후보가 불완전하면 fallback 발언 대신 반복 정체로 수렴한다', () => {
      const service = makeService();
      const result = service.route(
        makeState({
          turn: 3,
          discussionType: 'decision',
          droughtCount: 1,
          turnLog: [
            { role: 'agent', agentId: 'a1', agentName: 'PM', round: 0, content: 'PM 의견입니다.' },
            { role: 'agent', agentId: 'a2', agentName: '개발자', round: 1, content: '개발자 의견입니다.' },
          ],
          participantStats: {
            a1: { turns: 2, newClaims: 0, repeatClaims: 2 },
            a2: { turns: 2, newClaims: 0, repeatClaims: 2 },
          },
          decisionCandidate: {
            recommendation: 'Go',
            conditions: [],
            risks: [],
            verification: [],
            isCommitted: false,
          },
        }),
        agents,
        0,
        null,
      );

      expect(result.goto).toContain('finalizeIfReady');
      const update = result.update as Record<string, unknown> | undefined;
      expect(update?.['terminalReason']).toBe('stalled_repetition');
    });
  });

  describe('needsDirector', () => {
    it('firstPassPick이 가능하면 false를 반환한다(모더레이터 불필요)', () => {
      const service = makeService();
      const state = makeState({ turn: 0 });
      expect(service.needsDirector(state, agents, 0)).toBe(false);
    });

    it('firstPass 끝나고 생산적 후보가 있으면 false를 반환한다', () => {
      const service = makeService();
      const state = makeState({
        turn: 3,
        turnLog: [
          { role: 'agent', agentId: 'a1', agentName: 'PM', round: 0, content: '...' },
          { role: 'agent', agentId: 'a2', agentName: '개발자', round: 1, content: '...' },
        ],
        participantStats: {
          a1: { turns: 1, newClaims: 1, repeatClaims: 0 },
          a2: { turns: 1, newClaims: 1, repeatClaims: 0 },
        },
      });
      expect(service.needsDirector(state, agents, 0)).toBe(false);
    });

    it('모든 후보가 반복-heavy이면 반복 임계값 전에도 false를 반환한다', () => {
      const service = makeService();
      const state = makeState({
        turn: 3,
        discussionType: 'decision',
        droughtCount: 1,
        turnLog: [
          { role: 'agent', agentId: 'a1', agentName: 'PM', round: 0, content: 'PM 관점의 충분한 주장입니다.' },
          { role: 'agent', agentId: 'a2', agentName: '개발자', round: 1, content: '개발자 관점의 충분한 주장입니다.' },
        ],
        participantStats: {
          a1: { turns: 2, newClaims: 1, repeatClaims: 3 },
          a2: { turns: 2, newClaims: 1, repeatClaims: 2 },
        },
        decisionCandidate: {
          recommendation: 'cursor 기반 페이지네이션으로 전환한다',
          conditions: ['offset API 호환 기간을 둔다'],
          risks: [],
          verification: ['동시 삽입에서 중복/누락이 없어야 한다'],
          isCommitted: false,
        },
      });
      expect(service.needsDirector(state, agents, 0)).toBe(false);
    });

    it('생산적 후보가 있으면 false를 반환한다(모더레이터 불필요)', () => {
      const service = makeService();
      const state = makeState({
        turn: 3,
        turnLog: [
          { role: 'agent', agentId: 'a1', agentName: 'PM', round: 0, content: '...' },
          { role: 'agent', agentId: 'a2', agentName: '개발자', round: 1, content: '...' },
          { role: 'agent', agentId: 'a1', agentName: 'PM', round: 2, content: '...' },
        ],
      });
      expect(service.needsDirector(state, agents, 0)).toBe(false);
    });
  });

  describe('moderate (노드 핸들러)', () => {
    it('signal이 aborted이면 __end__로 goto하고 aborted:true를 업데이트한다', async () => {
      const service = makeService();
      const ctx = makeCtx({ aborted: true });
      const result = await service.moderate(makeState(), ctx);
      expect(result.goto).toContain('__end__');
      const update = result.update as Record<string, unknown> | undefined;
      expect(update?.['aborted']).toBe(true);
    });

    it('terminalReason이 있으면 finalizeIfReady로 직접 라우팅한다', async () => {
      const service = makeService();
      const ctx = makeCtx();
      const result = await service.moderate(makeState({ terminalReason: 'degenerate_barren' }), ctx);
      expect(result.goto).toContain('finalizeIfReady');
    });

    it('첫 바퀴 이후 품질이 부족하면 insufficient_first_pass로 finalizeIfReady에 보낸다', async () => {
      const service = makeService();
      const ctx = makeCtx();
      const state = makeState({
        turn: 2,
        turnLog: [
          { role: 'agent', agentId: 'a1', agentName: 'PM', round: 0, content: '짧음' },
          { role: 'agent', agentId: 'a2', agentName: '개발자', round: 1, content: '짧음' },
        ],
      });

      const result = await service.moderate(state, ctx);
      expect(result.goto).toContain('finalizeIfReady');
      const update = result.update as Record<string, unknown> | undefined;
      expect(update?.['terminalReason']).toBe('insufficient_first_pass');
    });

    it('shouldConverge 조건이면 finalizeIfReady로 goto한다', async () => {
      const service = makeService();
      const ctx = makeCtx();
      // droughtCount >= 3 + 모든 참가자 포화 → 더 말할 생산적 후보 없음
      const state = makeState({
        turn: 3,
        droughtCount: 3,
        participantStats: {
          a1: { turns: 2, newClaims: 1, repeatClaims: 2 },
          a2: { turns: 2, newClaims: 1, repeatClaims: 2 },
        },
        turnLog: [
          { role: 'agent', agentId: 'a1', agentName: 'PM', round: 0, content: 'PM 관점의 새 주장입니다.' },
          { role: 'agent', agentId: 'a2', agentName: '개발자', round: 1, content: '개발자 관점의 새 주장입니다.' },
        ],
      });
      const result = await service.moderate(state, ctx);
      expect(result.goto).toContain('finalizeIfReady');
    });

    it('수렴 조건이어도 생산적 후보가 있으면 결론보다 다음 발언을 우선한다', async () => {
      const service = makeService();
      const ctx = makeCtx();
      const state = makeState({
        discussionType: 'decision',
        turn: 2,
        participantStats: {
          a1: { turns: 1, newClaims: 1, repeatClaims: 0 },
          a2: { turns: 1, newClaims: 1, repeatClaims: 0 },
        },
        turnLog: [
          { role: 'agent', agentId: 'a1', agentName: 'PM', round: 0, content: 'PM 관점의 새 주장입니다.' },
          { role: 'agent', agentId: 'a2', agentName: '개발자', round: 1, content: '개발자 관점의 새 주장입니다.' },
        ],
        decisionCandidate: {
          recommendation: 'MVP에서는 수동 재사용만 제공한다',
          conditions: ['권한 경계를 유지한다'],
          risks: [],
          verification: ['중복 렌더링 회귀 테스트를 통과해야 한다'],
          isCommitted: false,
        },
      });

      const result = await service.moderate(state, ctx);
      expect(result.goto).toContain('speak');
      const update = result.update as Record<string, unknown> | undefined;
      expect(update?.['nextSpeakerId']).toBe('a1');
    });

    it('decision 수렴 직전에도 hidden challenge 없이 finalizeIfReady로 간다', async () => {
      const service = makeService();
      const ctx = makeCtx();
      const state = makeState({
        discussionType: 'decision',
        turn: 3,
        droughtCount: 3,
        participantStats: {
          a1: { turns: 2, newClaims: 1, repeatClaims: 2 },
          a2: { turns: 2, newClaims: 1, repeatClaims: 2 },
        },
        turnLog: [
          { role: 'agent', agentId: 'a1', agentName: 'PM', round: 0, content: 'PM 관점의 새 주장입니다.' },
          { role: 'agent', agentId: 'a2', agentName: '개발자', round: 1, content: '개발자 관점의 새 주장입니다.' },
        ],
      });

      const result = await service.moderate(state, ctx);
      expect(result.goto).toContain('finalizeIfReady');
    });

    it('drought 단독 수렴이지만 미발언 참가자가 있으면 speak으로 우선 라우팅한다', async () => {
      const service = makeService();
      const ctx = makeCtx();
      // a1만 발언(turn=1), a2는 미발언 상태에서 droughtCount >= 3
      // firstPassPick: turn(1) < initialTurn(0) + agents.length(2) = 2 → a2를 반환
      const state = makeState({
        turn: 1,
        droughtCount: 3,
        turnLog: [
          { role: 'agent', agentId: 'a1', agentName: 'PM', round: 0, content: '...' },
        ],
      });
      const result = await service.moderate(state, ctx);
      expect(result.goto).toContain('speak');
      const update = result.update as Record<string, unknown> | undefined;
      expect(update?.['nextSpeakerId']).toBe('a2');
    });

    it('정상 흐름에서 speak 또는 finalizeIfReady로 goto한다', async () => {
      const service = makeService();
      const ctx = makeCtx();
      const result = await service.moderate(makeState({ turn: 0 }), ctx);
      const validTargets = ['speak', 'finalizeIfReady', '__end__'];
      const gotoArr = result.goto as string[];
      expect(gotoArr.some((g) => validTargets.includes(g))).toBe(true);
    });

    it('director 필요 시 pickSpeaker를 호출하고 status 이벤트를 방출한다', async () => {
      const service = makeService({
        pickSpeaker: jest.fn().mockResolvedValue({ next: 'a1', reason: '차례', done: false }),
      });
      const ctx = makeCtx();
      const emitted: RoomEvent[] = [];
      ctx.events.subscribe((e) => emitted.push(e));

      const state = makeState({
        turn: 3,
        discussionType: 'decision',
        droughtCount: 1,
        brief: {
          objective: '보안 검토',
          deliverable: '검증 항목',
          inScope: ['보안'],
          outOfScope: [],
          requiredDimensions: ['보안 검증'],
          rolePlan: [
            { agentId: 'a1', relevance: 'supporting', assignedContribution: '마케팅 메시지' },
            { agentId: 'a2', relevance: 'supporting', assignedContribution: '가격 정책' },
          ],
        },
        participantStats: {
          a1: { turns: 1, newClaims: 1, repeatClaims: 0 },
          a2: { turns: 1, newClaims: 1, repeatClaims: 0 },
        },
        turnLog: [
          { role: 'agent', agentId: 'a1', agentName: 'PM', round: 0, content: 'PM 관점의 새 주장입니다.' },
          { role: 'agent', agentId: 'a2', agentName: '개발자', round: 1, content: '개발자 관점의 새 주장입니다.' },
        ],
        decisionCandidate: null,
      });
      await service.moderate(state, ctx);

      expect(pickSpeaker)
        .toHaveBeenCalledWith(
          '테스트',
          state,
          agents,
          ctx.llm,
          ctx.config,
          ctx.keepTurns,
          '',
        );
      const statusEvents = emitted.filter((e) => e.type === 'status');
      expect(statusEvents.length).toBeGreaterThan(0);
    });
  });

});
