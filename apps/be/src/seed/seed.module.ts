import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Agent, Room, RoomAgent, User, Workspace, WorkspaceMember } from '../entities';
import { SeedService } from './seed.service';

@Module({
  imports: [
    MikroOrmModule.forFeature([User, Workspace, WorkspaceMember, Agent, Room, RoomAgent]),
  ],
  providers: [SeedService],
})
export class SeedModule {}
