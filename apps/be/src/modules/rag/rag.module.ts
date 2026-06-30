import { Global, Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Document, DocumentChunk } from '../entities';
import { RagConfigModule } from './config/rag-config.module';
import { RagLlmModule } from './llm/rag-llm.module';
import { ExtractModule } from './extract/extract.module';
import { StorageModule } from './storage/storage.module';
import { IndexService } from './index.service';
import { SearchService } from './search.service';
import { RagService } from './rag.service';

@Global()
@Module({
  imports: [
    RagConfigModule,
    RagLlmModule,
    ExtractModule,
    StorageModule,
    MikroOrmModule.forFeature([Document, DocumentChunk], 'rag'),
  ],
  providers: [IndexService, SearchService, RagService],
  exports: [RagService],
})
export class RagModule {}
