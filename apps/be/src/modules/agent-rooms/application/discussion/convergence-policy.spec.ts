import {
  shouldConverge,
  hasActionableConclusion,
  hasSaturatedDraftableConclusion,
  conclusionDraftable,
  convergePressure,
  computeMaxTurns,
  contractSatisfied,
} from './convergence-policy';
import type { DiscussionStateType } from './discussion-state';

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

describe('convergence-policy', () => {
  describe('shouldConverge', () => {
    it('턴 상한 초과 시 true를 반환한다', () => {
      const state = makeState({ turn: 10 });
      expect(shouldConverge(state, 9)).toBe(true);
    });

    it('turn이 initialTurn 이하이면 maxTurns 초과해도 false를 반환한다', () => {
      const state = makeState({ turn: 0 });
      expect(shouldConverge(state, 0)).toBe(false);
    });

    it('droughtCount >= 3 시 true를 반환한다', () => {
      const state = makeState({ droughtCount: 3, turn: 1 });
      expect(shouldConverge(state, 100)).toBe(true);
    });

    it('droughtCount가 2이면 drought 조건을 충족하지 않는다(3이 임계값)', () => {
      const state = makeState({ droughtCount: 2, turn: 1 });
      expect(shouldConverge(state, 100)).toBe(false);
    });

    it('진동 쟁점(revisits >= 3)이 있으면 true를 반환한다', () => {
      const state = makeState({
        turn: 1,
        issues: [{ id: '1', title: '쟁점', status: 'open', claims: [], risks: [], proposals: [], lastTouchedTurn: 1, revisits: 3 }],
      });
      expect(shouldConverge(state, 100)).toBe(true);
    });

    it('조건 미달 시 false를 반환한다', () => {
      const state = makeState({ turn: 2, droughtCount: 0 });
      expect(shouldConverge(state, 10)).toBe(false);
    });

    it('initialTurn 이후 maxTurns에 도달하면 true이다', () => {
      const state = makeState({ turn: 19 });
      expect(shouldConverge(state, 19, 10)).toBe(true);
    });

    it('첫 바퀴 이후 실행 가능한 결론 후보와 전체 포화 신호가 있으면 조기 수렴한다', () => {
      const state = makeState({
        turn: 2,
        discussionType: 'decision',
        droughtCount: 2,
        participantStats: {
          a1: { turns: 2, newClaims: 1, repeatClaims: 3 },
          a2: { turns: 2, newClaims: 1, repeatClaims: 2 },
        },
        decisionCandidate: {
          recommendation: 'cursor 기반 페이지네이션으로 전환한다',
          conditions: ['offset API 호환 기간을 둔다'],
          risks: [],
          verification: ['중복/누락 메시지 회귀 테스트를 통과해야 한다'],
          isCommitted: false,
        },
      });
      const agents = [
        { id: 'a1', name: 'PM', instructions: '...', model: 'gpt-4o' },
        { id: 'a2', name: 'BE', instructions: '...', model: 'gpt-4o' },
      ];

      expect(shouldConverge(state, 100, 0, agents)).toBe(true);
    });

    it('실행 가능한 결론 후보가 있어도 첫 바퀴 전이면 조기 수렴하지 않는다', () => {
      const state = makeState({
        turn: 1,
        discussionType: 'decision',
        droughtCount: 1,
        decisionCandidate: {
          recommendation: 'cursor 기반 페이지네이션으로 전환한다',
          conditions: ['offset API 호환 기간을 둔다'],
          risks: [],
          verification: ['중복/누락 메시지 회귀 테스트를 통과해야 한다'],
          isCommitted: false,
        },
      });
      const agents = [
        { id: 'a1', name: 'PM', instructions: '...', model: 'gpt-4o' },
        { id: 'a2', name: 'BE', instructions: '...', model: 'gpt-4o' },
      ];

      expect(shouldConverge(state, 100, 0, agents)).toBe(false);
    });
  });

  describe('hasActionableConclusion', () => {
    const agents = [
      { id: 'a1', name: 'PM', instructions: '...', model: 'gpt-4o' },
      { id: 'a2', name: 'BE', instructions: '...', model: 'gpt-4o' },
    ];

    it('decision 후보가 recommendation/condition/verification을 갖추면 true이다', () => {
      const state = makeState({
        turn: 2,
        discussionType: 'decision',
        participantStats: {
          a1: { turns: 1, newClaims: 1, repeatClaims: 0 },
          a2: { turns: 1, newClaims: 1, repeatClaims: 0 },
        },
        decisionCandidate: {
          recommendation: 'cursor 기반 페이지네이션으로 전환한다',
          conditions: ['createdAt/id 복합 커서를 사용한다'],
          risks: [],
          verification: ['동시 삽입 상황에서 누락/중복이 없어야 한다'],
          isCommitted: false,
        },
      });

      expect(hasActionableConclusion(state, agents, 0)).toBe(true);
    });

    it('decision 후보가 verification을 갖지 않으면 false이다', () => {
      const state = makeState({
        turn: 2,
        discussionType: 'decision',
        droughtCount: 1,
        participantStats: {
          a1: { turns: 1, newClaims: 1, repeatClaims: 0 },
          a2: { turns: 1, newClaims: 1, repeatClaims: 0 },
        },
        decisionCandidate: {
          recommendation: 'cursor 기반 페이지네이션으로 전환한다',
          conditions: ['createdAt/id 복합 커서를 사용한다'],
          risks: [],
          verification: [],
          isCommitted: false,
        },
      });

      expect(hasActionableConclusion(state, agents, 0)).toBe(false);
    });
  });

  describe('hasSaturatedDraftableConclusion', () => {
    const agents = [
      { id: 'a1', name: 'PM', instructions: '...', model: 'gpt-4o' },
      { id: 'a2', name: 'BE', instructions: '...', model: 'gpt-4o' },
    ];

    const decisionCandidate = {
      recommendation: 'cursor 기반 페이지네이션으로 전환한다',
      conditions: ['createdAt/id 복합 커서를 사용한다'],
      risks: [],
      verification: ['동시 삽입 상황에서 누락/중복이 없어야 한다'],
      isCommitted: false,
    };

    it('첫 순회 완료, 결론 후보 충족, 최근 반복 누적, 전체 포화이면 true이다', () => {
      const state = makeState({
        turn: 2,
        discussionType: 'decision',
        droughtCount: 2,
        participantStats: {
          a1: { turns: 2, newClaims: 1, repeatClaims: 3 },
          a2: { turns: 2, newClaims: 1, repeatClaims: 2 },
        },
        decisionCandidate,
      });

      expect(hasSaturatedDraftableConclusion(state, agents, 0)).toBe(true);
    });

    it('첫 순회 전에는 false이다', () => {
      const state = makeState({
        turn: 1,
        discussionType: 'decision',
        droughtCount: 2,
        participantStats: {
          a1: { turns: 1, newClaims: 1, repeatClaims: 3 },
          a2: { turns: 0, newClaims: 0, repeatClaims: 0 },
        },
        decisionCandidate,
      });

      expect(hasSaturatedDraftableConclusion(state, agents, 0)).toBe(false);
    });

    it('새 기여가 더 많은 참가자가 남아 있으면 false이다', () => {
      const state = makeState({
        turn: 2,
        discussionType: 'decision',
        droughtCount: 2,
        participantStats: {
          a1: { turns: 1, newClaims: 1, repeatClaims: 3 },
          a2: { turns: 1, newClaims: 3, repeatClaims: 1 },
        },
        decisionCandidate,
      });

      expect(hasSaturatedDraftableConclusion(state, agents, 0)).toBe(false);
    });
  });

  describe('convergePressure', () => {
    it('lateStage(진행률 >= 0.6)이면 곁가지 자제 지시를 반환한다', () => {
      // turn=12/20 = 0.6 >= lateStageRatio(0.6)
      const state = makeState({ turn: 12 });
      const pressure = convergePressure(state, 20, 0);
      expect(pressure).toContain('후반부');
    });

    it('초반부이면 빈 문자열을 반환한다', () => {
      const state = makeState({ turn: 5 });
      const pressure = convergePressure(state, 20, 0);
      expect(pressure).toBe('');
    });

    it('span이 0이면 lateStage 분기를 건너뛰고 빈 문자열을 반환한다', () => {
      const state = makeState({ turn: 5 });
      const pressure = convergePressure(state, 5, 5);
      expect(pressure).toBe('');
    });
  });

  describe('computeMaxTurns', () => {
    it('참가자 수 × factor(5) + initialTurn을 반환한다', () => {
      expect(computeMaxTurns(3, 0)).toBe(15); // 3 * 5 + 0
    });

    it('참가자 수가 0일 때 factor를 반환한다', () => {
      expect(computeMaxTurns(0, 0)).toBe(5); // max(0*5, 5) = 5
    });

    it('initialTurn을 더한다', () => {
      expect(computeMaxTurns(2, 3)).toBe(13); // 2 * 5 + 3
    });
  });

  describe('shouldConverge — P0 보정 시나리오', () => {
    it('동일 권고 반복으로 droughtCount가 3 도달하면 shouldConverge가 true이다', () => {
      // P0 보정으로 repeatClaims가 누적되어 droughtCount가 3에 도달하는 시나리오
      const state = makeState({
        turn: 5,
        droughtCount: 3,
        participantStats: {
          a1: { turns: 2, newClaims: 1, repeatClaims: 3 },
          a2: { turns: 2, newClaims: 1, repeatClaims: 2 },
          a3: { turns: 1, newClaims: 0, repeatClaims: 2 },
        },
      });
      expect(shouldConverge(state, 100)).toBe(true);
    });
  });

  describe('contractSatisfied', () => {
    const baseCandidate = {
      recommendation: '최종 권고안',
      conditions: ['조건1'],
      verification: ['검증1'],
      risks: [],
      isCommitted: true,
    };

    it('candidate가 null이면 false를 반환한다', () => {
      expect(contractSatisfied('decision', null)).toBe(false);
    });

    it('recommendation이 빈 문자열이면 false를 반환한다', () => {
      expect(contractSatisfied('decision', { ...baseCandidate, recommendation: '   ' })).toBe(false);
    });

    it('isCommitted가 false이면 false를 반환한다', () => {
      expect(contractSatisfied('decision', { ...baseCandidate, isCommitted: false })).toBe(false);
    });

    it('미해소 모순이 있으면 false를 반환한다', () => {
      expect(contractSatisfied('brainstorm', baseCandidate, [
        { id: 'c1', description: '서로 다른 전제', kind: 'contradiction', turn: 1, resolved: false },
      ])).toBe(false);
    });

    it('decision 타입에서 conditions가 없으면 false를 반환한다', () => {
      expect(contractSatisfied('decision', { ...baseCandidate, conditions: [] })).toBe(false);
    });

    it('decision 타입에서 verification이 없으면 false를 반환한다', () => {
      expect(contractSatisfied('decision', { ...baseCandidate, verification: [] })).toBe(false);
    });

    it('decision 타입에서 모든 조건 충족 시 true를 반환한다', () => {
      expect(contractSatisfied('decision', baseCandidate)).toBe(true);
    });

    it('brainstorm 타입은 conditions/verification 없이도 true를 반환한다', () => {
      expect(contractSatisfied('brainstorm', { ...baseCandidate, conditions: [], verification: [] })).toBe(true);
    });

    it('review 타입은 conditions/verification 없이도 true를 반환한다', () => {
      expect(contractSatisfied('review', { ...baseCandidate, conditions: [], verification: [] })).toBe(true);
    });

    it('risk_check 타입은 conditions/verification 없이도 true를 반환한다', () => {
      expect(contractSatisfied('risk_check', { ...baseCandidate, conditions: [], verification: [] })).toBe(true);
    });
  });
});
