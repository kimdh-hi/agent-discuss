import { defineConfig as defineSqliteConfig } from '@mikro-orm/sqlite';
import { defineConfig as definePostgresConfig } from '@mikro-orm/postgresql';
import { ALL_ENTITIES, RAG_ENTITIES } from './entities.registry';

export function buildOrmConfig() {
  const dbPath = process.env.DATABASE_PATH || './data/agent-discuss.sqlite';
  return defineSqliteConfig({
    dbName: dbPath,
    entities: ALL_ENTITIES,
    debug: false,
    allowGlobalContext: true,
  });
}

export function buildRagOrmConfig() {
  const clientUrl =
    process.env.RAG_DATABASE_URL || 'postgresql://agent_discuss:agent_discuss@localhost:5432/agent_discuss_rag';
  return definePostgresConfig({
    name: 'rag',
    clientUrl,
    entities: RAG_ENTITIES,
    allowGlobalContext: true,
    debug: false,
    pool: { min: 1, max: 10 },
  });
}
