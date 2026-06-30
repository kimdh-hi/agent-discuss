import { Injectable, Logger } from '@nestjs/common';
import { EntityRepository } from '@mikro-orm/core';
import { InjectRepository } from '@mikro-orm/nestjs';
import { BaseException } from '../../../common/errors/base.exception';
import { ErrorCode } from '../../../common/errors/error-code';
import { Agent, Room, RoomAgent, RoomTopic, RoomTopicMessage } from '../../../common/database/entities.registry';
import { LlmService } from '../../../common/ai/llm/llm.service';
import { RagService } from '../../rag/application/rag.service';
import { AgentMemoryService } from '../../agent-memory/application/agent-memory.service';
import { Observable } from 'rxjs';
import { DiscussionService } from './discussion/discussion.service';
import { DiscussionHubService } from './discussion/discussion-hub.service';
import {
  RoomAgentSpec,
  RoomEvent,
  TurnEntry,
  DiscussionSnapshot,
} from './discussion/discussion.types';
import { DEFAULT_MODEL_ID } from './discussion/discussion-config';
import { DISCUSSION_LIMITS } from './discussion/discussion-limits';
import { agentTurnCount } from './discussion/discussion-run-state';
import { MODERATOR } from '../../../common/prompt/discussion';
import {
  completeRoomTopic,
  markRoomTopicFailed,
  saveRoomTopicState,
  startRoomTopicRun,
  type RoomTopicMessageRole,
} from '../domain/room';

export interface TopicMessageDto {
  id: string;
  role: RoomTopicMessageRole;
  agentId?: string;
  agentName?: string;
  round?: number;
  content: string;
  createdAt: Date;
}

@Injectable()
export class AgentRoomsService {
  private readonly logger = new Logger(AgentRoomsService.name);

  constructor(
    @InjectRepository(Room) private readonly roomRepository: EntityRepository<Room>,
    @InjectRepository(RoomTopic) private readonly topicRepository: EntityRepository<RoomTopic>,
    @InjectRepository(RoomAgent) private readonly roomAgentRepository: EntityRepository<RoomAgent>,
    @InjectRepository(Agent) private readonly agentRepository: EntityRepository<Agent>,
    @InjectRepository(RoomTopicMessage) private readonly messageRepository: EntityRepository<RoomTopicMessage>,
    private readonly discussion: DiscussionService,
    private readonly hub: DiscussionHubService,
    private readonly llm: LlmService,
    private readonly rag: RagService,
    private readonly agentMemory: AgentMemoryService,
  ) {}

  async create(workspaceId: string, name: string, agentIds: string[]): Promise<Room> {
    const validIds = await this.scopedAgentIds(workspaceId, agentIds);

    const room = this.roomRepository.create({ workspaceId, name });
    for (const agentId of validIds) {
      this.roomAgentRepository.create({ roomId: room.id, agentId });
    }
    await this.roomRepository.getEntityManager().flush();
    return room;
  }

  async listByWorkspace(workspaceId: string): Promise<Room[]> {
    return this.roomRepository.find({ workspaceId }, { orderBy: { createdAt: 'asc' } });
  }

  async listTopics(room: Room): Promise<RoomTopic[]> {
    return this.topicRepository.find({ roomId: room.id }, { orderBy: { createdAt: 'desc' } });
  }

  async createTopic(room: Room, title: string): Promise<RoomTopic> {
    const topic = this.topicRepository.create({
      roomId: room.id,
      title: title.trim(),
      status: 'open',
    });
    await this.topicRepository.getEntityManager().flush();
    return topic;
  }

  async addAgent(room: Room, agentId: string, workspaceId: string): Promise<{ ok: boolean }> {
    const valid = await this.scopedAgentIds(workspaceId, [agentId]);
    if (valid.length === 0) throw new BaseException(ErrorCode.AGENT_NOT_FOUND, 'Agent를 찾을 수 없습니다.');
    const existing = await this.roomAgentRepository.findOne({ roomId: room.id, agentId });
    if (!existing) {
      this.roomAgentRepository.create({ roomId: room.id, agentId });
      await this.roomAgentRepository.getEntityManager().flush();
    }
    return { ok: true };
  }

  async removeAgent(room: Room, agentId: string): Promise<{ ok: boolean }> {
    const link = await this.roomAgentRepository.findOne({ roomId: room.id, agentId });
    if (link) {
      const em = this.roomAgentRepository.getEntityManager();
      em.remove(link);
      await em.flush();
    }
    return { ok: true };
  }

  async deleteTopic(room: Room, topicId: string): Promise<{ ok: boolean }> {
    const topic = await this.getTopicOrThrow(room, topicId);
    if (topic.status === 'running') {
      throw new BaseException(ErrorCode.BAD_REQUEST, '진행 중인 topic은 삭제할 수 없습니다.');
    }
    const messages = await this.messageRepository.find({ topicId });
    const em = this.messageRepository.getEntityManager();
    for (const msg of messages) em.remove(msg);
    em.remove(topic);
    await em.flush();
    return { ok: true };
  }

  async getSpecs(roomId: string): Promise<RoomAgentSpec[]> {
    const links = await this.roomAgentRepository.find({ roomId });
    const ids = links.map((l) => l.agentId);
    if (ids.length === 0) return [];
    const agents = await this.agentRepository.find({ id: { $in: ids } });
    return agents.map((a) => ({
      id: a.id,
      name: a.name,
      instructions: a.instructions,
      model: a.model || DEFAULT_MODEL_ID,
      description: a.description ?? undefined,
      hasKnowledge: this.agentHasKnowledge(a),
      knowledgeScope: a.id,
      maxToolIterations: a.maxToolIterations ?? undefined,
    }));
  }

  async beginDiscussion(room: Room, topic: string): Promise<{ topic: RoomTopic }> {
    const roomTopic = await this.createTopic(room, topic);
    return this.beginTopicDiscussion(room, roomTopic.id, topic);
  }

  async getTopicMessages(
    room: Room,
    topicId: string,
  ): Promise<{ topic: RoomTopic; messages: TopicMessageDto[] }> {
    const topic = await this.getTopicOrThrow(room, topicId);
    const messages = await this.findTopicMessages(topic.id);
    return { topic, messages: await this.toTopicMessageDtos(messages) };
  }

  async subscribeTopic(room: Room, topicId: string): Promise<Observable<RoomEvent> | null> {
    await this.getTopicOrThrow(room, topicId);
    return this.hub.subscribe(topicId);
  }

  async cancelTopic(room: Room, topicId: string): Promise<{ ok: boolean }> {
    await this.getTopicOrThrow(room, topicId);
    return { ok: this.hub.cancel(topicId).ok };
  }

  async beginTopicDiscussion(
    room: Room,
    topicId: string,
    message: string,
  ): Promise<{ topic: RoomTopic }> {
    const topic = await this.getTopicOrThrow(room, topicId);
    if (topic.status === 'running') {
      throw new BaseException(ErrorCode.BAD_REQUEST, '이미 실행 중인 topic입니다.');
    }

    const specs = await this.getSpecs(room.id);
    const previousMessages = await this.findTopicMessages(topic.id);
    const initialTurnLog = this.toTurnEntries(previousMessages, specs);
    const restoredSnapshot = topic.runState ?? null;
    const historySummary = this.buildContinuationSummary(topic, previousMessages, restoredSnapshot);

    const agentMemories = await this.recallAgentMemories(specs, message);

    startRoomTopicRun(topic);
    this.messageRepository.create({ topicId: topic.id, role: 'user', content: message });
    await this.messageRepository.getEntityManager().flush();

    const controller = new AbortController();
    const { subject, completion } = await this.discussion.run(message, specs, {
      threadId: topic.id,
      llm: this.llm,
      ragService: this.rag,
      initialTurnLog,
      historySummary,
      initialTurn: restoredSnapshot?.turn ?? agentTurnCount(initialTurnLog),
      skipGate: initialTurnLog.length > 0,
      signal: controller.signal,
      initialSnapshot: restoredSnapshot ?? undefined,
      agentMemories,
    });

    const completionPromise = completion
      .then(({ turnLog, snapshot }) => this.completeTopic(topic, specs, turnLog, snapshot))
      .catch(async (err) => {
        this.logger.error(`Discussion completion failed: ${(err as Error).message}`);
        markRoomTopicFailed(topic);
        await this.topicRepository.getEntityManager().flush();
        throw err;
      });
    this.hub.register(topic.id, subject, completionPromise, controller);
    return { topic };
  }

  private async recallAgentMemories(
    specs: RoomAgentSpec[],
    query: string,
  ): Promise<Record<string, string[]>> {
    const entries = await Promise.all(
      specs.map(async (spec) => [spec.id, await this.agentMemory.recall(spec.id, query)] as const),
    );
    const result: Record<string, string[]> = {};
    for (const [id, memories] of entries) {
      if (memories.length > 0) result[id] = memories;
    }
    return result;
  }

  private agentHasKnowledge(agent: Agent): boolean {
    const tools = agent.tools ?? ['rag_search'];
    return tools.includes('rag_search');
  }

  private async scopedAgentIds(workspaceId: string, agentIds: string[]): Promise<string[]> {
    if (agentIds.length === 0) return [];
    const agents = await this.agentRepository.find({ id: { $in: agentIds }, workspaceId });
    return agents.map((a) => a.id);
  }

  private async getTopicOrThrow(room: Room, topicId: string): Promise<RoomTopic> {
    const topic = await this.topicRepository.findOne({ id: topicId, roomId: room.id });
    if (!topic) throw new BaseException(ErrorCode.TOPIC_NOT_FOUND, 'Topic을 찾을 수 없습니다.');
    return topic;
  }

  private async findTopicMessages(topicId: string): Promise<RoomTopicMessage[]> {
    return this.messageRepository.find({ topicId }, { orderBy: { createdAt: 'asc' } });
  }

  private async completeTopic(
    topic: RoomTopic,
    specs: RoomAgentSpec[],
    entries: TurnEntry[],
    snapshot: DiscussionSnapshot,
  ): Promise<void> {
    for (const e of entries) {
      if (!e.content.trim()) continue;
      this.messageRepository.create({
        topicId: topic.id,
        role: e.role as RoomTopicMessageRole,
        agentId: e.agentId ?? null,
        round: e.round,
        content: e.content,
      });
    }

    const finalEntry = [...entries].reverse().find((entry) => entry.role === 'moderator' && entry.content.trim());
    completeRoomTopic(topic, finalEntry?.content ?? null);
    saveRoomTopicState(topic, snapshot);
    await this.messageRepository.getEntityManager().flush();

    await this.agentMemory.captureFromDiscussion(specs, topic.title, topic.id, entries, snapshot);
  }

  private toTurnEntries(messages: RoomTopicMessage[], agents: RoomAgentSpec[]): TurnEntry[] {
    const names = new Map(agents.map((agent) => [agent.id, agent.name]));
    return messages
      .filter((msg) => (msg.role === 'agent' || msg.role === 'moderator') && msg.content.trim())
      .map((msg) => ({
        role: msg.role as 'agent' | 'moderator',
        agentId: msg.agentId ?? undefined,
        agentName: msg.role === 'moderator' ? MODERATOR : names.get(msg.agentId ?? '') ?? '에이전트',
        round: msg.round ?? 0,
        content: msg.content,
      }));
  }

  private buildContinuationSummary(
    topic: RoomTopic,
    messages: RoomTopicMessage[],
    snapshot: DiscussionSnapshot | null,
  ): string {
    if (snapshot?.historySummary?.trim()) return snapshot.historySummary;
    if (messages.length === 0 && !topic.finalText) return '';

    const userMessages = messages
      .filter((msg) => msg.role === 'user')
      .map((msg, idx) => `${idx + 1}. ${msg.content}`)
      .join('\n');

    return [
      `Topic: ${topic.title}`,
      userMessages ? `[사용자 요청 이력]\n${userMessages}` : '',
      topic.finalText ? `[직전 결론]\n${topic.finalText.slice(0, DISCUSSION_LIMITS.maxHistorySummaryChars)}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  private async toTopicMessageDtos(messages: RoomTopicMessage[]): Promise<TopicMessageDto[]> {
    const visible = messages.filter((m) => m.role === 'user' || m.content.trim());
    const agentIds = [...new Set(visible.map((msg) => msg.agentId).filter((id): id is string => !!id))];
    const agents = agentIds.length > 0 ? await this.agentRepository.find({ id: { $in: agentIds } }) : [];
    const names = new Map(agents.map((agent) => [agent.id, agent.name]));

    return visible.map((msg) => ({
      id: msg.id,
      role: msg.role,
      agentId: msg.agentId ?? undefined,
      agentName: msg.role === 'moderator' ? MODERATOR : msg.agentId ? names.get(msg.agentId) : undefined,
      round: msg.round ?? undefined,
      content: msg.content,
      createdAt: msg.createdAt,
    }));
  }
}
