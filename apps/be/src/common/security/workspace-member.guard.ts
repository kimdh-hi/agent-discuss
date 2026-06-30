import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { EntityRepository } from '@mikro-orm/core';
import { InjectRepository } from '@mikro-orm/nestjs';
import { BaseException } from '../errors/base.exception';
import { ErrorCode } from '../errors/error-code';
import { Agent, Room, WorkspaceMember } from '../database/entities.registry';
import { AuthUser } from '../../modules/auth/application/auth.service';

@Injectable()
export class WorkspaceMemberGuard implements CanActivate {
  constructor(
    @InjectRepository(Agent) private readonly agentRepository: EntityRepository<Agent>,
    @InjectRepository(Room) private readonly roomRepository: EntityRepository<Room>,
    @InjectRepository(WorkspaceMember) private readonly memberRepository: EntityRepository<WorkspaceMember>,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<
      Request & { user: AuthUser; workspaceId?: string; agent?: Agent; room?: Room }
    >();
    const params = req.params as Record<string, string | undefined>;

    let workspaceId: string;
    if (params.wsId) {
      workspaceId = params.wsId;
    } else if (params.roomId) {
      const room = await this.roomRepository.findOne({ id: params.roomId });
      if (!room) throw new BaseException(ErrorCode.ROOM_NOT_FOUND);
      req.room = room;
      workspaceId = room.workspaceId;
    } else if (params.agentId) {
      const agent = await this.agentRepository.findOne({ id: params.agentId });
      if (!agent) throw new BaseException(ErrorCode.AGENT_NOT_FOUND);
      req.agent = agent;
      workspaceId = agent.workspaceId;
    } else {
      throw new BaseException(ErrorCode.VALIDATION_FAILED, 'No workspace scope in route');
    }

    const member = await this.memberRepository.findOne({
      workspaceId,
      userId: req.user.userId,
    });
    if (!member) throw new BaseException(ErrorCode.FORBIDDEN_NOT_MEMBER);

    req.workspaceId = workspaceId;
    return true;
  }
}
