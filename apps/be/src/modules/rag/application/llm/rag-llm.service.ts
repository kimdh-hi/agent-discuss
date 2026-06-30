import { Inject, Injectable, Logger } from '@nestjs/common';
import { ChatOpenAI } from '@langchain/openai';
import type { BaseMessageLike, MessageContent } from '@langchain/core/messages';
import { createHash } from 'crypto';
import { RAG_CONFIG, RagConfig } from '../config/rag-config';

@Injectable()
export class RagLlmService {
  private readonly logger = new Logger(RagLlmService.name);

  constructor(@Inject(RAG_CONFIG) private readonly config: RagConfig) {}

  protected createChatModel(model: string, temperature = 0): ChatOpenAI {
    return new ChatOpenAI({
      model,
      apiKey: this.config.openaiApiKey,
      streaming: false,
      temperature,
    });
  }

  async complete(
    model: string,
    messages: BaseMessageLike[],
    options?: { temperature?: number },
  ): Promise<string> {
    const chat = this.createChatModel(model, options?.temperature ?? 0);
    const res = await chat.invoke(messages);
    return this.extractText(res.content);
  }

  private extractText(content: MessageContent): string {
    if (typeof content === 'string') return content;
    return content
      .map((block) => {
        if (typeof block === 'object' && block !== null && 'text' in block) {
          const text = (block as { text?: unknown }).text;
          return typeof text === 'string' ? text : '';
        }
        return '';
      })
      .join('');
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    if (this.config.embeddingsProvider === 'local') {
      return texts.map((t) => this.localEmbedding(t));
    }
    const isLitellm = this.config.embeddingsProvider === 'litellm';
    const baseUrl = isLitellm
      ? this.config.litellmBaseUrl.replace(/\/+$/, '')
      : 'https://api.openai.com';
    const apiKey = isLitellm ? this.config.litellmMasterKey : this.config.openaiApiKey;
    const res = await fetch(`${baseUrl}/v1/embeddings`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model: 'text-embedding-3-small', input: texts }),
    });
    if (!res.ok) {
      const body = await res.text();
      this.logger.error(`embedding call failed (${res.status}): ${body}`);
      throw new Error(`embedding request failed: ${res.status}`);
    }
    const json = (await res.json()) as {
      data: { index: number; embedding: number[] }[];
    };
    return json.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
  }

  localEmbedding(text: string): number[] {
    const dim = this.config.embeddingDim;
    const vec = new Array<number>(dim).fill(0);
    const words = text.toLowerCase().split(/[^a-z0-9가-힣]+/).filter(Boolean);
    for (const word of words) {
      const h = createHash('sha256').update(word).digest();
      const idx = h.readUInt32BE(0) % dim;
      const sign = h[4] % 2 === 0 ? 1 : -1;
      vec[idx] += sign;
    }
    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
    return vec.map((v) => v / norm);
  }
}
