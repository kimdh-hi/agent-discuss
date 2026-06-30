import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Agent, Message, Room, RoomAgent, RoomTopic, WorkspaceMember } from '../entities';
import { OrchestratorModule } from '../orchestrator/orchestrator.module';
import { RoomsService } from './rooms.service';
import { RoomsController } from './rooms.controller';

@Module({
  imports: [OrchestratorModule, MikroOrmModule.forFeature([Room, RoomAgent, RoomTopic, Agent, Message, WorkspaceMember])],
  providers: [RoomsService],
  controllers: [RoomsController],
  exports: [RoomsService],
})
export class RoomsModule {}
