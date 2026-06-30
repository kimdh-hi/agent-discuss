import { Inject, Injectable, Logger } from '@nestjs/common';
import { DOCUMENT_LOADERS, DocumentLoader, ExtractInput, ExtractResult } from './types';

@Injectable()
export class DocumentExtractorService {
  private readonly logger = new Logger(DocumentExtractorService.name);

  constructor(@Inject(DOCUMENT_LOADERS) private readonly loaders: DocumentLoader[]) {}

  async extract(input: ExtractInput): Promise<ExtractResult> {
    const loader = this.loaders.find((l) => l.supports(input));
    if (!loader) {
      this.logger.debug(`no loader available — skipping: ${input.filename}`);
      return { markdown: '', pageCount: 0, mode: 'empty' };
    }
    const result = await loader.load(input);
    this.logger.debug(
      `extracted [${loader.name}/${result.mode}] ${input.filename} — ${result.pageCount}p, ${result.markdown.length}chars`,
    );
    return result;
  }
}
