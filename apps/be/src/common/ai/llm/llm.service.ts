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
    const system = req.messages.find((m) => m.role === 'system')?.content ?? '';
    const lastUser = [...req.messages].reverse().find((m) => m.role === 'user')?.content ?? '';
    const ragTool = req.tools?.find((t) => t.name === 'rag_search');

    if (ragTool) {
      const args = { queries: [lastUser || req.messages[0]?.content || 'query'] };
      yield { type: 'tool_call', id: ragTool.name, name: ragTool.name, args };
      const result = await ragTool.execute(args);
      const meta = Array.isArray(result.meta) && result.meta.length > 0
        ? result.meta
        : [{ documentId: 'mock', filename: 'mock.md', snippet: 'mock source', content: 'mock source', score: 1 }];
      yield { type: 'tool_result', id: ragTool.name, name: ragTool.name, meta };
    }

    if (isSpeakerPrompt(system, lastUser)) {
      yield { type: 'text', text: mockSpeakerText(system) };
      return;
    }

    yield { type: 'text', text: mockText(lastUser) };
  }
}

function isSpeakerPrompt(system: string, user: string): boolean {
  return system.includes('역할의 AI 에이전트입니다') || user.includes('직전 응답에 발언 본문이 없었습니다');
}

function mockSpeakerText(system: string): string {
  const name = system.match(/당신은 "([^"]+)" 역할/)?.[1] ?? '참가자';
  return `${name}의 관점에서 새로운 주장을 제시합니다: 이 프로젝트는 ${name} 기준으로 검토가 필요한 구체적 조건이 있습니다.`;
}

function mockText(user: string): string {
  if (user.includes('다음 토픽이 에이전트들이 토론하기에 적합한지 판단하세요')) {
    return '{"valid": true}';
  }
  if (user.includes('토론 주제를 분석하고 분류하세요')) {
    return JSON.stringify({
      discussionType: 'decision',
      outputContract: ['권고안', '채택 조건', '리스크 분류', '검증 항목'],
      options: ['진행', '보류'],
      brief: {
        objective: '프로젝트 진행 여부를 결정한다',
        deliverable: '권고안, 조건, 검증 항목',
        inScope: ['진행 여부', '리스크', '검증'],
        outOfScope: [],
        requiredDimensions: ['리스크 분류', '검증 항목'],
        rolePlan: parseAgentIds(user).map((id) => ({
          agentId: id,
          relevance: 'core',
          assignedContribution: '이번 토픽 결론에 직접 필요한 기여를 제시',
        })),
      },
    });
  }
  if (user.includes('멀티에이전트 토론의 진행자입니다')) {
    return '{"next": null, "done": true, "reason": "충분히 논의되어 수렴"}';
  }
  if (user.includes('다음 발언에서 쟁점, 주장, 리스크, 제안을 추출하세요')) {
    const turn = Number(user.match(/발언 \(턴 (\d+)\)/)?.[1] ?? '0');
    return JSON.stringify({
      issues: [
        {
          id: `issue-${turn}`,
          title: `턴 ${turn} 쟁점`,
          status: 'open',
          claims: [`턴 ${turn}에서 제시된 주장`],
          risks: [`턴 ${turn} 리스크`],
          proposals: [`턴 ${turn} 제안`],
          lastTouchedTurn: turn,
          revisits: 0,
        },
      ],
      newClaims: 1,
      repeatClaims: 0,
      decisionCandidate: {
        recommendation: '프로젝트를 조건부로 진행한다',
        conditions: [`턴 ${turn} 채택 조건`],
        risks: [`턴 ${turn} 리스크`],
        verification: [`턴 ${turn} 검증 항목`],
        isCommitted: turn >= 1,
      },
      inconsistencies: [],
    });
  }
  if (user.includes('토론이 수렴 단계입니다')) {
    return JSON.stringify({
      issues: [
        { id: 'final', title: '최종 결론 쟁점', status: 'decidable', claims: [], risks: [], proposals: ['실행 권고'], lastTouchedTurn: 0, revisits: 0 },
      ],
      newClaims: 0,
      repeatClaims: 0,
      decisionCandidate: {
        recommendation: '프로젝트를 조건부로 진행한다',
        conditions: ['예산 확정', '일정 검증'],
        risks: ['일정 지연 가능성'],
        verification: ['마감일 재확인', '예산 집행 점검'],
        isCommitted: true,
      },
      inconsistencies: [],
    });
  }
  if (user.includes('토론 결론을 최종 정리하세요')) {
    return [
      '판정: Go',
      '',
      '## 필수 항목 반영',
      '- 권고안: 프로젝트를 조건부로 진행한다.',
      '- 채택 조건: 예산 확정, 일정 검증.',
      '- 리스크 분류: 일정 지연 가능성(후속 점검 필요).',
      '- 검증 항목: 마감일 재확인, 예산 집행 점검.',
    ].join('\n');
  }
  if (user.includes('다음 토론 내용을 최대') || user.includes('다음 토론 요약을')) {
    return '[결정] 조건부 진행\n[근거] 리스크와 검증 항목 정리\n[열린 쟁점] 없음';
  }
  return '모의 응답입니다.';
}

function parseAgentIds(user: string): string[] {
  const ids: string[] = [];
  const re = /id="([^"]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(user)) !== null) {
    ids.push(match[1]);
  }
  if (ids.length > 0) return ids;
  const bullet = /- ([0-9a-f-]{8,}):/g;
  while ((match = bullet.exec(user)) !== null) {
    ids.push(match[1]);
  }
  return ids;
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
