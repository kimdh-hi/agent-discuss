import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { BaseStore } from '@langchain/langgraph-checkpoint';
import { LlmService } from '../../../common/ai/llm/llm.service';
import { LANGGRAPH_STORE } from '../infrastructure/langgraph/langgraph-persistence.tokens';
import {
  MemoryExtractionSchema,
  agentMemoryNamespace,
  type AgentMemoryDto,
  type StoredMemory,
} from '../domain/agent-memory';
import { buildMemoryExtractionPrompt } from './agent-memory.prompt';
import type {
  DiscussionSnapshot,
  RoomAgentSpec,
  TurnEntry,
} from '../../agent-rooms/application/discussion/discussion.types';

const RECALL_TOP_K = 5;
const RECALL_MIN_SCORE = 0.2;
const MAX_PER_AGENT = 100;

@Injectable()
export class AgentMemoryService {
  private readonly logger = new Logger(AgentMemoryService.name);

  constructor(
    @Inject(LANGGRAPH_STORE) private readonly store: BaseStore,
    private readonly llm: LlmService,
  ) {}

  async recall(agentId: string, query: string, topK = RECALL_TOP_K): Promise<string[]> {
    if (!query.trim()) return [];
    try {
      const items = await this.store.search(agentMemoryNamespace(agentId), { query, limit: topK });
      return items
        .filter((it) => it.score == null || it.score >= RECALL_MIN_SCORE)
        .map((it) => (it.value as Partial<StoredMemory>).content)
        .filter((c): c is string => typeof c === 'string' && c.trim().length > 0);
    } catch (err) {
      this.logger.warn(`recall failed agentId=${agentId}: ${(err as Error).message}`);
      return [];
    }
  }

  async listByAgent(agentId: string): Promise<AgentMemoryDto[]> {
    try {
      const items = await this.store.search(agentMemoryNamespace(agentId), { limit: 1000 });
      return items
        .map((it) => {
          const value = it.value as Partial<StoredMemory>;
          return {
            id: it.key,
            agentId,
            content: typeof value.content === 'string' ? value.content : '',
            sourceTopicId: value.sourceTopicId ?? null,
            createdAt: value.createdAt ?? null,
          };
        })
        .filter((memory) => memory.content.trim().length > 0)
        .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));
    } catch (err) {
      this.logger.warn(`listByAgent failed agentId=${agentId}: ${(err as Error).message}`);
      return [];
    }
  }

  async captureFromDiscussion(
    specs: RoomAgentSpec[],
    topic: string,
    sourceTopicId: string,
    entries: TurnEntry[],
    snapshot: DiscussionSnapshot,
  ): Promise<void> {
    for (const spec of specs) {
      try {
        await this.captureForAgent(spec, topic, sourceTopicId, entries, snapshot);
      } catch (err) {
        this.logger.warn(`capture failed agentId=${spec.id}: ${(err as Error).message}`);
      }
    }
  }

  private async captureForAgent(
    spec: RoomAgentSpec,
    topic: string,
    sourceTopicId: string,
    entries: TurnEntry[],
    snapshot: DiscussionSnapshot,
  ): Promise<void> {
    const ownSpeeches = entries
      .filter((e) => e.role === 'agent' && e.agentId === spec.id && e.content.trim())
      .map((e) => e.content.trim());
    if (ownSpeeches.length === 0) return;

    const prompt = buildMemoryExtractionPrompt(
      spec,
      topic,
      ownSpeeches,
      snapshot.decisionCandidate,
      snapshot.issues,
    );
    const extraction = await this.llm.completeStructured(
      { model: spec.model, messages: [{ role: 'user', content: prompt }] },
      MemoryExtractionSchema,
    );
    const notes = (extraction?.notes ?? []).map((n) => n.trim()).filter(Boolean);
    if (notes.length === 0) return;

    const createdAt = new Date().toISOString();
    const namespace = agentMemoryNamespace(spec.id);
    for (const content of notes) {
      const value: StoredMemory = { content, sourceTopicId, createdAt };
      await this.store.put(namespace, randomUUID(), value);
    }
    await this.enforceCap(spec.id);
  }

  private async enforceCap(agentId: string): Promise<void> {
    try {
      const namespace = agentMemoryNamespace(agentId);
      const all = await this.store.search(namespace, { limit: MAX_PER_AGENT + 50 });
      if (all.length <= MAX_PER_AGENT) return;
      const sorted = [...all].sort((a, b) =>
        String((b.value as Partial<StoredMemory>).createdAt ?? '').localeCompare(
          String((a.value as Partial<StoredMemory>).createdAt ?? ''),
        ),
      );
      for (const stale of sorted.slice(MAX_PER_AGENT)) {
        await this.store.delete(namespace, stale.key);
      }
    } catch (err) {
      this.logger.warn(`cap enforce failed agentId=${agentId}: ${(err as Error).message}`);
    }
  }

  async deleteByAgent(agentId: string): Promise<void> {
    const namespace = agentMemoryNamespace(agentId);
    const all = await this.store.search(namespace, { limit: 1000 });
    for (const it of all) {
      await this.store.delete(namespace, it.key);
    }
  }
}
