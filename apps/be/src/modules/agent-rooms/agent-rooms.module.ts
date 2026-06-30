import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Agent, Room, RoomAgent, RoomTopic, RoomTopicMessage, WorkspaceMember } from '../../common/database/entities.registry';
import { DiscussionModule } from './application/discussion/discussion.module';
import { AgentRoomsService } from './application/agent-rooms.service';
import { AgentRoomsController } from './presentation/agent-rooms.controller';

@Module({
  imports: [
    DiscussionModule,
    MikroOrmModule.forFeature([Room, RoomAgent, RoomTopic, RoomTopicMessage, Agent, WorkspaceMember]),
  ],
  providers: [AgentRoomsService],
  controllers: [AgentRoomsController],
  exports: [AgentRoomsService],
})
export class AgentRoomsModule {}
