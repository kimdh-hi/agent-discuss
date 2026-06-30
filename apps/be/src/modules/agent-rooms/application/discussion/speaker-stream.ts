import type { LlmService } from '../../../../common/ai/llm/llm.service';
import type { DiscussionConfig } from './discussion-config';
import { DISCUSSION_LIMITS } from './discussion-limits';
import type { DiscussionStateType } from './discussion-state';
import type { RoomAgentSpec, SearchHit } from './discussion.types';
import type { ChatMessage, LlmTool } from '../../../../common/ai/llm/llm.types';
import type { RunContext } from './run-context';

type StreamOnceInput = {
  messages: ChatMessage[];
  agent: RoomAgentSpec;
  state: DiscussionStateType;
  ctx: RunContext;
  llm: LlmService;
  config: DiscussionConfig;
  tools: LlmTool[];
  onVisibleActivity: () => void;
};

type StreamOnceResult = {
  content: string;
  sources: SearchHit[];
};

export async function streamSpeakerOnce(input: StreamOnceInput): Promise<StreamOnceResult> {
  const { messages, agent, state, ctx, llm, config, tools, onVisibleActivity } = input;
  const parts: string[] = [];
  const sources: SearchHit[] = [];
  let emittedAny = false;

  for await (const part of llm.stream({
    model: agent.model ?? config.agentDefaultModel,
    messages,
    tools,
    maxToolIterations: agent.maxToolIterations ?? DISCUSSION_LIMITS.speakerDefaultToolIterations,
  })) {
    if (ctx.signal.aborted) break;

    if (part.type === 'text') {
      parts.push(part.text);
      let chunk = part.text;
      if (!emittedAny) chunk = chunk.replace(/^\s+/, '');
      if (chunk) {
        onVisibleActivity();
        emittedAny = true;
        ctx.events.next({ type: 'content', agentId: agent.id, text: chunk });
      }
    } else if (part.type === 'tool_call') {
      onVisibleActivity();
      ctx.events.next({
        type: 'tool',
        agentId: agent.id,
        name: part.name,
        args: part.args,
        round: state.turn,
      });
    } else if (part.type === 'tool_result' && part.meta) {
      const hits = part.meta as SearchHit[];
      if (Array.isArray(hits) && hits.length > 0) {
        sources.push(...hits);
        onVisibleActivity();
        ctx.events.next({ type: 'source', agentId: agent.id, hits });
      }
    }
  }

  return { content: parts.join('').trim(), sources };
}
