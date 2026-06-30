import { Global, Module } from '@nestjs/common';
import { RAG_CONFIG, loadRagConfig } from './rag-config';

@Global()
@Module({
  providers: [{ provide: RAG_CONFIG, useFactory: () => loadRagConfig() }],
  exports: [RAG_CONFIG],
})
export class RagConfigModule {}
