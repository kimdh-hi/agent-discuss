import { Module } from '@nestjs/common';
import { RagLlmModule } from '../llm/rag-llm.module';
import { RAG_CONFIG, RagConfig } from '../config/rag-config';
import { DocumentExtractorService } from './document-extractor.service';
import { PdfRendererService } from './pdf-renderer.service';
import { VisionTranscriberService } from './vision-transcriber.service';
import { OfficeInspectorService } from './office-inspector.service';
import { OfficeConverterService } from './office-converter.service';
import { ImageLoader, OfficeLoader, PdfLoader, TextLoader } from './loaders';
import {
  DOCUMENT_LOADERS,
  DocumentLoader,
  OFFICE_CONVERTER,
  OFFICE_INSPECTOR,
  OfficeConverter,
  OfficeInspector,
  PDF_RENDERER,
  PdfRenderer,
  VISION_TRANSCRIBER,
  VisionTranscriber,
} from './types';

@Module({
  imports: [RagLlmModule],
  providers: [
    { provide: PDF_RENDERER, useClass: PdfRendererService },
    { provide: VISION_TRANSCRIBER, useClass: VisionTranscriberService },
    { provide: OFFICE_INSPECTOR, useClass: OfficeInspectorService },
    { provide: OFFICE_CONVERTER, useClass: OfficeConverterService },
    {
      provide: DOCUMENT_LOADERS,
      inject: [RAG_CONFIG, PDF_RENDERER, VISION_TRANSCRIBER, OFFICE_CONVERTER, OFFICE_INSPECTOR],
      useFactory: (
        config: RagConfig,
        renderer: PdfRenderer,
        transcriber: VisionTranscriber,
        converter: OfficeConverter,
        inspector: OfficeInspector,
      ): DocumentLoader[] => {
        const pdf = new PdfLoader(
          renderer,
          transcriber,
          config.docParseMaxPages,
          config.docParseVisionMode,
        );
        return [
          pdf,
          new OfficeLoader(converter, inspector, pdf),
          new ImageLoader(transcriber),
          new TextLoader(),
        ];
      },
    },
    DocumentExtractorService,
  ],
  exports: [DocumentExtractorService],
})
export class ExtractModule {}
