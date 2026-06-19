import { z } from 'zod';

export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface LlmToolResult {
  content: string;
  meta?: unknown;
}

export interface LlmTool {
  name: string;
  description: string;
  schema: z.ZodType;
  execute(args: Record<string, unknown>): Promise<LlmToolResult>;
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  tools?: LlmTool[];
  maxToolIterations?: number;
}

export type StreamPart =
  | { type: 'text'; text: string }
  | { type: 'tool_call'; id: string; name: string; args: Record<string, unknown> }
  | { type: 'tool_result'; id: string; name: string; meta?: unknown };
