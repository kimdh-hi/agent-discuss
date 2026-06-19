import { Inject, Injectable } from '@nestjs/common';
import { RAG_CONFIG, RagConfig } from '../config/rag-config';
import { RagLlmService } from '../llm/rag-llm.service';
import { TranscribeContext, VisionTranscriber } from './types';

@Injectable()
export class VisionTranscriberService implements VisionTranscriber {
  constructor(
    @Inject(RAG_CONFIG) private readonly config: RagConfig,
    private readonly llm: RagLlmService,
  ) {}

  get enabled(): boolean {
    return !!this.config.docParseModel;
  }

  async transcribe(png: Buffer, context: TranscribeContext): Promise<string> {
    const dataUrl = `data:image/png;base64,${png.toString('base64')}`;
    const text = await this.llm.complete(
      this.config.docParseModel,
      [
        ['system', this.systemPrompt()],
        {
          role: 'user',
          content: [
            { type: 'text', text: this.userPrompt(context) },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        },
      ],
      { temperature: 0 },
    );
    return this.stripCodeFence(text);
  }

  private systemPrompt(): string {
    return [
      'You are a tool that accurately transcribes document page images into search-friendly markdown.',
      'Rules:',
      '- Transcribe every text and value on the page without omission. Transcribe Korean text as Korean, and if a word is split across a line break, join it naturally.',
      '- Always pair a form/table field name (label) with its value. Do not write the label and drop its value. Leave empty cells empty, but never omit a value that is present.',
      '- Transcribe numbers such as years, amounts, and reference numbers exactly together with the label in the same cell/line (e.g. "발급일: 2020-01-01", "합계: 1,000,000"). Do not alter or drop numbers arbitrarily.',
      '- Transcribe tables as GitHub markdown tables, and fill merged cells by repeating the value.',
      '- For graphs, charts, and diagrams, describe the kind, axes, series, key figures, and trend in sentences (e.g. "Bar chart: 2021–2024 revenue, peaking at 12 billion in 2023").',
      '- For photos, logos, and shapes, briefly describe what is visible. Omit meaningless decoration.',
      '- Mark titles and subtitles as markdown headings (#).',
      '- Do not add explanations, apologies, or meta-commentary; output only the transcription result (markdown). If the page has no content, output an empty string.',
    ].join('\n');
  }

  private userPrompt(ctx: TranscribeContext): string {
    return `This is page ${ctx.pageIndex + 1}/${ctx.pageCount} of document "${ctx.filename}". Transcribe this page into markdown.`;
  }

  private stripCodeFence(text: string): string {
    const trimmed = text.trim();
    const fence = /^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/.exec(trimmed);
    return fence ? fence[1].trim() : trimmed;
  }
}
