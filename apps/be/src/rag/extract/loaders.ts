import {
  DocumentLoader,
  ExtractInput,
  ExtractResult,
  OfficeConverter,
  OfficeInspector,
  PdfRenderer,
  VisionMode,
  VisionTranscriber,
  fileExt,
  isProbablyText,
} from './types';

const PAGE_SEPARATOR = '\n\n---\n\n';

const TRANSCRIBE_CONCURRENCY = 3;

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) break;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

export class TextLoader implements DocumentLoader {
  readonly name = 'text';
  private static readonly EXTS = new Set([
    'txt', 'md', 'markdown', 'mdx', 'csv', 'tsv', 'json', 'jsonl',
    'log', 'xml', 'yaml', 'yml', 'html', 'htm', 'rst', 'tex',
  ]);

  supports(input: ExtractInput): boolean {
    if (TextLoader.EXTS.has(fileExt(input.filename))) return true;
    if (input.mimeType.startsWith('text/') || input.mimeType === 'application/json') return true;
    return isProbablyText(input.buffer);
  }

  load(input: ExtractInput): Promise<ExtractResult> {
    const text = input.buffer.toString('utf-8').trim();
    return Promise.resolve({
      markdown: text,
      pageCount: text ? 1 : 0,
      mode: text ? 'text' : 'empty',
    });
  }
}

export class PdfLoader implements DocumentLoader {
  readonly name = 'pdf';

  constructor(
    private readonly renderer: PdfRenderer,
    private readonly transcriber: VisionTranscriber,
    private readonly maxPages: number,
    private readonly visionMode: VisionMode = 'auto',
  ) {}

  supports(input: ExtractInput): boolean {
    return input.mimeType === 'application/pdf' || fileExt(input.filename) === 'pdf';
  }

  async load(input: ExtractInput): Promise<ExtractResult> {
    const pages = await this.renderer.analyze(input.buffer, this.maxPages);
    if (pages.length === 0) return { markdown: '', pageCount: 0, mode: 'empty' };

    const useVision = this.transcriber.enabled && this.visionMode !== 'off';
    const visualIdx = useVision
      ? pages.filter((p) => this.visionMode === 'always' || p.hasVisual).map((p) => p.index)
      : [];

    let pngs = new Map<number, Buffer>();
    if (visualIdx.length > 0) {
      pngs = await this.renderer.render(input.buffer, visualIdx);
    }

    const transcribed = await mapLimit(pages, TRANSCRIBE_CONCURRENCY, async (page) => {
      const png = pngs.get(page.index);
      if (!png) return page.text;
      const md = await this.transcriber.transcribe(png, {
        filename: input.filename,
        pageIndex: page.index,
        pageCount: pages.length,
      });
      return md.trim() || page.text;
    });

    const markdown = transcribed.map((t) => t.trim()).filter(Boolean).join(PAGE_SEPARATOR);
    return {
      markdown,
      pageCount: markdown ? pages.length : 0,
      mode: markdown ? (pngs.size > 0 ? 'vision' : 'text') : 'empty',
    };
  }
}

export class OfficeLoader implements DocumentLoader {
  readonly name = 'office';
  private static readonly EXTS = new Set([
    'doc', 'docx', 'docm', 'ppt', 'pptx', 'pptm', 'xls', 'xlsx', 'xlsm',
    'odt', 'odp', 'ods', 'rtf', 'hwp', 'hwpx',
  ]);

  constructor(
    private readonly converter: OfficeConverter,
    private readonly inspector: OfficeInspector,
    private readonly pdfLoader: PdfLoader,
  ) {}

  supports(input: ExtractInput): boolean {
    if (!OfficeLoader.EXTS.has(fileExt(input.filename))) return false;
    return this.converter.enabled || this.inspector.isOoxml(input);
  }

  async load(input: ExtractInput): Promise<ExtractResult> {
    if (this.inspector.isOoxml(input)) {
      const { hasRichContent, text } = this.inspector.probe(input);
      if (!hasRichContent) {
        const md = text.trim();
        return { markdown: md, pageCount: md ? 1 : 0, mode: md ? 'text' : 'empty' };
      }
      if (!this.converter.enabled) {
        const md = text.trim();
        return { markdown: md, pageCount: md ? 1 : 0, mode: md ? 'text' : 'empty' };
      }
    }
    if (!this.converter.enabled) return { markdown: '', pageCount: 0, mode: 'empty' };

    const pdf = await this.converter.convertToPdf(input);
    return this.pdfLoader.load({
      filename: input.filename.replace(/\.[^.]+$/, '.pdf'),
      mimeType: 'application/pdf',
      buffer: pdf,
    });
  }
}

export class ImageLoader implements DocumentLoader {
  readonly name = 'image';

  constructor(private readonly transcriber: VisionTranscriber) {}

  supports(input: ExtractInput): boolean {
    return this.transcriber.enabled && input.mimeType.startsWith('image/');
  }

  async load(input: ExtractInput): Promise<ExtractResult> {
    const markdown = (
      await this.transcriber.transcribe(input.buffer, {
        filename: input.filename,
        pageIndex: 0,
        pageCount: 1,
      })
    ).trim();
    return { markdown, pageCount: markdown ? 1 : 0, mode: markdown ? 'image' : 'empty' };
  }
}
