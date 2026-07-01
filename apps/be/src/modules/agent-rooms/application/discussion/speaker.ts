import type { LlmService } from '../../../../common/ai/llm/llm.service';
import type { DiscussionConfig } from './discussion-config';
import type { DiscussionStateType } from './discussion-state';
import type { RoomAgentSpec, SearchHit, TurnEntry } from './discussion.types';
import type { RunContext } from './run-context';
import { buildSpeakSystemPrompt, buildSpeakRetryPrompt } from '../../../../common/prompt/discussion';
import { buildDiscussionMessages } from './discussion-context';
import { buildAgentRagTool } from './agent-rag-tool';
import { isSubstantiveText } from './substantive';
import type { ChatMessage, LlmTool } from '../../../../common/ai/llm/llm.types';
import { streamSpeakerOnce } from './speaker-stream';

interface SpeakResult {
  entry: TurnEntry;
  sources: SearchHit[];
  substantive: boolean;
}

export async function speak(
  agent: RoomAgentSpec,
  state: DiscussionStateType,
  ctx: RunContext,
  llm: LlmService,
  config: DiscussionConfig,
  topic: string,
  convergePressureHint: string = '',
): Promise<SpeakResult> {
  const systemPrompt = buildSpeakSystemPrompt(
    agent,
    topic,
    ctx.agents,
    state.issues,
    state.inconsistencies,
    state.decisionCandidate,
    convergePressureHint,
    state.brief,
    ctx.agentMemories?.[agent.id] ?? [],
  );
  const contextMessages = buildDiscussionMessages(
    state.turnLog,
    state.historySummary,
    agent.id,
    state.issues,
    state.inconsistencies,
    ctx.keepTurns,
  );

  const tools: LlmTool[] = [];
  if (agent.hasKnowledge) {
    tools.push(buildAgentRagTool(ctx.ragService, agent.knowledgeScope ?? agent.id, ctx.ragCache));
  }

  let emittedTurn = false;
  const emitTurnStart = () => {
    if (emittedTurn) return;
    emittedTurn = true;
    ctx.events.next({
      type: 'turn_start',
      role: 'agent',
      agentId: agent.id,
      agentName: agent.name,
      round: state.turn,
    });
  };

  const baseMessages: ChatMessage[] = [{ role: 'system', content: systemPrompt }, ...contextMessages];

  const first = await streamSpeakerOnce({
    messages: baseMessages,
    agent,
    state,
    ctx,
    llm,
    config,
    tools,
    onVisibleActivity: emitTurnStart,
  });

  let content = first.content;
  const sources = [...first.sources];

  const substantive = isSubstantiveText(content);

  if (!substantive && !ctx.signal.aborted) {
    const retryMessages: ChatMessage[] = [
      ...baseMessages,
      ...(content ? [{ role: 'assistant' as const, content }] : []),
      { role: 'user', content: buildSpeakRetryPrompt() },
    ];
    const retry = await streamSpeakerOnce({
      messages: retryMessages,
      agent,
      state,
      ctx,
      llm,
      config,
      tools,
      onVisibleActivity: emitTurnStart,
    });
    content = retry.content;
    sources.push(...retry.sources);
  }

  const finalSubstantive = isSubstantiveText(content);

  if (emittedTurn) {
    ctx.events.next({ type: 'turn_end', agentId: agent.id });
  }

  return {
    entry: {
      role: 'agent',
      agentId: agent.id,
      agentName: agent.name,
      round: state.turn,
      content,
    },
    sources,
    substantive: finalSubstantive,
  };
}
