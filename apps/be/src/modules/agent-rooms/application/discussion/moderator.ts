import type { LlmService } from '../../../../common/ai/llm/llm.service';
import type { DiscussionConfig } from './discussion-config';
import type { DiscussionStateType } from './discussion-state';
import type { RoomAgentSpec } from './discussion.types';
import type { ClaimExtraction } from './parsers';
import { claimExtractionSchema, speakerPickSchema } from './parsers';
import {
  buildDraftConclusionPrompt,
  buildPickSpeakerPrompt,
  buildUpdateIssuesPrompt,
} from '../../../../common/prompt/discussion';
import { buildDiscussionContext } from './discussion-context';
import { lastSpeakerId } from './turn-log';
import { isSubstantiveText } from './substantive';
import { isEligibleAgent } from './discussion-brief';

export interface ModerationResult {
  next: string | null;
  reason?: string;
  done?: boolean;
}

export async function pickSpeaker(
  topic: string,
  state: DiscussionStateType,
  agents: RoomAgentSpec[],
  llm: LlmService,
  config: DiscussionConfig,
  keepTurns?: number,
  convergencePressure?: string,
): Promise<ModerationResult> {
  const context = buildDiscussionContext(state.turnLog, state.historySummary, keepTurns);
  const prompt = buildPickSpeakerPrompt(
    topic,
    agents,
    context,
    state.issues,
    lastSpeakerId(state.turnLog),
    state.options,
    state.decisionCandidate,
    convergencePressure,
    state.inconsistencies,
    state.brief,
  );

  const result = await llm.completeStructured(
    { model: config.moderatorModel, messages: [{ role: 'user', content: prompt }] },
    speakerPickSchema,
  );

  if (!result) return { next: agents[0]?.id ?? null };

  const validAgent = result.next && isEligibleAgent(state.brief, result.next)
    ? agents.find((a) => a.id === result.next)
    : null;
  return {
    next: validAgent?.id ?? null,
    reason: result.reason,
    done: result.done ?? false,
  };
}

export async function extractClaims(
  speech: string,
  turn: number,
  state: DiscussionStateType,
  llm: LlmService,
  config: DiscussionConfig,
  topic: string = '',
): Promise<ClaimExtraction> {
  const prompt = buildUpdateIssuesPrompt(
    topic,
    speech,
    turn,
    state.issues,
    state.decisionCandidate,
    state.brief,
  );
  const result = await llm.completeStructured(
    { model: config.moderatorModel, messages: [{ role: 'user', content: prompt }] },
    claimExtractionSchema,
  );

  if (result) return result;

  const speechIsSubstantive = isSubstantiveText(speech);
  return {
    issues: [],
    newClaims: 0,
    repeatClaims: speechIsSubstantive ? 1 : 0,
    decisionCandidate: null,
    inconsistencies: [],
  };
}

export async function draftConclusion(
  state: DiscussionStateType,
  llm: LlmService,
  config: DiscussionConfig,
  topic: string,
  keepTurns?: number,
): Promise<ClaimExtraction> {
  const context = buildDiscussionContext(state.turnLog, state.historySummary, keepTurns);
  const prompt = buildDraftConclusionPrompt(
    topic,
    context,
    state.outputContract,
    state.discussionType,
    state.decisionCandidate,
  );

  const result = await llm.completeStructured(
    { model: config.moderatorModel, messages: [{ role: 'user', content: prompt }] },
    claimExtractionSchema,
  );

  if (result) {
    return {
      ...result,
      decisionCandidate: result.decisionCandidate ?? state.decisionCandidate,
    };
  }

  return {
    issues: state.issues,
    newClaims: 0,
    repeatClaims: 0,
    decisionCandidate: state.decisionCandidate,
    inconsistencies: state.inconsistencies,
  };
}
