import { Inject, Injectable } from '@nestjs/common';
import { RAG_CONFIG, RagConfig } from '../config/rag-config';
import { ExtractInput, OfficeConverter } from './types';

@Injectable()
export class OfficeConverterService implements OfficeConverter {
  constructor(@Inject(RAG_CONFIG) private readonly config: RagConfig) {}

  get enabled(): boolean {
    return !!this.config.gotenbergBaseUrl;
  }

  async convertToPdf(input: ExtractInput): Promise<Buffer> {
    const base = this.config.gotenbergBaseUrl.replace(/\/+$/, '');
    const form = new FormData();
    form.append(
      'files',
      new Blob([new Uint8Array(input.buffer)], { type: input.mimeType }),
      input.filename,
    );
    const res = await fetch(`${base}/forms/libreoffice/convert`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(this.config.docParseTimeoutMs),
    });
    if (!res.ok) {
      throw new Error(`Gotenberg 변환 실패 (${res.status})`);
    }
    return Buffer.from(await res.arrayBuffer());
  }
}
