export interface ExtractInput {
  filename: string;
  mimeType: string;
  buffer: Buffer;
}

export type ExtractMode = 'vision' | 'text' | 'image' | 'empty';

export interface ExtractResult {
  markdown: string;
  pageCount: number;
  mode: ExtractMode;
}

export interface DocumentLoader {
  readonly name: string;
  supports(input: ExtractInput): boolean;
  load(input: ExtractInput): Promise<ExtractResult>;
}

export interface PdfPageInfo {
  index: number;
  text: string;
  hasVisual: boolean;
}

export interface PdfRenderer {
  analyze(buffer: Buffer, maxPages: number): Promise<PdfPageInfo[]>;
  render(buffer: Buffer, pageIndices: number[]): Promise<Map<number, Buffer>>;
}

export type VisionMode = 'auto' | 'always' | 'off';

export interface TranscribeContext {
  filename: string;
  pageIndex: number;
  pageCount: number;
}

export interface VisionTranscriber {
  readonly enabled: boolean;
  transcribe(png: Buffer, context: TranscribeContext): Promise<string>;
}

export interface OfficeConverter {
  readonly enabled: boolean;
  convertToPdf(input: ExtractInput): Promise<Buffer>;
}

export interface OfficeProbe {
  hasRichContent: boolean;
  text: string;
}

export interface OfficeInspector {
  isOoxml(input: ExtractInput): boolean;
  probe(input: ExtractInput): OfficeProbe;
}

export const PDF_RENDERER = Symbol('PDF_RENDERER');
export const VISION_TRANSCRIBER = Symbol('VISION_TRANSCRIBER');
export const OFFICE_CONVERTER = Symbol('OFFICE_CONVERTER');
export const OFFICE_INSPECTOR = Symbol('OFFICE_INSPECTOR');
export const DOCUMENT_LOADERS = Symbol('DOCUMENT_LOADERS');

export function fileExt(filename: string): string {
  const m = /\.([^.]+)$/.exec(filename.toLowerCase());
  return m ? m[1] : '';
}

export function isProbablyText(buffer: Buffer): boolean {
  if (buffer.length === 0) return true;
  const sample = buffer.subarray(0, 4096);
  let control = 0;
  for (const byte of sample) {
    if (byte === 0) return false;
    if (byte < 9 || (byte > 13 && byte < 32)) control++;
  }
  const decoded = sample.toString('utf-8');
  const replacements = (decoded.match(/�/g) ?? []).length;
  return control / sample.length < 0.05 && replacements / Math.max(1, decoded.length) < 0.05;
}
