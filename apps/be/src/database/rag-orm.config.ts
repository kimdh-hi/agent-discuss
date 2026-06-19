import { defineConfig } from '@mikro-orm/postgresql';
import { RAG_ENTITIES } from '../entities';

export function buildRagOrmConfig() {
  const clientUrl =
    process.env.RAG_DATABASE_URL || 'postgresql://rai:rai@localhost:5432/rai_rag';
  return defineConfig({
    name: 'rag',
    clientUrl,
    entities: RAG_ENTITIES,
    allowGlobalContext: true,
    debug: false,
    pool: { min: 1, max: 10 },
  });
}

export default buildRagOrmConfig();
