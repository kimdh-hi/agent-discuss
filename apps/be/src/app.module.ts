import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { buildOrmConfig, buildRagOrmConfig } from './common/database/orm.config';
import { AuthModule } from './modules/auth/auth.module';
import { LlmModule } from './common/ai/llm/llm.module';
import { RagModule } from './modules/rag/rag.module';
import { WorkspacesModule } from './modules/workspaces/workspaces.module';
import { AgentsModule } from './modules/agents/agents.module';
import { AgentRoomsModule } from './modules/agent-rooms/agent-rooms.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MikroOrmModule.forRoot(buildOrmConfig()),
    MikroOrmModule.forRoot({ ...buildRagOrmConfig(), contextName: 'rag' }),
    AuthModule,
    LlmModule,
    RagModule,
    WorkspacesModule,
    AgentsModule,
    AgentRoomsModule,
  ],
})
export class AppModule {}
