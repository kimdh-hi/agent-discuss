import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Agent, Message, Room, WorkspaceMember } from '../../common/database/entities.registry';
import { AgentsService } from './application/agents.service';
import { AgentsController } from './presentation/agents.controller';

@Module({
  imports: [MikroOrmModule.forFeature([Agent, Message, Room, WorkspaceMember])],
  providers: [AgentsService],
  controllers: [AgentsController],
  exports: [AgentsService],
})
export class AgentsModule {}
