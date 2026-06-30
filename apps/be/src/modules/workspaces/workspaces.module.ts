import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Agent, Room, User, Workspace, WorkspaceMember } from '../../common/database/entities.registry';
import { WorkspacesService } from './application/workspaces.service';
import { WorkspacesController } from './presentation/workspaces.controller';

@Module({
  imports: [MikroOrmModule.forFeature([User, Workspace, WorkspaceMember, Agent, Room])],
  providers: [WorkspacesService],
  controllers: [WorkspacesController],
  exports: [WorkspacesService],
})
export class WorkspacesModule {}
