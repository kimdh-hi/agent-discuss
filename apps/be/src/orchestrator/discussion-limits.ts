export const DISCUSSION_LIMITS = {
  maxConsecutiveYields: 3,
  droughtLimit: 3,
  resolveRetryCap: 2,
  oscillationLimit: 3,
  maxTurnFactor: 5,
  lateStageRatio: 0.6,
  forceConvergeRatio: 0.85,
} as const;

export function graphRecursionLimit(maxTurns: number): number {
  return maxTurns * 6 + 50;
}
