import { DiscussionState, mergeById, mergeIssues, mergeStats } from './discussion-state';
import type { Issue, Inconsistency, ParticipantStat, TurnEntry } from './discussion.types';

describe('DiscussionState', () => {
  it('필수 필드가 정의되어 있다', () => {
    const spec = DiscussionState.spec;
    expect(spec.turn).toBeDefined();
    expect(spec.turnLog).toBeDefined();
    expect(spec.issues).toBeDefined();
    expect(spec.inconsistencies).toBeDefined();
    expect(spec.participantStats).toBeDefined();
    expect(spec.options).toBeDefined();
    expect(spec.terminalReason).toBeDefined();
  });

  it('barrenStreak 필드가 정의되어 있다', () => {
    expect(DiscussionState.spec.barrenStreak).toBeDefined();
  });

  it('barrenStreak 기본값이 0이다', () => {
    // LangGraph Annotation spec은 initialValueFactory로 기본값을 노출한다
    const channel = DiscussionState.spec.barrenStreak as unknown as { initialValueFactory: () => number };
    expect(channel.initialValueFactory()).toBe(0);
  });

  it('barrenStreak operator(reducer)는 마지막 값으로 덮어쓴다', () => {
    // LangGraph Annotation spec은 operator로 reducer를 노출한다
    const channel = DiscussionState.spec.barrenStreak as unknown as { operator: (a: number, b: number) => number };
    expect(channel.operator(0, 3)).toBe(3);
    expect(channel.operator(5, 1)).toBe(1);
    expect(channel.operator(2, 0)).toBe(0);
  });
});

describe('mergeById', () => {
  it('id 기반으로 issues를 병합한다', () => {
    const existing: Issue[] = [
      { id: 'i1', title: '이슈1', status: 'open', claims: [], risks: [], proposals: [], lastTouchedTurn: 0, revisits: 0 },
    ];
    const incoming: Issue[] = [
      { id: 'i1', title: '이슈1 업데이트', status: 'decidable', claims: [], risks: [], proposals: [], lastTouchedTurn: 1, revisits: 0 },
      { id: 'i2', title: '이슈2', status: 'open', claims: [], risks: [], proposals: [], lastTouchedTurn: 0, revisits: 0 },
    ];

    const result = mergeById(existing, incoming);
    expect(result).toHaveLength(2);
    expect(result.find((i) => i.id === 'i1')?.title).toBe('이슈1 업데이트');
    expect(result.find((i) => i.id === 'i2')).toBeDefined();
  });

  it('inconsistencies를 id 기반으로 병합한다', () => {
    const existing: Inconsistency[] = [
      { id: 'c1', description: '모순1', kind: 'contradiction', turn: 0, resolved: false },
    ];
    const incoming: Inconsistency[] = [
      { id: 'c1', description: '모순1 해결됨', kind: 'contradiction', turn: 0, resolved: true },
    ];

    const result = mergeById(existing, incoming);
    expect(result).toHaveLength(1);
    expect(result[0]?.resolved).toBe(true);
  });

  it('빈 배열에서 새 항목을 추가한다', () => {
    const incoming: Issue[] = [
      { id: 'i1', title: '새 이슈', status: 'open', claims: [], risks: [], proposals: [], lastTouchedTurn: 0, revisits: 0 },
    ];
    const result = mergeById([], incoming);
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('i1');
  });
});

describe('mergeIssues', () => {
  function issue(overrides: Partial<Issue> = {}): Issue {
    return {
      id: 'cursor-compat',
      title: '호환성',
      status: 'open',
      claims: [],
      risks: [],
      proposals: [],
      lastTouchedTurn: 1,
      revisits: 0,
      ...overrides,
    };
  }

  it('같은 issue id가 새 턴에서 다시 들어오면 revisits를 단조 증가시킨다', () => {
    const result = mergeIssues(
      [issue({ lastTouchedTurn: 1, revisits: 0 })],
      [issue({ lastTouchedTurn: 2, revisits: 0, claims: ['직접 이동 제한'] })],
    );

    expect(result[0]).toEqual(expect.objectContaining({
      lastTouchedTurn: 2,
      revisits: 1,
      claims: ['직접 이동 제한'],
    }));
  });

  it('같은 턴 재적용은 revisits를 추가 증가시키지 않는다', () => {
    const result = mergeIssues(
      [issue({ lastTouchedTurn: 2, revisits: 2 })],
      [issue({ lastTouchedTurn: 2, revisits: 1 })],
    );

    expect(result[0]?.revisits).toBe(2);
  });
});

describe('mergeStats', () => {
  it('기존 stats를 누적한다', () => {
    const existing: Record<string, ParticipantStat> = { 'a1': { turns: 2, newClaims: 1, repeatClaims: 0 } };
    const incoming: Record<string, ParticipantStat> = {
      'a1': { turns: 1, newClaims: 2, repeatClaims: 1 },
      'a2': { turns: 1, newClaims: 0, repeatClaims: 0 },
    };

    const result = mergeStats(existing, incoming);
    expect(result['a1']?.turns).toBe(3);
    expect(result['a1']?.newClaims).toBe(3);
    expect(result['a2']?.turns).toBe(1);
  });

  it('새 에이전트 id를 추가한다', () => {
    const result = mergeStats({}, { 'new-agent': { turns: 1, newClaims: 3, repeatClaims: 0 } });
    expect(result['new-agent']?.turns).toBe(1);
    expect(result['new-agent']?.newClaims).toBe(3);
  });
});

describe('turnLog reducer (concat)', () => {
  it('배열을 연결한다', () => {
    const a: TurnEntry[] = [{ role: 'agent', agentName: 'PM', round: 0, content: '발언1' }];
    const b: TurnEntry[] = [{ role: 'moderator', agentName: '진행자', round: 1, content: '결론' }];
    const result = [...a, ...b];
    expect(result).toHaveLength(2);
  });
});
