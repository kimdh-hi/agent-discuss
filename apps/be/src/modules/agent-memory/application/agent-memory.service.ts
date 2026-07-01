import { Inject, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { BaseStore } from '@langchain/langgraph-checkpoint';
import { LlmService } from '../../../common/ai/llm/llm.service';
import { LANGGRAPH_STORE } from '../infrastructure/langgraph/langgraph-persistence.tokens';
import {
  MIN_STORED_CONFIDENCE,
  MemoryExtractionSchema,
  agentMemoryNamespace,
  confidenceForEvidence,
  type AgentMemoryDto,
  type StoredMemory,
} from '../domain/agent-memory';
import { buildMemoryExtractionPrompt } from './agent-memory.prompt';
import type {
  DiscussionSnapshot,
  RecalledMemory,
  RoomAgentSpec,
  TurnEntry,
} from '../../agent-rooms/application/discussion/discussion.types';

const RECALL_TOP_K = 5;
const RECALL_MIN_SCORE = 0.2;
const MAX_PER_AGENT = 100;
const TTL_MS = 365 * 24 * 60 * 60 * 1000;
const SEMANTIC_DUP_SCORE = 0.9;
const SENSITIVE = /(api[_-]?key|password|secret|bearer\s+[a-z0-9._-]+|token\s*[:=])/i;

@Injectable()
export class AgentMemoryService {
  private readonly logger = new Logger(AgentMemoryService.name);

  constructor(
    @Inject(LANGGRAPH_STORE) private readonly store: BaseStore,
    private readonly llm: LlmService,
  ) {}

  async recall(agentId: string, query: string, topK = RECALL_TOP_K): Promise<RecalledMemory[]> {
    if (!query.trim()) return [];
    try {
      const items = await this.store.search(agentMemoryNamespace(agentId), { query, limit: topK });
      const now = Date.now();
      return items
        .filter((it) => it.score == null || it.score >= RECALL_MIN_SCORE)
        .map((it) => it.value as Partial<StoredMemory>)
        .filter((v) => typeof v.content === 'string' && v.content.trim().length > 0)
        .filter((v) => !isExpired(v.expiresAt, now))
        .map((v) => ({
          content: v.content as string,
          kind: typeof v.kind === 'string' ? v.kind : 'note',
          confidence: typeof v.confidence === 'number' ? v.confidence : 1,
        }))
        .sort((a, b) => b.confidence - a.confidence);
    } catch (err) {
      this.logger.warn(`recall failed agentId=${agentId}: ${(err as Error).message}`);
      return [];
    }
  }

  async listByAgent(agentId: string): Promise<AgentMemoryDto[]> {
    try {
      const items = await this.store.search(agentMemoryNamespace(agentId), { limit: 1000 });
      const now = Date.now();
      return items
        .map((it) => {
          const value = it.value as Partial<StoredMemory>;
          return {
            id: it.key,
            agentId,
            content: typeof value.content === 'string' ? value.content : '',
            kind: typeof value.kind === 'string' ? value.kind : null,
            confidence: typeof value.confidence === 'number' ? value.confidence : null,
            sourceTopicId: value.sourceTopicId ?? null,
            createdAt: value.createdAt ?? null,
            expiresAt: value.expiresAt ?? null,
          };
        })
        .filter((memory) => memory.content.trim().length > 0)
        .filter((memory) => !isExpired(memory.expiresAt, now))
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
    const candidates = extraction?.candidates ?? [];
    if (candidates.length === 0) return;

    const namespace = agentMemoryNamespace(spec.id);
    const now = new Date();
    let stored = false;

    for (const candidate of candidates) {
      const content = candidate.content.trim();
      if (!content || SENSITIVE.test(content)) continue;

      const confidence = confidenceForEvidence(candidate.evidenceLevel, candidate.flags);
      if (confidence < MIN_STORED_CONFIDENCE) continue;

      const contentHash = hashContent(content);
      const existingKey = await this.findDuplicateKey(spec.id, content, contentHash);
      const key = existingKey ?? contentHash.slice(0, 32);

      const previous = existingKey
        ? ((await this.store.get(namespace, existingKey))?.value as Partial<StoredMemory> | undefined)
        : undefined;
      const effectiveConfidence = Math.max(confidence, previous?.confidence ?? 0);

      const value: StoredMemory = {
        content,
        kind: candidate.kind,
        confidence: effectiveConfidence,
        importance: effectiveConfidence,
        contentHash,
        sourceTopicId,
        sourceRounds: candidate.sourceRounds ?? [],
        createdAt: previous?.createdAt ?? now.toISOString(),
        expiresAt: new Date(now.getTime() + TTL_MS).toISOString(),
        lastAccessedAt: now.toISOString(),
      };
      await this.store.put(namespace, key, value);
      stored = true;
    }

    if (stored) await this.enforceCap(spec.id);
  }

  private async findDuplicateKey(
    agentId: string,
    content: string,
    contentHash: string,
  ): Promise<string | null> {
    try {
      const items = await this.store.search(agentMemoryNamespace(agentId), { query: content, limit: 5 });
      for (const it of items) {
        const value = it.value as Partial<StoredMemory>;
        if (value.contentHash === contentHash) return it.key;
        if (it.score != null && it.score >= SEMANTIC_DUP_SCORE) return it.key;
      }
    } catch (err) {
      this.logger.warn(`dedup lookup failed agentId=${agentId}: ${(err as Error).message}`);
    }
    return null;
  }

  private async enforceCap(agentId: string): Promise<void> {
    try {
      const namespace = agentMemoryNamespace(agentId);
      const all = await this.store.search(namespace, { limit: MAX_PER_AGENT + 50 });
      if (all.length <= MAX_PER_AGENT) return;
      const sorted = [...all].sort((a, b) => recencyKey(b) - recencyKey(a));
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

function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

function isExpired(expiresAt: string | null | undefined, now: number): boolean {
  if (!expiresAt) return false;
  const ts = Date.parse(expiresAt);
  return Number.isFinite(ts) && ts <= now;
}

function recencyKey(item: { value: unknown }): number {
  const value = item.value as Partial<StoredMemory>;
  const raw = value.lastAccessedAt ?? value.createdAt ?? '';
  const ts = Date.parse(raw);
  return Number.isFinite(ts) ? ts : 0;
}
