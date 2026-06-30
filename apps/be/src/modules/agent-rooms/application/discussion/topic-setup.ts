import { Command } from '@langchain/langgraph';
import type { DiscussionStateType } from './discussion-state';
import type { RoomAgentSpec } from './discussion.types';
import type { LlmService } from '../../../../common/ai/llm/llm.service';
import type { DiscussionConfig } from './discussion-config';
import type { TopicClassification } from './parsers';
import type { RunContext } from './run-context';
import type { TurnEntry } from './discussion.types';
import { topicClassificationSchema, topicValidationSchema } from './parsers';
import { eligibleAgents, normalizeDiscussionBrief } from './discussion-brief';
import {
  buildDefineAgendaPrompt,
  buildValidateTopicPrompt,
  MODERATOR,
} from '../../../../common/prompt/discussion';

interface TopicValidationResult {
  valid: boolean;
  reason?: string;
}

export async function validateTopic(ctx: RunContext): Promise<Command> {
  ctx.events.next({ type: 'status', phase: 'validating' });
  const result = await runValidateTopic(ctx.topic, ctx.agents, ctx.llm, ctx.config, ctx.skipGate);
  if (!result.valid) {
    return new Command({
      goto: 'rejectTopic',
      update: {
        turnLog: [
          { role: 'moderator', agentName: MODERATOR, round: 0, content: result.reason ?? 'Invalid topic.' },
        ] as TurnEntry[],
      },
    });
  }
  return new Command({ goto: 'defineAgenda' });
}

export async function rejectTopic(state: DiscussionStateType, ctx: RunContext): Promise<Partial<DiscussionStateType>> {
  const reason = state.turnLog[state.turnLog.length - 1]?.content ?? 'Topic rejected.';
  ctx.events.next({ type: 'final', text: reason });
  ctx.events.next({ type: 'done' });
  ctx.events.complete();
  return {};
}

export async function defineAgenda(state: DiscussionStateType, ctx: RunContext): Promise<Partial<DiscussionStateType>> {
  ctx.events.next({ type: 'status', phase: 'defining_agenda' });
  const existing =
    state.outputContract.length > 0
      ? {
        discussionType: state.discussionType,
        outputContract: state.outputContract,
        options: state.options,
        brief: state.brief ?? undefined,
      }
      : null;
  const agenda = await runDefineAgenda(ctx.topic, ctx.agents, ctx.llm, ctx.config, existing);
  const eligible = eligibleAgents(ctx.agents, agenda.brief);
  ctx.events.next({
    type: 'status',
    phase: 'defining_agenda',
    detail: `eligible agents selected: ${eligible.map((agent) => agent.name).join(', ') || 'none'}`,
  });
  return {
    brief: agenda.brief ?? state.brief ?? null,
    discussionType: agenda.discussionType,
    outputContract: agenda.outputContract,
    options: agenda.options ?? [],
  };
}

export async function runValidateTopic(
  topic: string,
  agents: RoomAgentSpec[],
  llm: LlmService,
  config: DiscussionConfig,
  skipGate: boolean,
): Promise<TopicValidationResult> {
  if (skipGate) return { valid: true };

  const prompt = buildValidateTopicPrompt(
    topic,
    agents.map((a) => a.name),
  );
  const result = await llm.completeStructured(
    { model: config.moderatorModel, messages: [{ role: 'user', content: prompt }] },
    topicValidationSchema,
  );
  if (!result) return { valid: true };
  return { valid: result.valid, reason: result.reason };
}

export async function runDefineAgenda(
  topic: string,
  agents: RoomAgentSpec[],
  llm: LlmService,
  config: DiscussionConfig,
  existing: TopicClassification | null,
): Promise<TopicClassification> {
  if (existing && existing.outputContract.length > 0) return existing;

  const prompt = buildDefineAgendaPrompt(topic, agents);
  const result = await llm.completeStructured(
    { model: config.moderatorModel, messages: [{ role: 'user', content: prompt }] },
    topicClassificationSchema,
  );
  if (result) {
    return {
      ...result,
      brief: normalizeDiscussionBrief({
        topic,
        agents,
        discussionType: result.discussionType,
        outputContract: result.outputContract,
        brief: result.brief,
      }),
    };
  }

  const fallback = {
    discussionType: 'brainstorm',
    outputContract: ['핵심 결론', '권고 사항', '실행 항목'],
    options: [],
  } satisfies Omit<TopicClassification, 'brief'>;
  return {
    ...fallback,
    brief: normalizeDiscussionBrief({
      topic,
      agents,
      discussionType: fallback.discussionType,
      outputContract: fallback.outputContract,
      brief: null,
    }),
  };
}
