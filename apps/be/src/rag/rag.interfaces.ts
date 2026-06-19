import { Document } from '../entities';

export interface SearchHit {
  documentId: string;
  filename: string;
  snippet: string;
  content: string;
  score: number;
}

export interface DocumentDto {
  id: string;
  agentId: string;
  filename: string;
  mimeType: string;
  size: number;
  status: 'processing' | 'ready' | 'failed';
  stage: 'extracting' | 'embedding' | null;
  error: string | null;
  chunkCount: number;
  uploadedById: string | null;
  uploadedByName: string | null;
  createdAt: string;
}

export function serializeDocument(doc: Document): DocumentDto {
  return {
    id: doc.id,
    agentId: doc.agentId,
    filename: doc.filename,
    mimeType: doc.mimeType,
    size: doc.size,
    status: doc.status,
    stage: doc.status === 'processing' ? (doc.stage ?? null) : null,
    error: doc.error ?? null,
    chunkCount: doc.chunkCount,
    uploadedById: doc.uploadedById ?? null,
    uploadedByName: doc.uploadedByName ?? null,
    createdAt: doc.createdAt.toISOString(),
  };
}

export interface UploadFileInput {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}
