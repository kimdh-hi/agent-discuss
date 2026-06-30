import { Inject, Injectable, Logger } from '@nestjs/common';
import { EntityRepository } from '@mikro-orm/core';
import { InjectRepository } from '@mikro-orm/nestjs';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { Document, DocumentChunk } from '../entities';
import { RagLlmService } from './llm/rag-llm.service';
import { DocumentExtractorService } from './extract/document-extractor.service';
import { ExtractInput } from './extract/types';
import { FILE_STORAGE, FileStorage } from './storage/storage.types';

export interface UploadParams {
  agentId: string;
  uploadedById?: string;
  uploadedByName?: string;
  file: { originalname: string; mimetype: string; size: number; buffer: Buffer };
}

@Injectable()
export class IndexService {
  private readonly logger = new Logger(IndexService.name);
  private readonly splitter = RecursiveCharacterTextSplitter.fromLanguage('markdown', {
    chunkSize: 1200,
    chunkOverlap: 150,
  });

  constructor(
    @InjectRepository(Document, 'rag') private readonly documentRepository: EntityRepository<Document>,
    @InjectRepository(DocumentChunk, 'rag') private readonly chunkRepository: EntityRepository<DocumentChunk>,
    private readonly llm: RagLlmService,
    private readonly extractor: DocumentExtractorService,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
  ) {}

  async upload(params: UploadParams): Promise<Document> {
    const doc = this.documentRepository.create({
      agentId: params.agentId,
      uploadedById: params.uploadedById,
      uploadedByName: params.uploadedByName,
      filename: params.file.originalname,
      mimeType: params.file.mimetype,
      size: params.file.size,
      status: 'processing',
    });
    doc.storageKey = await this.storage.put({
      agentId: params.agentId,
      documentId: doc.id,
      filename: params.file.originalname,
      buffer: params.file.buffer,
    });
    await this.documentRepository.getEntityManager().flush();

    void this.processDocument(doc.id, {
      filename: params.file.originalname,
      mimeType: params.file.mimetype,
      buffer: params.file.buffer,
    });
    return doc;
  }

  async processDocument(documentId: string, input: ExtractInput): Promise<void> {
    const doc = await this.documentRepository.findOne({ id: documentId, deletedAt: null });
    if (!doc) return;
    const startedAt = Date.now();
    const elapsed = () => `${Date.now() - startedAt}ms`;

    doc.stage = 'extracting';
    await this.documentRepository.getEntityManager().flush();
    this.logger.log(`index start ${doc.filename} (${Math.ceil(doc.size / 1024)}KB)`);
    const { markdown, pageCount, mode } = await this.extractor.extract(input);
    this.logger.log(
      `[1/4 extract] ${doc.filename} [${mode}] ${pageCount}p / ${markdown.length}chars (${elapsed()})`,
    );

    const chunks = markdown.trim() ? await this.splitter.splitText(markdown) : [];
    const nonEmpty = chunks.map((c) => c.trim()).filter(Boolean);
    this.logger.log(`[2/4 chunk] ${doc.filename} ${nonEmpty.length} chunks (${elapsed()})`);

    if (nonEmpty.length > 0) {
      doc.stage = 'embedding';
      await this.documentRepository.getEntityManager().flush();
      const embeddings = await this.llm.embed(nonEmpty);
      this.logger.log(`[3/4 embed] ${doc.filename} ${embeddings.length} vectors (${elapsed()})`);
      nonEmpty.forEach((content, i) => {
        this.chunkRepository.create({
          documentId: doc.id,
          content,
          embedding: embeddings[i],
          chunkIndex: i,
        });
      });
    }
    doc.status = 'ready';
    doc.chunkCount = nonEmpty.length;
    await this.documentRepository.getEntityManager().flush();
    this.logger.log(
      `[4/4 done] ${doc.filename} [${mode}]: ${nonEmpty.length} chunks / ${pageCount}p (${elapsed()})`,
    );
  }

  async listDocuments(agentId: string): Promise<Document[]> {
    return this.documentRepository.find({ agentId, deletedAt: null }, { orderBy: { createdAt: 'DESC' } });
  }

  async getDocument(agentId: string, documentId: string): Promise<Document | null> {
    return this.documentRepository.findOne({ id: documentId, agentId, deletedAt: null });
  }

  async getRaw(agentId: string, documentId: string) {
    const doc = await this.getDocument(agentId, documentId);
    const stream = await this.storage.getStream(doc!.storageKey!);
    return { doc, stream };
  }

  async deleteDocument(agentId: string, documentId: string): Promise<void> {
    const doc = await this.documentRepository.findOne({ id: documentId, agentId, deletedAt: null });
    if (!doc) return;
    await this.purgeDocument(doc);
    await this.documentRepository.getEntityManager().flush();
  }

  async deleteByAgent(agentId: string): Promise<number> {
    const docs = await this.documentRepository.find({ agentId, deletedAt: null });
    if (docs.length === 0) return 0;
    for (const doc of docs) {
      await this.purgeDocument(doc);
    }
    await this.documentRepository.getEntityManager().flush();
    return docs.length;
  }

  private async purgeDocument(doc: Document): Promise<void> {
    doc.deletedAt = new Date();
    await this.chunkRepository.nativeDelete({ documentId: doc.id });
    doc.chunkCount = 0;
    if (doc.storageKey) {
      await this.storage.delete(doc.storageKey);
    }
  }
}
