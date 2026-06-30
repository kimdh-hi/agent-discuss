export const DISCUSSION_LIMITS = {
  maxTurnFactor: 5,
  maxConsecutiveBarren: 3,
  compactKeepTurns: 4,
  speakerDefaultToolIterations: 4,
  adapterDefaultToolIterations: 8,
  eventReplayBuffer: 500,
  thinDiscussionContentChars: 80,
  fallbackConclusionTurns: 4,
  fallbackConclusionChars: 160,
  continuationSummaryChars: 500,
  agentRolePreviewChars: 80,
  streamTemperature: 0.4,
  completeTemperature: 0.3,
  structuredTemperature: 0,
  maxHistorySummaryChars: 1500,
  droughtThreshold: 3,
  vibrationThreshold: 3,
  lateStageRatio: 0.6,
} as const;

export const graphRecursionLimit = 200;

export function computeKeepTurns(agentCount: number): number {
  return Math.max(DISCUSSION_LIMITS.compactKeepTurns, agentCount + 1);
}
