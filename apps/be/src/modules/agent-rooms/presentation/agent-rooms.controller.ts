import { Body, Controller, Delete, Get, Param, Patch, Post, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { z } from 'zod';
import { zodBody } from '../../../common/http/zod-validation.pipe';
import { initSse, sendSse } from '../../../common/http/sse';
import { AuthGuard } from '../../../common/security/auth.guard';
import { WorkspaceMemberGuard } from '../../../common/security/workspace-member.guard';
import { ScopedRoom } from '../../../common/security/current-user.decorator';
import { Room } from '../../../common/database/entities.registry';
import { AgentRoomsService } from '../application/agent-rooms.service';
import { RoomEvent } from '../application/discussion/discussion.types';

const CreateSchema = z.object({
  name: z.string().min(1),
  agentIds: z.array(z.string()).min(1),
});
const AddAgentSchema = z.object({ agentId: z.string() });
const RenameRoomSchema = z.object({ name: z.string().min(1) });
const DiscussSchema = z.object({ topic: z.string().min(1) });
const CreateTopicSchema = z.object({ title: z.string().min(1) });
const TopicDiscussSchema = z.object({ message: z.string().min(1) });

@Controller()
@UseGuards(AuthGuard)
export class AgentRoomsController {
  constructor(private readonly rooms: AgentRoomsService) {}

  @Post('workspaces/:wsId/rooms')
  @UseGuards(WorkspaceMemberGuard)
  create(
    @Param('wsId') wsId: string,
    @Body(zodBody(CreateSchema)) body: z.infer<typeof CreateSchema>,
  ) {
    return this.rooms.create(wsId, body.name, body.agentIds);
  }

  @Get('workspaces/:wsId/rooms')
  @UseGuards(WorkspaceMemberGuard)
  list(@Param('wsId') wsId: string) {
    return this.rooms.listByWorkspace(wsId);
  }

  @Get('rooms/:roomId')
  @UseGuards(WorkspaceMemberGuard)
  async get(@ScopedRoom() room: Room) {
    const specs = await this.rooms.getSpecs(room.id);
    const agents = specs.map((a) => ({ id: a.id, name: a.name, model: a.model }));
    return { room, agents };
  }

  @Patch('rooms/:roomId')
  @UseGuards(WorkspaceMemberGuard)
  rename(
    @ScopedRoom() room: Room,
    @Body(zodBody(RenameRoomSchema)) body: z.infer<typeof RenameRoomSchema>,
  ) {
    return this.rooms.renameRoom(room, body.name);
  }

  @Get('rooms/:roomId/topics')
  @UseGuards(WorkspaceMemberGuard)
  listTopics(@ScopedRoom() room: Room) {
    return this.rooms.listTopics(room);
  }

  @Post('rooms/:roomId/topics')
  @UseGuards(WorkspaceMemberGuard)
  createTopic(
    @ScopedRoom() room: Room,
    @Body(zodBody(CreateTopicSchema)) body: z.infer<typeof CreateTopicSchema>,
  ) {
    return this.rooms.createTopic(room, body.title);
  }

  @Get('rooms/:roomId/topics/:topicId/messages')
  @UseGuards(WorkspaceMemberGuard)
  getTopicMessages(@ScopedRoom() room: Room, @Param('topicId') topicId: string) {
    return this.rooms.getTopicMessages(room, topicId);
  }

  @Get('rooms/:roomId/topics/:topicId/download')
  @UseGuards(WorkspaceMemberGuard)
  async downloadTopic(
    @ScopedRoom() room: Room,
    @Param('topicId') topicId: string,
    @Res() res: Response,
  ) {
    const { filename, markdown } = await this.rooms.getTopicMarkdown(room, topicId);
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );
    res.send(markdown);
  }

  @Post('rooms/:roomId/agents')
  @UseGuards(WorkspaceMemberGuard)
  addAgent(
    @ScopedRoom() room: Room,
    @Body(zodBody(AddAgentSchema)) body: z.infer<typeof AddAgentSchema>,
  ) {
    return this.rooms.addAgent(room, body.agentId, room.workspaceId);
  }

  @Delete('rooms/:roomId/agents/:agentId')
  @UseGuards(WorkspaceMemberGuard)
  removeAgent(@ScopedRoom() room: Room, @Param('agentId') agentId: string) {
    return this.rooms.removeAgent(room, agentId);
  }

  @Delete('rooms/:roomId/topics/:topicId')
  @UseGuards(WorkspaceMemberGuard)
  deleteTopic(@ScopedRoom() room: Room, @Param('topicId') topicId: string) {
    return this.rooms.deleteTopic(room, topicId);
  }

  @Post('rooms/:roomId/discuss')
  @UseGuards(WorkspaceMemberGuard)
  async discuss(
    @ScopedRoom() room: Room,
    @Body(zodBody(DiscussSchema)) body: z.infer<typeof DiscussSchema>,
    @Res() res: Response,
  ) {
    const { topic } = await this.rooms.beginDiscussion(room, body.topic);
    await this.attachAndStream(res, room, topic.id);
  }

  @Post('rooms/:roomId/topics/:topicId/discuss')
  @UseGuards(WorkspaceMemberGuard)
  async discussTopic(
    @ScopedRoom() room: Room,
    @Param('topicId') topicId: string,
    @Body(zodBody(TopicDiscussSchema)) body: z.infer<typeof TopicDiscussSchema>,
    @Res() res: Response,
  ) {
    await this.rooms.beginTopicDiscussion(room, topicId, body.message);
    await this.attachAndStream(res, room, topicId);
  }

  @Get('rooms/:roomId/topics/:topicId/stream')
  @UseGuards(WorkspaceMemberGuard)
  async streamTopic(
    @ScopedRoom() room: Room,
    @Param('topicId') topicId: string,
    @Res() res: Response,
  ) {
    await this.attachAndStream(res, room, topicId);
  }

  @Post('rooms/:roomId/topics/:topicId/cancel')
  @UseGuards(WorkspaceMemberGuard)
  cancelTopic(@ScopedRoom() room: Room, @Param('topicId') topicId: string) {
    return this.rooms.cancelTopic(room, topicId);
  }

  private async attachAndStream(res: Response, room: Room, topicId: string): Promise<void> {
    const stream$ = await this.rooms.subscribeTopic(room, topicId);
    initSse(res);
    if (!stream$) {
      res.end();
      return;
    }
    const subscription = stream$.subscribe({
      next: (ev) => routeSse(res, ev),
      error: (err) => {
        sendSse(res, 'error', { message: (err as Error).message });
        res.end();
      },
      complete: () => res.end(),
    });
    res.on('close', () => subscription.unsubscribe());
  }
}

function routeSse(res: Response, ev: RoomEvent): void {
  if (ev.type === 'content') sendSse(res, 'content', { agentId: ev.agentId, text: ev.text });
  else if (ev.type === 'turn_start')
    sendSse(res, 'turn', {
      phase: 'start',
      agentId: ev.agentId,
      agentName: ev.agentName,
      round: ev.round,
      role: ev.role,
    });
  else if (ev.type === 'turn_end') sendSse(res, 'turn', { phase: 'end', agentId: ev.agentId });
  else if (ev.type === 'tool') sendSse(res, 'tool', { agentId: ev.agentId, name: ev.name, args: ev.args });
  else if (ev.type === 'source') sendSse(res, 'source', { agentId: ev.agentId, hits: ev.hits });
  else if (ev.type === 'status') sendSse(res, 'status', { phase: ev.phase, detail: ev.detail });
  else if (ev.type === 'final') sendSse(res, 'final', { text: ev.text });
  else if (ev.type === 'error') sendSse(res, 'error', { message: ev.message });
  else if (ev.type === 'done') sendSse(res, 'done', { ok: true });
}
