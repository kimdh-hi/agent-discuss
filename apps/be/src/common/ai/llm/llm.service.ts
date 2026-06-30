import { Injectable } from '@nestjs/common';
import { ChatOpenAI } from '@langchain/openai';
import {
  SystemMessage,
  HumanMessage,
  AIMessage,
  AIMessageChunk,
  ToolMessage,
  BaseMessage,
} from '@langchain/core/messages';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { ChatRequest, ChatMessage, LlmTool, StreamPart } from './llm.types';

const SIGNAL_TURN_TOOL = 'signal_turn';

const MAX_TOOL_ITERATIONS = 5;

@Injectable()
export class LlmService {
  async *stream(req: ChatRequest): AsyncGenerator<StreamPart> {
    if (process.env.LLM_PROVIDER === 'mock') {
      yield* this.mockStream(req);
      return;
    }

    const model = new ChatOpenAI({ model: req.model, temperature: 0.4 });
    const tools = req.tools ?? [];
    const runnable = tools.length > 0 ? model.bindTools(tools.map(toLangChainTool)) : model;
    const messages = req.messages.map(toLangChainMessage);
    const maxIterations = req.maxToolIterations ?? MAX_TOOL_ITERATIONS;

    for (let iteration = 0; iteration < maxIterations; iteration++) {
      let accumulated: AIMessageChunk | undefined;
      for await (const chunk of await runnable.stream(messages)) {
        const text = extractText(chunk.content);
        if (text) yield { type: 'text', text };
        accumulated = accumulated ? accumulated.concat(chunk) : chunk;
      }

      const toolCalls = accumulated?.tool_calls ?? [];
      if (!accumulated || toolCalls.length === 0) return;

      messages.push(accumulated as unknown as AIMessage);
      for (const call of toolCalls) {
        const spec = tools.find((t) => t.name === call.name);
        const id = call.id ?? call.name;
        const args = (call.args ?? {}) as Record<string, unknown>;
        yield { type: 'tool_call', id, name: call.name, args };
        const result = spec
          ? await spec.execute(args)
          : { content: `Unknown tool: ${call.name}` };
        yield { type: 'tool_result', id, name: call.name, meta: result.meta };
        messages.push(new ToolMessage({ content: result.content, tool_call_id: id }));
      }
    }
  }

  async complete(req: ChatRequest): Promise<string> {
    let text = '';
    for await (const part of this.stream(req)) {
      if (part.type === 'text') text += part.text;
    }
    return text;
  }

  async completeStructured<T extends Record<string, unknown>>(
    req: ChatRequest,
    schema: z.ZodType<T>,
  ): Promise<T | null> {
    if (process.env.LLM_PROVIDER === 'mock') {
      return parseStructured(await this.complete(req), schema);
    }
    try {
      const model = new ChatOpenAI({ model: req.model, temperature: 0.4 });
      const structured = model.withStructuredOutput<T>(schema);
      return await structured.invoke(req.messages.map(toLangChainMessage));
    } catch {
      return null;
    }
  }

  private async *mockStream(req: ChatRequest): AsyncGenerator<StreamPart> {
    const lastUser = [...req.messages].reverse().find((message) => message.role === 'user')?.content ?? '';
    const ragTool = req.tools?.find((t) => t.name === 'rag_search');
    if (ragTool && !lastUser.includes('Topic:')) {
      const args = { queries: [lastUser] };
      yield { type: 'tool_call', id: ragTool.name, name: ragTool.name, args };
      const result = await ragTool.execute(args);
      const meta = Array.isArray(result.meta) && result.meta.length > 0
        ? result.meta
        : [{ documentId: 'mock', filename: 'mock.md', snippet: 'mock source', content: 'mock source', score: 1 }];
      yield { type: 'tool_result', id: ragTool.name, name: ragTool.name, meta };
    }
    yield { type: 'text', text: mockText(lastUser) };
    const signalTool = req.tools?.find((t) => t.name === SIGNAL_TURN_TOOL);
    if (signalTool && lastUser.includes('Remark of')) {
      yield { type: 'tool_call', id: signalTool.name, name: signalTool.name, args: { done: true, yieldTo: null } };
    }
  }
}

function mockText(user: string): string {
  if (user.includes('Is this topic worth discussing')) {
    return '{"valid": true, "reason": "mock"}';
  }
  if (user.includes('required conclusion items')) {
    return '{"discussionType": "decision", "outputContract": ["권고안", "채택 조건", "호환/이행", "리스크 분류", "검증 항목"], "options": []}';
  }
  if (user.includes('Decide the next speaker')) {
    if (user.includes('(R')) return '{"next": null, "done": true, "reason": "mock consensus"}';
    const next = user.match(/- id: ([^,\n]+)/)?.[1] ?? null;
    return JSON.stringify({ next, done: false, reason: 'mock route' });
  }
  if (user.includes('Output the update result')) {
    return JSON.stringify({
      issues: [
        { id: 'mock', title: '모의 쟁점', status: 'open', claims: ['모의 주장'], risks: [], proposals: [] },
      ],
      newClaims: 1,
      repeatClaims: 0,
      decisionCandidate: {
        recommendation: '모의 권고',
        conditions: ['모의 조건'],
        risks: [],
        verification: ['모의 검증'],
      },
    });
  }
  if (user.includes('issue classification and finalized recommendation')) {
    return JSON.stringify({
      issues: [
        { id: 'mock', title: '모의 쟁점', status: 'decidable', claims: [], risks: [], proposals: [] },
      ],
      decisionCandidate: {
        recommendation: '모의 권고안입니다.',
        conditions: ['모의 채택 조건'],
        risks: ['모의 리스크 (후속 과제)'],
        verification: ['모의 검증 항목'],
      },
    });
  }
  if (user.includes('updated discussion memory')) {
    return '모의 토론 메모리';
  }
  if (user.includes('Finalized recommendation:')) {
    return '## 결정\n- 모의 결정입니다.\n\n## 채택 조건\n- 모의 조건\n\n## 호환·이행\n- 모의 호환\n\n## 리스크 분류\n- 모의 리스크 (후속 과제)\n\n## 검증 항목\n- 모의 검증';
  }
  if (user.includes('Remark of')) {
    return '모의 발언입니다.';
  }
  if (user.includes('The discussion cannot start')) {
    return '토론할 안건을 더 구체적으로 입력해 주세요.';
  }
  return '모의 응답입니다.';
}

function toLangChainMessage(m: ChatMessage): BaseMessage {
  if (m.role === 'system') return new SystemMessage(m.content);
  if (m.role === 'assistant') return new AIMessage(m.content);
  return new HumanMessage(m.content);
}

function toLangChainTool(spec: LlmTool) {
  return tool(async () => '', {
    name: spec.name,
    description: spec.description,
    schema: spec.schema,
  });
}

function parseStructured<T extends Record<string, unknown>>(raw: string, schema: z.ZodType<T>): T | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const result = schema.safeParse(JSON.parse(match[0]));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

function extractText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part === 'object' && part && 'text' in part ? String((part as { text: unknown }).text) : ''))
      .join('');
  }
  return '';
}
