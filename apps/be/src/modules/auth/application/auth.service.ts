import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { EntityRepository } from '@mikro-orm/core';
import { InjectRepository } from '@mikro-orm/nestjs';
import { User } from '../../../common/database/entities.registry';

export interface AuthUser {
  userId: string;
  email: string;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly userRepository: EntityRepository<User>,
    private readonly jwt: JwtService,
  ) {}

  async devLogin(email: string): Promise<{ token: string; user: AuthUser }> {
    let user = await this.userRepository.findOne({ email });
    if (!user) {
      user = this.userRepository.create({ email });
      await this.userRepository.getEntityManager().flush();
    }
    const payload = { sub: user.id, email: user.email };
    const token = await this.jwt.signAsync(payload);
    return { token, user: { userId: user.id, email: user.email } };
  }

  async verify(token: string): Promise<AuthUser> {
    const payload = await this.jwt.verifyAsync<{ sub: string; email: string }>(token);
    return { userId: payload.sub, email: payload.email };
  }
}
