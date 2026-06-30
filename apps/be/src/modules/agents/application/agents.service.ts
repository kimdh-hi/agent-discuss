import { Injectable } from '@nestjs/common';
import { EntityRepository } from '@mikro-orm/core';
import { InjectRepository } from '@mikro-orm/nestjs';
import { BaseException } from '../../../common/errors/base.exception';
import { ErrorCode } from '../../../common/errors/error-code';
import { Agent, Message } from '../../../common/database/entities.registry';
import { LlmService } from '../../../common/ai/llm/llm.service';
import { ChatMessage, StreamPart } from '../../../common/ai/llm/llm.types';
import { RagService, Uploader } from '../../rag/application/rag.service';
import { buildToolsForAgent } from '../../agent-rooms/application/discussion/agent-tools';
import { DocumentDto, SearchHit, UploadFileInput } from '../../rag/application/rag.interfaces';

export interface CreateAgentInput {
  name: string;
  instructions: string;
  model: string;
  description?: string;
  tools?: string[];
  maxToolIterations?: number;
}

export type AgentQueryEvent =
  | { type: 'sources'; hits: SearchHit[] }
  | StreamPart
  | { type: 'done' };

@Injectable()
export class AgentsService {
  constructor(
    @InjectRepository(Agent) private readonly agentRepository: EntityRepository<Agent>,
    @InjectRepository(Message) private readonly messageRepository: EntityRepository<Message>,
    private readonly llm: LlmService,
    private readonly rag: RagService,
  ) {}

  async create(workspaceId: string, input: CreateAgentInput): Promise<Agent> {
    const agent = this.agentRepository.create({ workspaceId, ...input });
    await this.agentRepository.getEntityManager().flush();
    return agent;
  }

  async listByWorkspace(workspaceId: string): Promise<Agent[]> {
    return this.agentRepository.find({ workspaceId }, { orderBy: { createdAt: 'asc' } });
  }

  async getOrThrow(agentId: string): Promise<Agent> {
    const agent = await this.agentRepository.findOne({ id: agentId });
    if (!agent) throw new BaseException(ErrorCode.AGENT_NOT_FOUND);
    return agent;
  }

  async update(agentId: string, input: Partial<CreateAgentInput>): Promise<Agent> {
    const agent = await this.getOrThrow(agentId);
    if (input.name !== undefined) agent.name = input.name;
    if (input.instructions !== undefined) agent.instructions = input.instructions;
    if (input.model !== undefined) agent.model = input.model;
    if (input.description !== undefined) agent.description = input.description;
    if (input.tools !== undefined) agent.tools = input.tools;
    if (input.maxToolIterations !== undefined) agent.maxToolIterations = input.maxToolIterations;
    await this.agentRepository.getEntityManager().flush();
    return agent;
  }

  async remove(agentId: string): Promise<void> {
    const agent = await this.agentRepository.findOne({ id: agentId });
    const _em = this.agentRepository.getEntityManager(); _em.remove(agent!); await _em.flush();
    await this.rag.deleteByAgent(agentId);
  }

  async uploadDocuments(
    agentId: string,
    files: UploadFileInput[],
    uploader?: Uploader,
  ): Promise<DocumentDto[]> {
    return this.rag.uploadFiles(agentId, files, uploader);
  }

  async ingestDocument(agentId: string, text: string, uploader?: Uploader): Promise<DocumentDto> {
    return this.rag.ingestText(agentId, text, uploader);
  }

  async listDocuments(agentId: string): Promise<DocumentDto[]> {
    return this.rag.listDocuments(agentId);
  }

  async deleteDocument(agentId: string, documentId: string): Promise<void> {
    await this.rag.deleteDocument(agentId, documentId);
  }

  async getRawDocument(agentId: string, documentId: string) {
    return this.rag.getRaw(agentId, documentId);
  }

  async *streamQuery(agent: Agent, message: string): AsyncGenerator<AgentQueryEvent> {
    const system = `${agent.instructions}\n\nWhen you need reference material, call the rag_search tool to search the uploaded documents. If the question spans multiple aspects, split it into key sub-queries and pass them together in the queries array to search at once.`;
    const messages: ChatMessage[] = [
      { role: 'system', content: system },
      { role: 'user', content: message },
    ];
    const tools = buildToolsForAgent(agent, this.rag);

    let answer = '';
    for await (const part of this.llm.stream({ model: agent.model, messages, tools })) {
      if (part.type === 'text') {
        answer += part.text;
        yield part;
      } else if (part.type === 'tool_call') {
        yield part;
      } else if (part.type === 'tool_result') {
        const hits = (part.meta as SearchHit[]) ?? [];
        if (hits.length > 0) yield { type: 'sources', hits };
      }
    }

    await this.persist(agent, message, answer);
    yield { type: 'done' };
  }

  private async persist(agent: Agent, question: string, answer: string): Promise<void> {
    this.messageRepository.create({ scope: 'agent', refId: agent.id, role: 'user', content: question });
    this.messageRepository.create({
      scope: 'agent',
      refId: agent.id,
      role: 'agent',
      agentId: agent.id,
      content: answer,
    });
    await this.messageRepository.getEntityManager().flush();
  }
}
