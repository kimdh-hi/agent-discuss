import { Global, Module } from '@nestjs/common';
import { RagLlmModule } from '../rag/application/llm/rag-llm.module';
import { AgentMemoryService } from './application/agent-memory.service';
import {
  LanggraphPersistenceLifecycle,
  langgraphCheckpointerProvider,
  langgraphStoreProvider,
} from './infrastructure/langgraph/langgraph-persistence.providers';
import { LANGGRAPH_CHECKPOINTER, LANGGRAPH_STORE } from './infrastructure/langgraph/langgraph-persistence.tokens';

@Global()
@Module({
  imports: [RagLlmModule],
  providers: [
    langgraphStoreProvider,
    langgraphCheckpointerProvider,
    LanggraphPersistenceLifecycle,
    AgentMemoryService,
  ],
  exports: [LANGGRAPH_STORE, LANGGRAPH_CHECKPOINTER, AgentMemoryService],
})
export class AgentMemoryModule {}
