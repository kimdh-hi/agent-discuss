export const DEFAULT_MODEL_ID = process.env.LLM_MODEL || 'gpt-4o-mini';
export const UTILITY_MODEL_ID = process.env.LLM_UTILITY_MODEL || DEFAULT_MODEL_ID;

export interface DiscussionConfig {
  readonly moderatorModel: string;
  readonly agentDefaultModel: string;
}

export const DEFAULT_DISCUSSION_CONFIG: DiscussionConfig = {
  moderatorModel: UTILITY_MODEL_ID,
  agentDefaultModel: DEFAULT_MODEL_ID,
};

export const DISCUSSION_CONFIG = Symbol('DISCUSSION_CONFIG');

export function utilityModelForGroup(models: string[]): string {
  return models.find((m) => !!m) ?? DEFAULT_MODEL_ID;
}
