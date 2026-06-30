import { Command } from '@langchain/langgraph';
import { Subject } from 'rxjs';
import type { RagService } from '../../../rag/application/rag.service';
import type { LlmService } from '../../../../common/ai/llm/llm.service';
import type { RoomAgentSpec, RoomEvent } from './discussion.types';
import type { DiscussionConfig } from './discussion-config';

export interface RunContext {
  topic: string;
  agents: RoomAgentSpec[];
  events: Subject<RoomEvent>;
  signal: AbortSignal;
  llm: LlmService;
  ragService: RagService;
  config: DiscussionConfig;
  initialTurn: number;
  skipGate: boolean;
  maxTurns: number;
  keepTurns: number;
  agentMemories?: Record<string, string[]>;
}

export function isAborted(ctx: RunContext, state?: { aborted?: boolean }): boolean {
  return ctx.signal.aborted || !!state?.aborted;
}

export function abortCommand(): Command {
  return new Command({ goto: '__end__', update: { aborted: true } });
}
