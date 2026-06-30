import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { BaseException } from '../errors/base.exception';
import { ErrorCode } from '../errors/error-code';
import { AuthService } from '../../modules/auth/application/auth.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request>();
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) throw new BaseException(ErrorCode.UNAUTHORIZED, 'Missing bearer token');
    try {
      (req as Request & { user: unknown }).user = await this.auth.verify(token);
    } catch {
      throw new BaseException(ErrorCode.UNAUTHORIZED, 'Invalid token');
    }
    return true;
  }
}
