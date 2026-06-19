import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { MikroORM } from '@mikro-orm/core';
import { getMikroORMToken } from '@mikro-orm/nestjs';
import { Logger } from '@nestjs/common';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/all-exceptions.filter';

async function bootstrap() {
  const dbPath = process.env.DATABASE_PATH || './data/rai-agent.sqlite';
  if (dbPath !== ':memory:') {
    const dir = dirname(dbPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }

  const app = await NestFactory.create(AppModule);
  app.useGlobalFilters(new AllExceptionsFilter());

  const logger = new Logger('Bootstrap');

  const orm = app.get(MikroORM);
  await orm.schema.dropSchema();
  await orm.schema.createSchema();
  logger.log('SQLite schema initialized');

  try {
    const ragOrm = app.get<MikroORM>(getMikroORMToken('rag'));
    const ragEm = ragOrm.em.fork();
    await ragEm.getConnection().execute('CREATE EXTENSION IF NOT EXISTS vector');
    await ragOrm.schema.updateSchema();
    logger.log('RAG(pgvector) schema synced');
  } catch (err) {
    logger.warn(
      `RAG DB 동기화 실패 — RAG 인프라(rag-postgres)를 확인하세요: ${(err as Error).message}`,
    );
  }

  app.enableShutdownHooks();
  app.enableCors({ origin: ['http://localhost:3001', 'http://127.0.0.1:3001'] });

  const port = Number(process.env.PORT || 3000);
  await app.listen(port);
  logger.log(`rai-agent listening on http://localhost:${port}`);
}

void bootstrap();
