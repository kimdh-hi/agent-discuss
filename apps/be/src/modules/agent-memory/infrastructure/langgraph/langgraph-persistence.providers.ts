import { Inject, Injectable, Logger, OnApplicationShutdown, Provider } from '@nestjs/common';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { PostgresStore } from '@langchain/langgraph-checkpoint-postgres/store';
import { RAG_CONFIG, RagConfig } from '../../../rag/application/config/rag-config';
import { RagLlmService } from '../../../rag/application/llm/rag-llm.service';
import { LANGGRAPH_CHECKPOINTER, LANGGRAPH_STORE } from './langgraph-persistence.tokens';

export const langgraphStoreProvider: Provider = {
  provide: LANGGRAPH_STORE,
  useFactory: async (config: RagConfig, ragLlm: RagLlmService) => {
    const store = PostgresStore.fromConnString(config.databaseUrl, {
      index: {
        dims: config.embeddingDim,
        embed: (texts: string[]) => ragLlm.embed(texts),
        fields: ['content'],
      },
    });
    await store.setup();
    return store;
  },
  inject: [RAG_CONFIG, RagLlmService],
};

export const langgraphCheckpointerProvider: Provider = {
  provide: LANGGRAPH_CHECKPOINTER,
  useFactory: async (config: RagConfig) => {
    const checkpointer = PostgresSaver.fromConnString(config.databaseUrl);
    await checkpointer.setup();
    return checkpointer;
  },
  inject: [RAG_CONFIG],
};

@Injectable()
export class LanggraphPersistenceLifecycle implements OnApplicationShutdown {
  private readonly logger = new Logger(LanggraphPersistenceLifecycle.name);

  constructor(
    @Inject(LANGGRAPH_STORE) private readonly store: PostgresStore,
    @Inject(LANGGRAPH_CHECKPOINTER) private readonly checkpointer: PostgresSaver,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    try {
      await this.store.stop();
    } catch (err) {
      this.logger.warn(`store stop failed: ${(err as Error).message}`);
    }
    try {
      await this.checkpointer.end();
    } catch (err) {
      this.logger.warn(`checkpointer end failed: ${(err as Error).message}`);
    }
  }
}
