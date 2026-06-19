import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { z } from 'zod';
import { zodBody } from '../common/zod.pipe';
import { initSse, sendSse } from '../common/sse';
import { BaseException } from '../common/base.exception';
import { ErrorCode } from '../common/error-code';
import { AuthGuard } from '../auth/auth.guard';
import { WorkspaceMemberGuard } from '../auth/workspace-member.guard';
import { ScopedAgent, CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/auth.service';
import { Agent } from '../entities';
import { UploadFileInput } from '../rag/rag.interfaces';
import { AgentsService } from './agents.service';

const CreateSchema = z.object({
  name: z.string().min(1),
  instructions: z.string().min(1),
  model: z.string().optional(),
  description: z.string().optional(),
  tools: z.array(z.string()).optional(),
  maxToolIterations: z.number().int().positive().optional(),
});
const UpdateSchema = z.object({
  name: z.string().min(1).optional(),
  instructions: z.string().min(1).optional(),
  model: z.string().optional(),
  description: z.string().optional(),
  tools: z.array(z.string()).optional(),
  maxToolIterations: z.number().int().positive().optional(),
});
const QuerySchema = z.object({ message: z.string().min(1) });

const MAX_UPLOAD_FILES = 20;
const UPLOAD_OPTIONS = { defParamCharset: 'utf8' } as const;

function toUploadInput(file: Express.Multer.File): UploadFileInput {
  return {
    originalname: file.originalname.normalize('NFC'),
    mimetype: file.mimetype,
    size: file.size,
    buffer: file.buffer,
  };
}

@Controller()
@UseGuards(AuthGuard)
export class AgentsController {
  constructor(private readonly agents: AgentsService) {}

  @Post('workspaces/:wsId/agents')
  @UseGuards(WorkspaceMemberGuard)
  create(
    @Param('wsId') wsId: string,
    @Body(zodBody(CreateSchema)) body: z.infer<typeof CreateSchema>,
  ) {
    return this.agents.create(wsId, {
      name: body.name,
      instructions: body.instructions,
      model: body.model || process.env.LLM_MODEL || 'gpt-4o-mini',
      description: body.description,
      tools: body.tools,
      maxToolIterations: body.maxToolIterations,
    });
  }

  @Get('workspaces/:wsId/agents')
  @UseGuards(WorkspaceMemberGuard)
  list(@Param('wsId') wsId: string) {
    return this.agents.listByWorkspace(wsId);
  }

  @Get('agents/:agentId')
  @UseGuards(WorkspaceMemberGuard)
  get(@ScopedAgent() agent: Agent) {
    return agent;
  }

  @Patch('agents/:agentId')
  @UseGuards(WorkspaceMemberGuard)
  update(
    @ScopedAgent() agent: Agent,
    @Body(zodBody(UpdateSchema)) body: z.infer<typeof UpdateSchema>,
  ) {
    return this.agents.update(agent.id, body);
  }

  @Delete('agents/:agentId')
  @UseGuards(WorkspaceMemberGuard)
  async remove(@ScopedAgent() agent: Agent) {
    await this.agents.remove(agent.id);
    return { ok: true };
  }

  @Post('agents/:agentId/documents')
  @UseGuards(WorkspaceMemberGuard)
  @UseInterceptors(FilesInterceptor('files', MAX_UPLOAD_FILES, UPLOAD_OPTIONS))
  async ingest(
    @ScopedAgent() agent: Agent,
    @CurrentUser() user: AuthUser,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
    @Body() body: { text?: string },
  ) {
    const uploader = { id: user.userId, name: user.email };
    if (files && files.length > 0) {
      const items = await this.agents.uploadDocuments(
        agent.id,
        files.map(toUploadInput),
        uploader,
      );
      return { items };
    }
    if (body?.text && body.text.trim()) {
      const doc = await this.agents.ingestDocument(agent.id, body.text, uploader);
      return { items: [doc] };
    }
    throw new BaseException(ErrorCode.BAD_REQUEST, 'files 또는 text 가 필요합니다.');
  }

  @Get('agents/:agentId/documents')
  @UseGuards(WorkspaceMemberGuard)
  async listDocuments(@ScopedAgent() agent: Agent) {
    const items = await this.agents.listDocuments(agent.id);
    return { items };
  }

  @Delete('agents/:agentId/documents/:documentId')
  @UseGuards(WorkspaceMemberGuard)
  @HttpCode(204)
  async removeDocument(
    @ScopedAgent() agent: Agent,
    @Param('documentId') documentId: string,
  ) {
    await this.agents.deleteDocument(agent.id, documentId);
  }

  @Get('agents/:agentId/documents/:documentId/raw')
  @UseGuards(WorkspaceMemberGuard)
  async rawDocument(
    @ScopedAgent() agent: Agent,
    @Param('documentId') documentId: string,
    @Res() res: Response,
  ) {
    const { doc, stream } = await this.agents.getRawDocument(agent.id, documentId);
    res.setHeader('Content-Type', doc!.mimeType || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(doc!.filename)}`,
    );
    stream.pipe(res);
  }

  @Post('agents/:agentId/query')
  @UseGuards(WorkspaceMemberGuard)
  async query(
    @ScopedAgent() agent: Agent,
    @Body(zodBody(QuerySchema)) body: z.infer<typeof QuerySchema>,
    @Res() res: Response,
  ) {
    initSse(res);
    try {
      for await (const ev of this.agents.streamQuery(agent, body.message)) {
        if (ev.type === 'text') sendSse(res, 'content', { text: ev.text });
        else if (ev.type === 'tool_call') sendSse(res, 'tool', { name: ev.name, args: ev.args });
        else if (ev.type === 'sources') sendSse(res, 'source', { hits: ev.hits });
        else if (ev.type === 'done') sendSse(res, 'done', { ok: true });
      }
    } catch (err) {
      sendSse(res, 'error', { message: (err as Error).message });
    } finally {
      res.end();
    }
  }
}
