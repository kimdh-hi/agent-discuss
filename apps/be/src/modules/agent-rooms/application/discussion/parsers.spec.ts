import { claimExtractionSchema, speakerPickSchema, topicValidationSchema } from './parsers';

describe('claimExtractionSchema', () => {
  it('완전한 입력을 파싱한다', () => {
    const input = {
      issues: [
        {
          id: 'i1',
          title: '성능 이슈',
          status: 'open',
          claims: ['claim1'],
          risks: [],
          proposals: [],
          lastTouchedTurn: 1,
          revisits: 0,
        },
      ],
      newClaims: 2,
      repeatClaims: 1,
      decisionCandidate: {
        recommendation: '채택',
        conditions: ['조건1'],
        risks: [],
        verification: [],
        isCommitted: true,
      },
      inconsistencies: [
        { id: 'c1', description: '모순', kind: 'contradiction', turn: 1, resolved: false },
      ],
    };

    const result = claimExtractionSchema.parse(input);
    expect(result.issues).toHaveLength(1);
    expect(result.newClaims).toBe(2);
    expect(result.decisionCandidate?.recommendation).toBe('채택');
    expect(result.inconsistencies).toHaveLength(1);
  });

  it('issues가 누락되면 빈 배열로 기본값 처리한다', () => {
    const result = claimExtractionSchema.parse({ newClaims: 1, repeatClaims: 0 });
    expect(result.issues).toEqual([]);
  });

  it('newClaims/repeatClaims가 누락되면 0으로 기본값 처리한다', () => {
    const result = claimExtractionSchema.parse({});
    expect(result.newClaims).toBe(0);
    expect(result.repeatClaims).toBe(0);
  });

  it('inconsistencies가 누락되면 빈 배열로 기본값 처리한다', () => {
    const result = claimExtractionSchema.parse({});
    expect(result.inconsistencies).toEqual([]);
  });

  it('decisionCandidate가 누락되면 null이다', () => {
    const result = claimExtractionSchema.parse({});
    expect(result.decisionCandidate).toBeNull();
  });

  it('decisionCandidate.recommendation이 빈 문자열이면 null로 변환한다', () => {
    const result = claimExtractionSchema.parse({
      decisionCandidate: {
        recommendation: '   ',
        conditions: [],
        risks: [],
        verification: [],
        isCommitted: false,
      },
    });
    expect(result.decisionCandidate).toBeNull();
  });

  it('issue.status가 누락되면 open으로 기본값 처리한다', () => {
    const result = claimExtractionSchema.parse({
      issues: [{ id: 'i1', title: '이슈' }],
    });
    expect(result.issues[0]?.status).toBe('open');
  });

  it('issue.claims/risks/proposals가 누락되면 빈 배열이다', () => {
    const result = claimExtractionSchema.parse({
      issues: [{ id: 'i1', title: '이슈' }],
    });
    expect(result.issues[0]?.claims).toEqual([]);
    expect(result.issues[0]?.risks).toEqual([]);
    expect(result.issues[0]?.proposals).toEqual([]);
  });

  it('issue.lastTouchedTurn/revisits가 누락되면 0이다', () => {
    const result = claimExtractionSchema.parse({
      issues: [{ id: 'i1', title: '이슈' }],
    });
    expect(result.issues[0]?.lastTouchedTurn).toBe(0);
    expect(result.issues[0]?.revisits).toBe(0);
  });

  it('inconsistency.kind가 누락되면 contradiction이다', () => {
    const result = claimExtractionSchema.parse({
      inconsistencies: [{ id: 'c1', description: '모순' }],
    });
    expect(result.inconsistencies[0]?.kind).toBe('contradiction');
  });

  it('inconsistency.turn/resolved가 누락되면 기본값이다', () => {
    const result = claimExtractionSchema.parse({
      inconsistencies: [{ id: 'c1', description: '모순' }],
    });
    expect(result.inconsistencies[0]?.turn).toBe(0);
    expect(result.inconsistencies[0]?.resolved).toBe(false);
  });

  it('decisionCandidate.isCommitted가 누락되면 false이다', () => {
    const result = claimExtractionSchema.parse({
      decisionCandidate: {
        recommendation: '권고안',
        conditions: [],
        risks: [],
        verification: [],
      },
    });
    expect(result.decisionCandidate?.isCommitted).toBe(false);
  });

  it('decisionCandidate 내부 배열이 누락되면 빈 배열이다', () => {
    const result = claimExtractionSchema.parse({
      decisionCandidate: { recommendation: '권고안' },
    });
    expect(result.decisionCandidate?.conditions).toEqual([]);
    expect(result.decisionCandidate?.risks).toEqual([]);
    expect(result.decisionCandidate?.verification).toEqual([]);
  });

  it('부분 출력(issues만 있고 나머지 누락)을 null 없이 파싱한다', () => {
    const result = claimExtractionSchema.parse({
      issues: [{ id: 'i1', title: '이슈', status: 'decidable' }],
    });
    expect(result.issues[0]?.status).toBe('decidable');
    expect(result.newClaims).toBe(0);
    expect(result.decisionCandidate).toBeNull();
  });
});

describe('speakerPickSchema', () => {
  it('next가 null이면 null이다', () => {
    const result = speakerPickSchema.parse({ next: null });
    expect(result.next).toBeNull();
  });

  it('next가 undefined이면 null/undefined로 처리된다', () => {
    const result = speakerPickSchema.parse({});
    expect(result.next == null).toBe(true);
  });

  it('done이 누락되면 false이다', () => {
    const result = speakerPickSchema.parse({ next: 'a1' });
    expect(result.done).toBe(false);
  });

  it('next와 done이 모두 있으면 그대로 파싱한다', () => {
    const result = speakerPickSchema.parse({ next: 'a2', done: true, reason: '이유' });
    expect(result.next).toBe('a2');
    expect(result.done).toBe(true);
    expect(result.reason).toBe('이유');
  });
});

describe('topicValidationSchema', () => {
  it('valid:true를 파싱한다', () => {
    expect(topicValidationSchema.parse({ valid: true }).valid).toBe(true);
  });

  it('reason이 있으면 포함된다', () => {
    const result = topicValidationSchema.parse({ valid: false, reason: '이유' });
    expect(result.reason).toBe('이유');
  });
});
