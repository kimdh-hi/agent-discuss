import type { Readable } from 'stream';

export const FILE_STORAGE = Symbol('FILE_STORAGE');

export interface FileStorage {
  put(params: {
    agentId: string;
    documentId: string;
    filename: string;
    buffer: Buffer;
  }): Promise<string>;
  getStream(storageKey: string): Promise<Readable>;
  getBuffer(storageKey: string): Promise<Buffer>;
  delete(storageKey: string): Promise<void>;
}
