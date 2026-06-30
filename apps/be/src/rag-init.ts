import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { MikroORM } from '@mikro-orm/core';
import { getMikroORMToken } from '@mikro-orm/nestjs';
import { Logger } from '@nestjs/common';
import { SampleDataCliModule } from './modules/seed/sample-data-cli.module';
import { SampleDataInitializer } from './modules/seed/application/sample-data.initializer';

async function bootstrap() {
  const logger = new Logger('RagInit');

  const app = await NestFactory.createApplicationContext(SampleDataCliModule);

  const ragOrm = app.get<MikroORM>(getMikroORMToken('rag'));
  const ragEm = ragOrm.em.fork();
  await ragEm.getConnection().execute('CREATE EXTENSION IF NOT EXISTS vector');
  await ragOrm.schema.update();
  logger.log('RAG(pgvector) schema synced');

  const initializer = app.get(SampleDataInitializer);
  await initializer.loadRagSampleKnowledge();

  await app.close();
  logger.log('RAG 초기화 완료.');
  process.exit(0);
}

void bootstrap();
