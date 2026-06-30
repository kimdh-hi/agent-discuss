import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/errors/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalFilters(new AllExceptionsFilter());

  const logger = new Logger('Bootstrap');

  app.enableShutdownHooks();
  app.enableCors({ origin: ['http://localhost:3001', 'http://127.0.0.1:3001'] });

  const port = Number(process.env.PORT || 3000);
  await app.listen(port);
  logger.log(`agent-discuss listening on http://localhost:${port}`);
}

void bootstrap();
