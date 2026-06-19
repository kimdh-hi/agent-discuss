import { defineConfig } from '@mikro-orm/sqlite';
import { ALL_ENTITIES } from '../entities';

export function buildOrmConfig() {
  const dbPath = process.env.DATABASE_PATH || './data/rai-agent.sqlite';
  return defineConfig({
    dbName: dbPath,
    entities: ALL_ENTITIES,
    debug: false,
    allowGlobalContext: true,
  });
}

export default buildOrmConfig();
