import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { zodBody } from '../common/zod.pipe';
import { AuthGuard } from '../auth/auth.guard';
import { WorkspaceMemberGuard } from '../auth/workspace-member.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/auth.service';
import { WorkspacesService } from './workspaces.service';

const CreateSchema = z.object({ name: z.string().min(1) });
const AddMemberSchema = z.object({ email: z.string().email() });

@Controller('workspaces')
@UseGuards(AuthGuard)
export class WorkspacesController {
  constructor(private readonly workspaces: WorkspacesService) {}

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(zodBody(CreateSchema)) body: z.infer<typeof CreateSchema>,
  ) {
    return this.workspaces.create(user.userId, body.name);
  }

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.workspaces.listForUser(user.userId);
  }

  @Post(':wsId/members')
  @UseGuards(WorkspaceMemberGuard)
  addMember(
    @Param('wsId') wsId: string,
    @Body(zodBody(AddMemberSchema)) body: z.infer<typeof AddMemberSchema>,
  ) {
    return this.workspaces.addMember(wsId, body.email);
  }
}
