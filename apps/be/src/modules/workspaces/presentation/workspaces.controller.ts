import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { zodBody } from '../../../common/http/zod-validation.pipe';
import { AuthGuard } from '../../../common/security/auth.guard';
import { WorkspaceMemberGuard } from '../../../common/security/workspace-member.guard';
import { CurrentUser } from '../../../common/security/current-user.decorator';
import { AuthUser } from '../../auth/application/auth.service';
import { WorkspacesService } from '../application/workspaces.service';

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
