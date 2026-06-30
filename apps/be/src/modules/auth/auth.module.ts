import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Agent, Room, User, WorkspaceMember } from '../entities';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { WorkspaceMemberGuard } from './workspace-member.guard';

@Global()
@Module({
  imports: [
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET || 'agent-discuss-dev-secret-change-me',
      signOptions: { expiresIn: (process.env.JWT_EXPIRES_IN || '7d') as `${number}d` },
    }),
    MikroOrmModule.forFeature([User, Agent, Room, WorkspaceMember]),
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthGuard, WorkspaceMemberGuard],
  exports: [AuthService, AuthGuard, WorkspaceMemberGuard],
})
export class AuthModule {}
