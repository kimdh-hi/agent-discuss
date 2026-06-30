import { Injectable } from '@nestjs/common';
import { PdfPageInfo, PdfRenderer } from './types';

const VECTOR_OP_THRESHOLD = 8;

@Injectable()
export class PdfRendererService implements PdfRenderer {
  private readonly scale = 2;

  private async loadPdfjs(): Promise<any> {
    return import('pdfjs-dist/legacy/build/pdf.mjs');
  }

  private async openDocument(pdfjs: any, buffer: Buffer): Promise<any> {
    return pdfjs.getDocument({
      data: new Uint8Array(buffer),
      isEvalSupported: false,
      useSystemFonts: true,
      verbosity: pdfjs.VerbosityLevel?.ERRORS ?? 0,
    }).promise;
  }

  async analyze(buffer: Buffer, maxPages: number): Promise<PdfPageInfo[]> {
    const pdfjs = await this.loadPdfjs();
    const ops = pdfjs.OPS;
    const imageOps = new Set<number>(
      [ops.paintImageXObject, ops.paintInlineImageXObject, ops.paintImageMaskXObject, ops.paintJpegXObject].filter(
        (n) => typeof n === 'number',
      ),
    );
    const vectorOps = new Set<number>(
      [ops.constructPath, ops.stroke, ops.fill, ops.eoFill, ops.fillStroke, ops.rectangle].filter(
        (n) => typeof n === 'number',
      ),
    );
    const doc = await this.openDocument(pdfjs, buffer);
    try {
      const count = Math.min(doc.numPages, maxPages);
      const pages: PdfPageInfo[] = [];
      for (let i = 1; i <= count; i++) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        const text = (content.items as any[])
          .map((it) => (typeof it.str === 'string' ? it.str : ''))
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
        const opList = await page.getOperatorList();
        let hasImage = false;
        let vectorCount = 0;
        for (const fn of opList.fnArray as number[]) {
          if (imageOps.has(fn)) hasImage = true;
          else if (vectorOps.has(fn)) vectorCount++;
        }
        pages.push({ index: i - 1, text, hasVisual: hasImage || vectorCount >= VECTOR_OP_THRESHOLD });
        page.cleanup();
      }
      return pages;
    } finally {
      await doc.destroy();
    }
  }

  async render(buffer: Buffer, pageIndices: number[]): Promise<Map<number, Buffer>> {
    const result = new Map<number, Buffer>();
    if (pageIndices.length === 0) return result;
    const { createCanvas } = await import('@napi-rs/canvas');
    const pdfjs = await this.loadPdfjs();
    const doc = await this.openDocument(pdfjs, buffer);
    try {
      for (const idx of pageIndices) {
        if (idx < 0 || idx >= doc.numPages) continue;
        const page = await doc.getPage(idx + 1);
        const viewport = page.getViewport({ scale: this.scale });
        const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
        const context = canvas.getContext('2d');
        await page.render({ canvasContext: context as any, viewport }).promise;
        result.set(idx, canvas.toBuffer('image/png'));
        page.cleanup();
      }
      return result;
    } finally {
      await doc.destroy();
    }
  }
}
