import { Injectable } from '@nestjs/common';
import { EntityRepository } from '@mikro-orm/core';
import { InjectRepository } from '@mikro-orm/nestjs';
import { BaseException } from '../common/base.exception';
import { ErrorCode } from '../common/error-code';
import { User, Workspace, WorkspaceMember } from '../entities';

@Injectable()
export class WorkspacesService {
  constructor(
    @InjectRepository(User) private readonly userRepository: EntityRepository<User>,
    @InjectRepository(Workspace) private readonly workspaceRepository: EntityRepository<Workspace>,
    @InjectRepository(WorkspaceMember) private readonly memberRepository: EntityRepository<WorkspaceMember>,
  ) {}

  async create(userId: string, name: string): Promise<Workspace> {
    const ws = this.workspaceRepository.create({ name, ownerUserId: userId });
    this.memberRepository.create({ workspaceId: ws.id, userId, role: 'owner' });
    await this.workspaceRepository.getEntityManager().flush();
    return ws;
  }

  async listForUser(userId: string): Promise<Workspace[]> {
    const memberships = await this.memberRepository.find({ userId });
    const ids = memberships.map((m) => m.workspaceId);
    if (ids.length === 0) return [];
    return this.workspaceRepository.find({ id: { $in: ids } }, { orderBy: { createdAt: 'asc' } });
  }

  async addMember(workspaceId: string, email: string): Promise<WorkspaceMember> {
    const user = await this.userRepository.findOne({ email });
    if (!user) throw new BaseException(ErrorCode.USER_NOT_FOUND, 'User must log in once first');
    const existing = await this.memberRepository.findOne({ workspaceId, userId: user.id });
    if (existing) return existing;
    const member = this.memberRepository.create({ workspaceId, userId: user.id, role: 'member' });
    await this.memberRepository.getEntityManager().flush();
    return member;
  }
}
