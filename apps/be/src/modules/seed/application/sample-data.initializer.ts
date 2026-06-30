import { Injectable, Logger } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/sqlite';
import { EntityRepository } from '@mikro-orm/core';
import { InjectRepository } from '@mikro-orm/nestjs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Agent } from '../../../common/database/entities.registry';
import { CreateRequestContext } from '../../../common/database/mikro-orm-context.decorators';
import { RagService } from '../../rag/application/rag.service';
import { SAMPLE_KNOWLEDGE_DOCUMENTS } from './sample-knowledge.data';

export const DEMO_USER_ID = 'user-demo';
export const DEMO_WORKSPACE_ID = 'workspace-demo';

const MAIN_SAMPLE_SQL_PATH = join(process.cwd(), 'sample-data', 'main.sql');
const RAG_SEED_READY_TIMEOUT_MS = 120_000;
const RAG_SEED_READY_POLL_MS = 250;

@Injectable()
export class SampleDataInitializer {
  private readonly logger = new Logger(SampleDataInitializer.name);

  constructor(
    private readonly em: EntityManager,
    @InjectRepository(Agent) private readonly agentRepository: EntityRepository<Agent>,
    private readonly ragService: RagService,
  ) {}

  async initialize(): Promise<void> {
    this.logger.log('샘플 데이터 초기화 시작...');
    await this.loadMainSampleData();
    await this.loadRagSampleKnowledge();
    this.logger.log('샘플 데이터 초기화 완료.');
  }

  @CreateRequestContext((self: SampleDataInitializer) => self.em)
  async loadMainSampleData(): Promise<void> {
    this.logger.log('메인 샘플 데이터 적재 시작...');
    const sql = await readFile(MAIN_SAMPLE_SQL_PATH, 'utf8');
    const statements = sql
      .split(';')
      .map((statement) => statement.trim())
      .filter((statement) => statement.length > 0);
    const connection = this.em.getConnection();
    for (const statement of statements) {
      await connection.execute(statement);
    }
    this.em.clear();
    this.logger.log('메인 샘플 데이터 적재 완료.');
  }

  @CreateRequestContext((self: SampleDataInitializer) => self.em)
  async loadRagSampleKnowledge(): Promise<void> {
    this.logger.log('RAG 샘플 지식문서 색인 시작...');
    const agents = await this.findDemoAgents();
    await this.indexSampleKnowledge(agents);
    this.logger.log('RAG 샘플 지식문서 색인 완료.');
  }

  private async findDemoAgents(): Promise<Agent[]> {
    return this.agentRepository.find(
      { workspaceId: DEMO_WORKSPACE_ID },
      { orderBy: { createdAt: 'ASC' } },
    );
  }

  private async indexSampleKnowledge(agents: Agent[]): Promise<void> {
    const documentsByAgentName = new Map(
      SAMPLE_KNOWLEDGE_DOCUMENTS.map((document) => [document.agentName, document]),
    );

    for (const agent of agents) {
      const documentSpec = documentsByAgentName.get(agent.name);
      if (!documentSpec) {
        this.logger.warn(`샘플 RAG 문서 없음(${agent.name})`);
        continue;
      }

      try {
        const document = await this.ragService.ingestText(agent.id, documentSpec.content);
        const status = await this.waitUntilReady(agent.id, document.id);
        if (status !== 'ready') {
          throw new Error(`RAG document indexing ${status}: ${documentSpec.filename}`);
        }
        this.logger.log(`지식문서 색인 완료(${agent.name}): ${documentSpec.filename}`);
      } catch (err) {
        this.logger.warn(`지식문서 색인 실패(${agent.name}): ${(err as Error).message}`);
      }
    }
  }

  private async waitUntilReady(
    agentId: string,
    documentId: string,
  ): Promise<'ready' | 'failed' | 'processing'> {
    const deadline = Date.now() + RAG_SEED_READY_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const documents = await this.ragService.listDocuments(agentId);
      const target = documents.find((doc) => doc.id === documentId);
      if (target && target.status !== 'processing') {
        return target.status;
      }
      await this.delay(RAG_SEED_READY_POLL_MS);
    }
    return 'processing';
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
