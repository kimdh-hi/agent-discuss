import { Injectable, Logger } from '@nestjs/common';
import { unzipSync } from 'fflate';
import { ExtractInput, OfficeInspector, OfficeProbe, fileExt } from './types';

const OOXML_EXTS = new Set(['docx', 'pptx', 'xlsx', 'docm', 'pptm', 'xlsm']);

function xmlToText(xml: string): string {
  return xml
    .replace(/<\/(w:p|a:p|w:tr|text:p|text:h)>/g, '\n')
    .replace(/<w:br\s*\/?>/g, '\n')
    .replace(/<a:br\s*\/?>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

@Injectable()
export class OfficeInspectorService implements OfficeInspector {
  private readonly logger = new Logger(OfficeInspectorService.name);

  isOoxml(input: ExtractInput): boolean {
    const b = input.buffer;
    const isZip = b.length >= 2 && b[0] === 0x50 && b[1] === 0x4b;
    return isZip && OOXML_EXTS.has(fileExt(input.filename));
  }

  probe(input: ExtractInput): OfficeProbe {
    let entries: Record<string, Uint8Array>;
    try {
      entries = unzipSync(new Uint8Array(input.buffer));
    } catch (err) {
      this.logger.warn(`OOXML parse failed (${input.filename}): ${(err as Error).message}`);
      return { hasRichContent: true, text: '' };
    }
    const names = Object.keys(entries);

    const hasMediaOrChart = names.some((n) =>
      /(^|\/)(media|embeddings|charts)\//i.test(n) || /\/chart\d*\.xml$/i.test(n),
    );

    const ext = fileExt(input.filename);
    const isSpreadsheet = ext === 'xlsx' || ext === 'xlsm';

    const decode = (name: string): string => {
      const bytes = entries[name];
      return bytes ? Buffer.from(bytes).toString('utf-8') : '';
    };

    const contentNames = names
      .filter((n) =>
        n === 'word/document.xml' ||
        /^ppt\/slides\/slide\d+\.xml$/i.test(n) ||
        /^word\/(header|footer)\d*\.xml$/i.test(n),
      )
      .sort();
    const bodyXml = contentNames.map(decode).join('\n');

    const hasTable = /<(w:tbl|a:tbl)\b/.test(bodyXml);
    const hasGraphicFrame = /<a:graphicFrame\b/.test(bodyXml);

    const hasRichContent = hasMediaOrChart || isSpreadsheet || hasTable || hasGraphicFrame;

    let text = '';
    if (!hasRichContent) {
      text = contentNames.map((n) => xmlToText(decode(n))).filter(Boolean).join('\n\n');
    }
    return { hasRichContent, text };
  }
}
