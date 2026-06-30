import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import {
  Agent,
  Room,
  RoomAgent,
  User,
  Workspace,
  WorkspaceMember,
} from '../../common/database/entities.registry';
import { RagModule } from '../rag/rag.module';
import { SampleDataInitializer } from './application/sample-data.initializer';

@Module({
  imports: [
    MikroOrmModule.forFeature([User, Workspace, WorkspaceMember, Agent, Room, RoomAgent]),
    RagModule,
  ],
  providers: [SampleDataInitializer],
  exports: [SampleDataInitializer],
})
export class SampleDataModule {}
