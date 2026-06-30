import { Injectable } from '@nestjs/common';
import { EntityRepository } from '@mikro-orm/core';
import { InjectRepository } from '@mikro-orm/nestjs';
import { BaseException } from '../common/base.exception';
import { ErrorCode } from '../common/error-code';
import { Agent, Message, Room, RoomAgent, RoomTopic } from '../entities';
import { Observable } from 'rxjs';
import { OrchestratorService } from '../orchestrator/orchestrator.service';
import { RoomAgentSpec, RoomEvent, TurnEntry } from '../orchestrator/orchestrator.types';
import { DiscussionHubService } from '../orchestrator/discussion-hub.service';
import { MODERATOR } from '../orchestrator/prompts';

export interface TopicMessageDto {
  id: string;
  role: Message['role'];
  agentId?: string;
  agentName?: string;
  round?: number;
  content: string;
  createdAt: Date;
}

@Injectable()
export class RoomsService {
  constructor(
    @InjectRepository(Room) private readonly roomRepository: EntityRepository<Room>,
    @InjectRepository(RoomTopic) private readonly topicRepository: EntityRepository<RoomTopic>,
    @InjectRepository(RoomAgent) private readonly roomAgentRepository: EntityRepository<RoomAgent>,
    @InjectRepository(Agent) private readonly agentRepository: EntityRepository<Agent>,
    @InjectRepository(Message) private readonly messageRepository: EntityRepository<Message>,
    private readonly orchestrator: OrchestratorService,
    private readonly hub: DiscussionHubService,
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
      await this.roomAgentRepository.getEntityManager().removeAndFlush(link);
    }
    return { ok: true };
  }

  async deleteTopic(room: Room, topicId: string): Promise<{ ok: boolean }> {
    const topic = await this.getTopicOrThrow(room, topicId);
    if (topic.status === 'running') {
      throw new BaseException(ErrorCode.BAD_REQUEST, '진행 중인 topic은 삭제할 수 없습니다.');
    }
    const messages = await this.messageRepository.find({ scope: 'topic', refId: topicId });
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
      model: a.model,
      description: a.description,
      tools: a.tools,
      maxToolIterations: a.maxToolIterations,
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
    return { ok: this.hub.cancel(topicId) };
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
    const historySummary = this.buildContinuationSummary(topic, previousMessages);

    topic.status = 'running';
    topic.finalText = null;
    topic.completedAt = null;
    this.messageRepository.create({ scope: 'topic', refId: topic.id, role: 'user', content: message });
    await this.messageRepository.getEntityManager().flush();

    const controller = new AbortController();
    const { events, turnLog } = this.orchestrator.run(message, specs, {
      initialTurnLog,
      historySummary,
      initialTurn: initialTurnLog.reduce((max, entry) => Math.max(max, entry.round), 0),
      skipGate: initialTurnLog.length > 0,
      signal: controller.signal,
    });
    const completion = turnLog
      .then((entries) => this.completeTopic(topic, entries.slice(initialTurnLog.length)))
      .catch(async (err) => {
        topic.status = 'failed';
        await this.topicRepository.getEntityManager().flush();
        throw err;
      });
    this.hub.register(topic.id, events, completion, controller);
    return { topic };
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

  private async findTopicMessages(topicId: string): Promise<Message[]> {
    return this.messageRepository.find(
      { scope: 'topic', refId: topicId },
      { orderBy: { createdAt: 'asc' } },
    );
  }

  private async completeTopic(topic: RoomTopic, entries: TurnEntry[]): Promise<void> {
    for (const e of entries) {
      this.messageRepository.create({
        scope: 'topic',
        refId: topic.id,
        role: e.role,
        agentId: e.agentId,
        round: e.round,
        content: e.content,
      });
    }

    const finalEntry = entries.findLast((entry) => entry.role === 'moderator');
    topic.status = 'completed';
    topic.finalText = finalEntry?.content ?? null;
    topic.completedAt = new Date();
    await this.messageRepository.getEntityManager().flush();
  }

  private toTurnEntries(messages: Message[], agents: RoomAgentSpec[]): TurnEntry[] {
    const names = new Map(agents.map((agent) => [agent.id, agent.name]));
    return messages
      .filter((msg) => msg.role === 'agent' || msg.role === 'moderator')
      .map((msg) => ({
        role: msg.role as 'agent' | 'moderator',
        agentId: msg.agentId,
        agentName: msg.role === 'moderator' ? MODERATOR : names.get(msg.agentId ?? '') ?? '에이전트',
        round: msg.round ?? 0,
        content: msg.content,
      }));
  }

  private buildContinuationSummary(topic: RoomTopic, messages: Message[]): string {
    if (messages.length === 0 && !topic.finalText) return '';

    const userMessages = messages
      .filter((msg) => msg.role === 'user')
      .map((msg, idx) => `${idx + 1}. ${msg.content}`)
      .join('\n');

    return [
      `Topic: ${topic.title}`,
      userMessages ? `[사용자 요청 이력]\n${userMessages}` : '',
      topic.finalText ? `[직전 결론]\n${topic.finalText}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  private async toTopicMessageDtos(messages: Message[]): Promise<TopicMessageDto[]> {
    const agentIds = [...new Set(messages.map((msg) => msg.agentId).filter((id): id is string => !!id))];
    const agents = agentIds.length > 0 ? await this.agentRepository.find({ id: { $in: agentIds } }) : [];
    const names = new Map(agents.map((agent) => [agent.id, agent.name]));

    return messages.map((msg) => ({
      id: msg.id,
      role: msg.role,
      agentId: msg.agentId,
      agentName: msg.role === 'moderator' ? MODERATOR : msg.agentId ? names.get(msg.agentId) : undefined,
      round: msg.round,
      content: msg.content,
      createdAt: msg.createdAt,
    }));
  }

}
