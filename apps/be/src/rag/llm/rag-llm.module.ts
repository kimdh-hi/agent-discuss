import { Module } from '@nestjs/common';
import { RagLlmService } from './rag-llm.service';

@Module({
  providers: [RagLlmService],
  exports: [RagLlmService],
})
export class RagLlmModule {}
