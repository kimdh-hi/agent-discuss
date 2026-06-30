import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { buildOrmConfig, buildRagOrmConfig } from '../../common/database/orm.config';
import { SampleDataModule } from './sample-data.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MikroOrmModule.forRoot(buildOrmConfig()),
    MikroOrmModule.forRoot({ ...buildRagOrmConfig(), contextName: 'rag' }),
    SampleDataModule,
  ],
})
export class SampleDataCliModule {}
