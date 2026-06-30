import * as service from './speaker-selector.service';
import type { DiscussionStateType } from './discussion-state';
import type { DiscussionBrief, RoomAgentSpec } from './discussion.types';

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

const agents: RoomAgentSpec[] = [
  { id: 'a1', name: 'PM', instructions: '...', model: 'gpt-4o-mini' },
  { id: 'a2', name: '백엔드', instructions: '...', model: 'gpt-4o-mini' },
];

const threeAgents: RoomAgentSpec[] = [
  { id: 'a1', name: 'PM', instructions: '...', model: 'gpt-4o-mini' },
  { id: 'a2', name: '프론트엔드', instructions: '...', model: 'gpt-4o-mini' },
  { id: 'a3', name: '백엔드', instructions: '...', model: 'gpt-4o-mini' },
];

function makeBrief(rolePlan: DiscussionBrief['rolePlan']): DiscussionBrief {
  return {
    objective: '임의 토픽',
    deliverable: '결론',
    inScope: ['scope-a'],
    outOfScope: ['scope-z'],
    requiredDimensions: ['dimension-a'],
    rolePlan,
  };
}

describe('speaker selector helpers', () => {
  describe('firstPassPick', () => {
    it('첫 바퀴에서 미발언자를 순서대로 지명한다', () => {
      const state = makeState({ turn: 0 });
      expect(service.firstPassPick(state, agents, 0)).toBe('a1');
    });

    it('a1이 발언했으면 a2를 지명한다', () => {
      const state = makeState({
        turn: 1,
        turnLog: [{ role: 'agent', agentId: 'a1', agentName: 'PM', round: 0, content: '...' }],
      });
      expect(service.firstPassPick(state, agents, 0)).toBe('a2');
    });

    it('모두 발언했으면 null을 반환한다', () => {
      const state = makeState({
        turn: 2,
        turnLog: [
          { role: 'agent', agentId: 'a1', agentName: 'PM', round: 0, content: '...' },
          { role: 'agent', agentId: 'a2', agentName: '백엔드', round: 1, content: '...' },
        ],
      });
      expect(service.firstPassPick(state, agents, 0)).toBeNull();
    });

    it('brief가 있으면 out_of_scope 참가자는 첫 순회에서 건너뛴다', () => {
      const genericAgents: RoomAgentSpec[] = [
        { id: 'r1', name: '역할1', instructions: '...', model: 'gpt-4o-mini' },
        { id: 'r2', name: '역할2', instructions: '...', model: 'gpt-4o-mini' },
        { id: 'r3', name: '역할3', instructions: '...', model: 'gpt-4o-mini' },
      ];
      const state = makeState({
        brief: makeBrief([
          { agentId: 'r1', relevance: 'out_of_scope', exclusionReason: '이번 토픽 범위 밖' },
          { agentId: 'r2', relevance: 'core', assignedContribution: 'dimension-a 결정' },
          { agentId: 'r3', relevance: 'supporting', assignedContribution: 'dimension-a 검증' },
        ]),
      });

      expect(service.firstPassPick(state, genericAgents, 0)).toBe('r2');
    });

    it('brief에 core가 있으면 첫 순회는 core만 대상으로 한다', () => {
      const genericAgents: RoomAgentSpec[] = [
        { id: 'r1', name: '역할1', instructions: '...', model: 'gpt-4o-mini' },
        { id: 'r2', name: '역할2', instructions: '...', model: 'gpt-4o-mini' },
        { id: 'r3', name: '역할3', instructions: '...', model: 'gpt-4o-mini' },
      ];
      const state = makeState({
        turn: 1,
        turnLog: [{ role: 'agent', agentId: 'r2', agentName: '역할2', round: 0, content: '...' }],
        brief: makeBrief([
          { agentId: 'r1', relevance: 'out_of_scope', exclusionReason: '범위 밖' },
          { agentId: 'r2', relevance: 'core', assignedContribution: 'dimension-a 결정' },
          { agentId: 'r3', relevance: 'supporting', assignedContribution: 'dimension-a 검증' },
        ]),
      });

      expect(service.firstPassPick(state, genericAgents, 0)).toBeNull();
    });

    it('brief가 모든 참가자를 out_of_scope로 분류하면 첫 순회 후보가 없다', () => {
      const state = makeState({
        brief: makeBrief([
          { agentId: 'a1', relevance: 'out_of_scope', exclusionReason: '범위 밖' },
          { agentId: 'a2', relevance: 'out_of_scope', exclusionReason: '범위 밖' },
        ]),
      });

      expect(service.firstPassPick(state, agents, 0)).toBeNull();
    });
  });

  describe('nextProductivePick', () => {
    it('첫 순회 중에는 미발언자를 우선한다', () => {
      const state = makeState({
        turn: 1,
        turnLog: [{ role: 'agent', agentId: 'a1', agentName: 'PM', round: 0, content: '...' }],
      });

      expect(service.nextProductivePick(state, threeAgents, 0)).toBe('a2');
    });

    it('첫 순회 이후 반복-heavy 참가자보다 덜 포화된 참가자를 선택한다', () => {
      const state = makeState({
        turn: 4,
        turnLog: [
          { role: 'agent', agentId: 'a1', agentName: 'PM', round: 0, content: 'PM 의견' },
          { role: 'agent', agentId: 'a2', agentName: '프론트엔드', round: 1, content: 'FE 의견' },
          { role: 'agent', agentId: 'a3', agentName: '백엔드', round: 2, content: 'BE 의견' },
          { role: 'agent', agentId: 'a1', agentName: 'PM', round: 3, content: 'PM 반복' },
        ],
        participantStats: {
          a1: { turns: 2, newClaims: 1, repeatClaims: 4 },
          a2: { turns: 1, newClaims: 3, repeatClaims: 0 },
          a3: { turns: 1, newClaims: 1, repeatClaims: 3 },
        },
      });

      expect(service.nextProductivePick(state, threeAgents, 0)).toBe('a2');
    });

    it('첫 발언이 반복으로 판정된 참가자도 한 번은 더 발언 후보로 남긴다', () => {
      const state = makeState({
        turn: 3,
        turnLog: [
          { role: 'agent', agentId: 'a1', agentName: 'PM', round: 0, content: 'PM 의견' },
          { role: 'agent', agentId: 'a2', agentName: '프론트엔드', round: 1, content: 'FE 의견' },
          { role: 'agent', agentId: 'a3', agentName: '백엔드', round: 2, content: 'BE 의견' },
        ],
        participantStats: {
          a1: { turns: 1, newClaims: 0, repeatClaims: 1 },
          a2: { turns: 1, newClaims: 0, repeatClaims: 1 },
          a3: { turns: 1, newClaims: 0, repeatClaims: 1 },
        },
      });

      expect(service.nextProductivePick(state, threeAgents, 0)).toBe('a1');
    });

    it('발언 수가 적은 참가자보다 주요 쟁점을 채울 수 있는 참가자를 우선한다', () => {
      const state = makeState({
        turn: 4,
        turnLog: [
          { role: 'agent', agentId: 'a1', agentName: 'PM', round: 0, content: 'PM 의견' },
          { role: 'agent', agentId: 'a3', agentName: '백엔드', round: 2, content: 'BE 의견' },
          { role: 'agent', agentId: 'a1', agentName: 'PM', round: 3, content: 'PM 보강' },
        ],
        participantStats: {
          a1: { turns: 1, newClaims: 2, repeatClaims: 0 },
          a2: { turns: 0, newClaims: 0, repeatClaims: 0 },
          a3: { turns: 2, newClaims: 2, repeatClaims: 0 },
        },
        brief: makeBrief([
          { agentId: 'a1', relevance: 'core', assignedContribution: 'dimension-a 결정' },
          { agentId: 'a2', relevance: 'supporting', assignedContribution: 'unrelated-only' },
          { agentId: 'a3', relevance: 'supporting', assignedContribution: 'dimension-a 검증' },
        ]),
      });

      expect(service.nextProductivePick(state, threeAgents, 0)).toBe('a3');
    });

    it('모든 후보가 포화이고 결론 후보가 작성 가능하면 null을 반환한다', () => {
      const state = makeState({
        turn: 5,
        discussionType: 'decision',
        turnLog: [
          { role: 'agent', agentId: 'a1', agentName: 'PM', round: 0, content: 'PM 의견' },
          { role: 'agent', agentId: 'a2', agentName: '프론트엔드', round: 1, content: 'FE 의견' },
          { role: 'agent', agentId: 'a3', agentName: '백엔드', round: 2, content: 'BE 의견' },
          { role: 'agent', agentId: 'a1', agentName: 'PM', round: 3, content: 'PM 반복' },
        ],
        participantStats: {
          a1: { turns: 2, newClaims: 1, repeatClaims: 4 },
          a2: { turns: 2, newClaims: 1, repeatClaims: 3 },
          a3: { turns: 2, newClaims: 1, repeatClaims: 2 },
        },
        decisionCandidate: {
          recommendation: 'cursor 기반 페이지네이션으로 전환한다',
          conditions: ['offset API 호환 기간을 둔다'],
          risks: [],
          verification: ['동시 삽입에서 중복/누락이 없어야 한다'],
          isCommitted: false,
        },
      });

      expect(service.nextProductivePick(state, threeAgents, 0)).toBeNull();
    });

    it('결론 후보가 부족해도 모든 후보가 반복-heavy이면 null을 반환한다', () => {
      const state = makeState({
        turn: 5,
        discussionType: 'decision',
        turnLog: [
          { role: 'agent', agentId: 'a1', agentName: 'PM', round: 0, content: 'PM 의견' },
          { role: 'agent', agentId: 'a2', agentName: '프론트엔드', round: 1, content: 'FE 의견' },
          { role: 'agent', agentId: 'a3', agentName: '백엔드', round: 2, content: 'BE 의견' },
          { role: 'agent', agentId: 'a1', agentName: 'PM', round: 3, content: 'PM 반복' },
        ],
        participantStats: {
          a1: { turns: 2, newClaims: 1, repeatClaims: 4 },
          a2: { turns: 2, newClaims: 1, repeatClaims: 3 },
          a3: { turns: 2, newClaims: 1, repeatClaims: 2 },
        },
        decisionCandidate: {
          recommendation: 'cursor 기반 페이지네이션으로 전환한다',
          conditions: ['offset API 호환 기간을 둔다'],
          risks: [],
          verification: [],
          isCommitted: false,
        },
      });

      expect(service.nextProductivePick(state, threeAgents, 0)).toBeNull();
      expect(service.hasStalledRepetition(state, threeAgents)).toBe(true);
    });
  });

  describe('selectNextSpeaker', () => {
    it('지명자가 반복-heavy이면 다른 경로에서도 선택하지 않는다', () => {
      const state = makeState({
        turn: 4,
        turnLog: [
          { role: 'agent', agentId: 'a1', agentName: 'PM', round: 0, content: 'PM 의견' },
          { role: 'agent', agentId: 'a2', agentName: '백엔드', round: 1, content: 'BE 의견' },
        ],
        participantStats: {
          a1: { turns: 2, newClaims: 0, repeatClaims: 3 },
          a2: { turns: 1, newClaims: 1, repeatClaims: 0 },
        },
      });

      expect(service.selectNextSpeaker(state, agents, 0, 'a1')).toBeNull();
    });
  });

  describe('roundRobinPick', () => {
    it('직전 발언자(a1) 다음 에이전트(a2)를 반환한다', () => {
      expect(service.roundRobinPick(agents, 'a1')).toBe('a2');
    });

    it('직전 발언자(a2) 다음 에이전트(a1)를 반환한다 — 순환', () => {
      expect(service.roundRobinPick(agents, 'a2')).toBe('a1');
    });

    it('lastId가 null이면 첫 번째 에이전트를 반환한다', () => {
      expect(service.roundRobinPick(agents, null)).toBe('a1');
    });

    it('lastId가 목록에 없으면 첫 번째 에이전트를 반환한다', () => {
      expect(service.roundRobinPick(agents, 'unknown')).toBe('a1');
    });

    it('에이전트가 1명이면 자기 자신을 반환한다(불가피)', () => {
      const single: RoomAgentSpec[] = [{ id: 'a1', name: 'PM', instructions: '...', model: 'gpt-4o-mini' }];
      expect(service.roundRobinPick(single, 'a1')).toBe('a1');
    });

    it('에이전트가 없으면 null을 반환한다', () => {
      expect(service.roundRobinPick([], 'a1')).toBeNull();
    });
  });

  describe('avoidImmediateRepeat', () => {
    it('지명자가 직전 발언자이면 다음 순번 참가자로 바꾼다', () => {
      const state = makeState({
        turnLog: [{ role: 'agent', agentId: 'a1', agentName: 'PM', round: 0, content: '...' }],
      });

      expect(service.avoidImmediateRepeat(state, agents, 'a1')).toBe('a2');
    });

    it('지명자가 직전 발언자가 아니면 그대로 유지한다', () => {
      const state = makeState({
        turnLog: [{ role: 'agent', agentId: 'a1', agentName: 'PM', round: 0, content: '...' }],
      });

      expect(service.avoidImmediateRepeat(state, agents, 'a2')).toBe('a2');
    });
  });
});
