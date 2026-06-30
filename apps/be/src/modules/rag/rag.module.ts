import { Global, Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Document, DocumentChunk } from '../../common/database/entities.registry';
import { RagConfigModule } from './application/config/rag-config.module';
import { RagLlmModule } from './application/llm/rag-llm.module';
import { ExtractModule } from './application/extract/extract.module';
import { StorageModule } from './application/storage/storage.module';
import { IndexService } from './application/index.service';
import { SearchService } from './application/search.service';
import { RagService } from './application/rag.service';

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
