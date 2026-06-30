import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { MikroORM } from '@mikro-orm/core';
import { Logger } from '@nestjs/common';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { SampleDataCliModule } from './modules/seed/sample-data-cli.module';
import { SampleDataInitializer } from './modules/seed/application/sample-data.initializer';

async function bootstrap() {
  const logger = new Logger('DbInit');

  const dbPath = process.env.DATABASE_PATH || './data/agent-discuss.sqlite';
  if (dbPath !== ':memory:') {
    const dir = dirname(dbPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }

  const app = await NestFactory.createApplicationContext(SampleDataCliModule);

  const orm = app.get(MikroORM);
  await orm.schema.update();
  logger.log('SQLite schema synced');

  const initializer = app.get(SampleDataInitializer);
  await initializer.loadMainSampleData();

  await app.close();
  logger.log('DB 초기화 완료.');
  process.exit(0);
}

void bootstrap();
