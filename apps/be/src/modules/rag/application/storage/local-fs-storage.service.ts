import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { createReadStream } from 'fs';
import { mkdir, readFile, rm } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname, resolve, sep } from 'path';
import type { Readable } from 'stream';
import { RAG_CONFIG, RagConfig } from '../config/rag-config';
import { FileStorage } from './storage.types';
import { BaseException } from '../../../../common/errors/base.exception';
import { ErrorCode } from '../../../../common/errors/error-code';

function extOf(filename: string): string {
  const m = /(\.[^.\/\\]+)$/.exec(filename);
  return m ? m[1].toLowerCase() : '';
}

function yyyymmdd(now: Date): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

@Injectable()
export class LocalFsStorageService implements FileStorage, OnModuleDestroy {
  private readonly logger = new Logger(LocalFsStorageService.name);
  private readonly root: string;

  constructor(@Inject(RAG_CONFIG) config: RagConfig) {
    this.root = resolve(config.storageDir);
  }

  async put(params: {
    agentId: string;
    documentId: string;
    filename: string;
    buffer: Buffer;
  }): Promise<string> {
    const { writeFile } = await import('fs/promises');
    const ext = extOf(params.filename);
    const key = `${params.agentId}/${yyyymmdd(new Date())}/${params.documentId}${ext}`;
    const abs = this.resolveKey(key);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, params.buffer);
    this.logger.debug(`file saved: ${key} (${params.buffer.length} bytes)`);
    return key;
  }

  async getStream(storageKey: string): Promise<Readable> {
    const abs = this.resolveKey(storageKey);
    if (!existsSync(abs)) {
      throw new BaseException(ErrorCode.DATA_NOT_FOUND, 'File not found.');
    }
    return createReadStream(abs);
  }

  async getBuffer(storageKey: string): Promise<Buffer> {
    const abs = this.resolveKey(storageKey);
    if (!existsSync(abs)) {
      throw new BaseException(ErrorCode.DATA_NOT_FOUND, 'File not found.');
    }
    return readFile(abs);
  }

  async delete(storageKey: string): Promise<void> {
    const abs = this.resolveKey(storageKey);
    await rm(abs, { force: true });
  }

  async onModuleDestroy(): Promise<void> {
    if (!existsSync(this.root)) return;
    await rm(this.root, { recursive: true, force: true });
    this.logger.log('RAG storage cleared on shutdown');
  }

  private resolveKey(storageKey: string): string {
    const abs = resolve(this.root, storageKey);
    if (abs !== this.root && !abs.startsWith(this.root + sep)) {
      throw new BaseException(ErrorCode.BAD_REQUEST, 'Invalid storage key.');
    }
    return abs;
  }
}
