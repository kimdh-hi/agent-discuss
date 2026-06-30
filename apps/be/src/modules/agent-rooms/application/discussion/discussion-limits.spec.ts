import { computeKeepTurns, DISCUSSION_LIMITS } from './discussion-limits';

describe('DISCUSSION_LIMITS', () => {
  it('maxConsecutiveBarren이 3이다', () => {
    expect(DISCUSSION_LIMITS.maxConsecutiveBarren).toBe(3);
  });

  it('droughtThreshold가 3이다', () => {
    expect(DISCUSSION_LIMITS.droughtThreshold).toBe(3);
  });
});

describe('computeKeepTurns', () => {
  it('에이전트 수가 적으면 compactKeepTurns 기본값을 반환한다', () => {
    expect(computeKeepTurns(1)).toBe(DISCUSSION_LIMITS.compactKeepTurns);
    expect(computeKeepTurns(2)).toBe(DISCUSSION_LIMITS.compactKeepTurns);
    expect(computeKeepTurns(3)).toBe(DISCUSSION_LIMITS.compactKeepTurns);
  });

  it('에이전트 수 + 1이 compactKeepTurns보다 크면 그 값을 반환한다', () => {
    expect(computeKeepTurns(5)).toBe(6);
    expect(computeKeepTurns(10)).toBe(11);
  });

  it('에이전트 수 + 1이 compactKeepTurns와 같으면 그 값을 반환한다', () => {
    const atBoundary = DISCUSSION_LIMITS.compactKeepTurns - 1;
    expect(computeKeepTurns(atBoundary)).toBe(DISCUSSION_LIMITS.compactKeepTurns);
  });

  it('항상 양수를 반환한다', () => {
    expect(computeKeepTurns(0)).toBeGreaterThan(0);
  });
});
