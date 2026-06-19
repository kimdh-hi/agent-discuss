import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { buildOrmConfig } from './database/mikro-orm.config';
import { buildRagOrmConfig } from './database/rag-orm.config';
import { AuthModule } from './auth/auth.module';
import { LlmModule } from './llm/llm.module';
import { RagModule } from './rag/rag.module';
import { WorkspacesModule } from './workspaces/workspaces.module';
import { AgentsModule } from './agents/agents.module';
import { RoomsModule } from './rooms/rooms.module';
import { SeedModule } from './seed/seed.module';

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
    RoomsModule,
    SeedModule,
  ],
})
export class AppModule {}
