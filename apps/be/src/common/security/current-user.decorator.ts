import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { Agent, Room } from '../entities';
import { AuthUser } from './auth.service';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser =>
    ctx.switchToHttp().getRequest<Request & { user: AuthUser }>().user,
);

export const ScopedAgent = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Agent =>
    ctx.switchToHttp().getRequest<Request & { agent: Agent }>().agent,
);

export const ScopedRoom = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Room =>
    ctx.switchToHttp().getRequest<Request & { room: Room }>().room,
);
