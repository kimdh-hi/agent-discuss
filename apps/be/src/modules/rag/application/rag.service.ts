import { Inject, Injectable } from '@nestjs/common';
import { IndexService } from './index.service';
import { SearchService } from './search.service';
import { RAG_CONFIG, RagConfig } from './config/rag-config';
import {
  DocumentDto,
  SearchHit,
  UploadFileInput,
  serializeDocument,
} from './rag.interfaces';

export interface Uploader {
  id?: string;
  name?: string;
}

@Injectable()
export class RagService {
  constructor(
    private readonly index: IndexService,
    private readonly searcher: SearchService,
    @Inject(RAG_CONFIG) private readonly config: RagConfig,
  ) {}

  async uploadFiles(
    agentId: string,
    files: UploadFileInput[],
    uploader?: Uploader,
  ): Promise<DocumentDto[]> {
    const docs = [];
    for (const file of files) {
      const doc = await this.index.upload({
        agentId,
        uploadedById: uploader?.id,
        uploadedByName: uploader?.name,
        file,
      });
      docs.push(serializeDocument(doc));
    }
    return docs;
  }

  async ingestText(agentId: string, text: string, uploader?: Uploader): Promise<DocumentDto> {
    const buffer = Buffer.from(text, 'utf-8');
    const doc = await this.index.upload({
      agentId,
      uploadedById: uploader?.id,
      uploadedByName: uploader?.name,
      file: {
        originalname: `note-${Date.now()}.md`,
        mimetype: 'text/markdown',
        size: buffer.length,
        buffer,
      },
    });
    return serializeDocument(doc);
  }

  async listDocuments(agentId: string): Promise<DocumentDto[]> {
    const docs = await this.index.listDocuments(agentId);
    return docs.map(serializeDocument);
  }

  async deleteDocument(agentId: string, documentId: string): Promise<void> {
    await this.index.deleteDocument(agentId, documentId);
  }

  async deleteByAgent(agentId: string): Promise<void> {
    await this.index.deleteByAgent(agentId);
  }

  async getRaw(agentId: string, documentId: string) {
    return this.index.getRaw(agentId, documentId);
  }

  async search(agentId: string, query: string): Promise<SearchHit[]> {
    return this.searcher.search(agentId, query, this.config.topK);
  }

  async searchMany(agentId: string, queries: string[]): Promise<SearchHit[]> {
    if (queries.length === 1) return this.search(agentId, queries[0]);

    const results = await Promise.all(queries.map((q) => this.search(agentId, q)));
    const byKey = new Map<string, SearchHit>();
    for (const hit of results.flat()) {
      const key = `${hit.documentId}::${hit.content}`;
      const existing = byKey.get(key);
      if (!existing || hit.score > existing.score) byKey.set(key, hit);
    }
    return [...byKey.values()].sort((a, b) => b.score - a.score).slice(0, this.config.topK * 2);
  }
}
