import { draftConclusion, extractClaims, pickSpeaker } from './moderator';
import type { DiscussionStateType } from './discussion-state';
import type { RoomAgentSpec } from './discussion.types';

const agents: RoomAgentSpec[] = [
  { id: 'a1', name: 'PM', instructions: '...', model: 'gpt-4o' },
  { id: 'a2', name: '개발자', instructions: '...', model: 'gpt-4o' },
];

const config = { moderatorModel: 'gpt-4o', agentDefaultModel: 'gpt-4o' } as never;

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
    outputContract: ['결론'],
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

function makeLlm(structuredResult: unknown) {
  return {
    complete: jest.fn(),
    completeStructured: jest.fn().mockResolvedValue(structuredResult),
    stream: jest.fn(),
    accumulatedUsage: jest.fn().mockReturnValue({ inputTokens: 0, outputTokens: 0 }),
    resetUsage: jest.fn(),
  } as never;
}

describe('moderator', () => {
  describe('pickSpeaker', () => {
    it('구조화 응답이 null이면 첫 번째 에이전트를 반환한다', async () => {
      const llm = makeLlm(null);
      const result = await pickSpeaker('원래 주제', makeState(), agents, llm, config);
      expect(result.next).toBe('a1');
    });

    it('구조화 응답의 next가 유효한 에이전트 ID이면 그 에이전트를 반환한다', async () => {
      const llm = makeLlm({ next: 'a2', reason: '개발자 차례', done: false });
      const result = await pickSpeaker('원래 주제', makeState(), agents, llm, config);
      expect(result.next).toBe('a2');
      expect(result.reason).toBe('개발자 차례');
    });

    it('구조화 응답의 next가 유효하지 않은 에이전트 ID이면 null을 반환한다', async () => {
      const llm = makeLlm({ next: 'unknown-id', done: false });
      const result = await pickSpeaker('원래 주제', makeState(), agents, llm, config);
      expect(result.next).toBeNull();
    });

    it('done:true이면 done 플래그를 반환한다', async () => {
      const llm = makeLlm({ next: null, done: true });
      const result = await pickSpeaker('원래 주제', makeState(), agents, llm, config);
      expect(result.done).toBe(true);
    });

    it('agents가 빈 배열이면 next가 null이다', async () => {
      const llm = makeLlm(null);
      const result = await pickSpeaker('원래 주제', makeState(), [], llm, config);
      expect(result.next).toBeNull();
    });

    it('첫 발언이 아니라 원래 topic을 prompt에 사용한다', async () => {
      const llm = makeLlm({ next: 'a2', done: false });
      const state = makeState({
        turnLog: [{ role: 'agent', agentId: 'a1', agentName: 'PM', round: 0, content: '첫 PM 발언' }],
      });

      await pickSpeaker('채팅 메시지 cursor 페이지네이션 전환', state, agents, llm, config);

      const call = (llm as never as { completeStructured: jest.Mock }).completeStructured.mock.calls[0]?.[0];
      expect(call.messages[0].content).toContain('채팅 메시지 cursor 페이지네이션 전환');
      expect(call.messages[0].content).not.toContain('토론 주제: "첫 PM 발언"');
    });
  });

  describe('extractClaims', () => {
    it('구조화 응답이 있으면 그것을 반환한다', async () => {
      const extraction = {
        issues: [{ id: 'i1', title: '성능 이슈', status: 'open', claims: [], risks: [], proposals: [], lastTouchedTurn: 1, revisits: 0 }],
        newClaims: 1,
        repeatClaims: 0,
        decisionCandidate: null,
        inconsistencies: [],
      };
      const llm = makeLlm(extraction);
      const result = await extractClaims('발언 내용', 1, makeState(), llm, config);
      expect(result.newClaims).toBe(1);
      expect(result.issues).toHaveLength(1);
    });

    it('구조화 응답이 null이고 발언이 substantive하면 repeat로 반환한다', async () => {
      const llm = makeLlm(null);
      const state = makeState({
        issues: [{ id: 'i1', title: '기존 이슈', status: 'open', claims: [], risks: [], proposals: [], lastTouchedTurn: 0, revisits: 0 }],
      });
      const substantiveSpeech = 'cursor 기반 전환 전에 기존 offset API 호환 기간을 정해야 합니다.';
      const result = await extractClaims(substantiveSpeech, 1, state, llm, config);
      expect(result.newClaims).toBe(0);
      expect(result.repeatClaims).toBe(1);
      expect(result.issues).toEqual([]);
    });

    it('구조화 응답이 null이고 발언이 비어있으면 newClaims:0이다', async () => {
      const llm = makeLlm(null);
      const result = await extractClaims('', 1, makeState(), llm, config);
      expect(result.newClaims).toBe(0);
    });

    it('구조화 응답이 null이면 기존 structured state를 새 추출로 재사용하지 않는다', async () => {
      const llm = makeLlm(null);
      const existingCandidate = { recommendation: '기존 권고', conditions: [], risks: [], verification: [], isCommitted: false };
      const state = makeState({
        issues: [{ id: 'i1', title: '기존 이슈', status: 'open', claims: [], risks: [], proposals: [], lastTouchedTurn: 0, revisits: 0 }],
        decisionCandidate: existingCandidate,
      });
      const result = await extractClaims('substantive 발언', 1, state, llm, config);
      expect(result.issues).toEqual([]);
      expect(result.decisionCandidate).toBeNull();
    });
  });

  describe('draftConclusion', () => {
    it('구조화 응답이 있으면 그것을 반환한다', async () => {
      const extraction = {
        issues: [],
        newClaims: 0,
        repeatClaims: 0,
        decisionCandidate: { recommendation: '채택', conditions: ['조건1'], risks: [], verification: [], isCommitted: true },
        inconsistencies: [],
      };
      const llm = makeLlm(extraction);
      const result = await draftConclusion(makeState(), llm, config, '토픽');
      expect(result.decisionCandidate?.recommendation).toBe('채택');
    });

    it('구조화 응답이 null이면 새 권고안이나 decidable 이슈를 발명하지 않는다', async () => {
      const llm = makeLlm(null);
      const state = makeState({
        issues: [
          { id: 'i1', title: '기존 이슈', status: 'open', claims: [], risks: [], proposals: [], lastTouchedTurn: 0, revisits: 0 },
        ],
      });
      const result = await draftConclusion(state, llm, config, '토픽');
      expect(result.decisionCandidate).toBeNull();
      expect(result.issues).toEqual(state.issues);
      expect(result.issues[0]?.status).toBe('open');
    });

    it('기존 decisionCandidate가 있으면 그것을 유지한다', async () => {
      const llm = makeLlm(null);
      const existing = { recommendation: '기존 권고', conditions: [], risks: [], verification: [], isCommitted: false };
      const result = await draftConclusion(makeState({ decisionCandidate: existing }), llm, config, '토픽');
      expect(result.decisionCandidate?.recommendation).toBe('기존 권고');
    });

    it('구조화 응답의 decisionCandidate가 null이어도 기존 후보를 보존한다', async () => {
      const existing = { recommendation: '기존 권고', conditions: ['조건'], risks: [], verification: ['검증'], isCommitted: false };
      const llm = makeLlm({
        issues: [],
        newClaims: 0,
        repeatClaims: 0,
        decisionCandidate: null,
        inconsistencies: [],
      });

      const result = await draftConclusion(makeState({ decisionCandidate: existing }), llm, config, '토픽');

      expect(result.decisionCandidate).toEqual(existing);
    });
  });
});
