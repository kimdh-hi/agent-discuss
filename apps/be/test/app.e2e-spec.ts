process.env.LLM_PROVIDER = 'mock';
process.env.DATABASE_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret';

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MikroORM } from '@mikro-orm/core';
import { getMikroORMToken } from '@mikro-orm/nestjs';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';

describe('agent-discuss (e2e)', () => {
  let app: INestApplication;
  let server: any;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new AllExceptionsFilter());
    const orm = app.get(MikroORM);
    await orm.schema.dropSchema();
    await orm.schema.createSchema();

    const ragOrm = app.get<MikroORM>(getMikroORMToken('rag'));
    const ragEm = ragOrm.em.fork();
    await ragEm.getConnection().execute('CREATE EXTENSION IF NOT EXISTS vector');
    await ragOrm.schema.updateSchema();

    await app.init();
    server = app.getHttpServer();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  async function login(email: string): Promise<string> {
    const res = await request(server).post('/auth/dev-login').send({ email });
    return res.body.token;
  }

  async function waitForReadyDocument(agentId: string, token: string): Promise<{ chunkCount: number }> {
    for (let i = 0; i < 30; i++) {
      const res = await request(server)
        .get(`/agents/${agentId}/documents`)
        .set('Authorization', `Bearer ${token}`);
      const doc = res.body.items?.[0];
      if (doc?.status === 'ready') return doc;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error('문서 인덱싱이 완료되지 않았습니다.');
  }

  it('전체 플로우: 워크스페이스→에이전트→질의(RAG)→룸 토론', async () => {
    const token = await login('owner@test.com');

    const ws = await request(server).post('/workspaces').set('Authorization', `Bearer ${token}`).send({ name: 'WS' });
    expect(ws.status).toBe(201);
    const wsId = ws.body.id;

    const a1 = await request(server)
      .post(`/workspaces/${wsId}/agents`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '낙관론자', instructions: '너는 낙관적으로 본다.' });
    expect(a1.status).toBe(201);
    const agentId = a1.body.id;

    const a2 = await request(server)
      .post(`/workspaces/${wsId}/agents`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '비관론자', instructions: '너는 신중하게 위험을 본다.' });

    // RAG 문서 적재
    const doc = await request(server)
      .post(`/agents/${agentId}/documents`)
      .set('Authorization', `Bearer ${token}`)
      .send({ text: '프로젝트 마감일은 2026년 7월 1일이다.\n\n예산은 5천만원으로 책정되었다.' });
    expect(doc.body.items).toHaveLength(1);
    const readyDoc = await waitForReadyDocument(agentId, token);
    expect(readyDoc.chunkCount).toBeGreaterThan(0);

    // 단일 질의(SSE) — RAG 검색이 source 이벤트로 흐른다
    const q = await request(server)
      .post(`/agents/${agentId}/query`)
      .set('Authorization', `Bearer ${token}`)
      .send({ message: '마감일이 언제인가요?' });
    expect(q.text).toContain('event: source');
    expect(q.text).toContain('event: content');
    expect(q.text).toContain('event: done');

    // 룸 토론(SSE)
    const room = await request(server)
      .post(`/workspaces/${wsId}/rooms`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'R', agentIds: [agentId, a2.body.id], maxRounds: 2 });
    expect(room.status).toBe(201);

    const disc = await request(server)
      .post(`/rooms/${room.body.id}/discuss`)
      .set('Authorization', `Bearer ${token}`)
      .send({ topic: '이 프로젝트를 진행해야 하는가?' });
    expect(disc.text).toContain('event: turn');
    expect(disc.text).toContain('event: final');
    expect(disc.text).toContain('event: done');

    const topics = await request(server)
      .get(`/rooms/${room.body.id}/topics`)
      .set('Authorization', `Bearer ${token}`);
    expect(topics.status).toBe(200);
    expect(topics.body).toHaveLength(1);
    expect(topics.body[0].title).toBe('이 프로젝트를 진행해야 하는가?');
    expect(topics.body[0].status).toBe('completed');
    expect(topics.body[0].finalText).toBeTruthy();

    const messages = await request(server)
      .get(`/rooms/${room.body.id}/topics/${topics.body[0].id}/messages`)
      .set('Authorization', `Bearer ${token}`);
    expect(messages.status).toBe(200);
    expect(messages.body.messages.some((m: { role: string }) => m.role === 'user')).toBe(true);
    expect(messages.body.messages.some((m: { role: string }) => m.role === 'agent')).toBe(true);
    expect(messages.body.messages.some((m: { role: string }) => m.role === 'moderator')).toBe(true);

    const followUp = await request(server)
      .post(`/rooms/${room.body.id}/topics/${topics.body[0].id}/discuss`)
      .set('Authorization', `Bearer ${token}`)
      .send({ message: '방금 결론에서 가장 큰 위험 하나만 다시 논의해줘.' });
    expect(followUp.text).toContain('event: final');
    expect(followUp.text).toContain('event: done');

    const continuedMessages = await request(server)
      .get(`/rooms/${room.body.id}/topics/${topics.body[0].id}/messages`)
      .set('Authorization', `Bearer ${token}`);
    const userMessages = continuedMessages.body.messages.filter((m: { role: string }) => m.role === 'user');
    expect(userMessages).toHaveLength(2);

    // 종료된 토픽에 재연결(stream)하면 활성 구독이 없어 빈 SSE로 끝난다
    const reattach = await request(server)
      .get(`/rooms/${room.body.id}/topics/${topics.body[0].id}/stream`)
      .set('Authorization', `Bearer ${token}`);
    expect(reattach.status).toBe(200);
    expect(reattach.text).not.toContain('event: turn');

    // 활성 토론이 없으면 cancel은 ok:false
    const cancel = await request(server)
      .post(`/rooms/${room.body.id}/topics/${topics.body[0].id}/cancel`)
      .set('Authorization', `Bearer ${token}`);
    expect(cancel.status).toBe(201);
    expect(cancel.body.ok).toBe(false);
  });

  it('room agent 추가/제거 및 topic 삭제', async () => {
    const token = await login('agent-mgmt@test.com');

    const ws = await request(server).post('/workspaces').set('Authorization', `Bearer ${token}`).send({ name: 'WS-MGMT' });
    const wsId = ws.body.id;

    const a1 = await request(server)
      .post(`/workspaces/${wsId}/agents`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Agent1', instructions: 'A' });
    const a2 = await request(server)
      .post(`/workspaces/${wsId}/agents`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Agent2', instructions: 'B' });

    const room = await request(server)
      .post(`/workspaces/${wsId}/rooms`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'R-MGMT', agentIds: [a1.body.id] });
    expect(room.status).toBe(201);
    const roomId = room.body.id;

    const addRes = await request(server)
      .post(`/rooms/${roomId}/agents`)
      .set('Authorization', `Bearer ${token}`)
      .send({ agentId: a2.body.id });
    expect(addRes.status).toBe(201);

    const afterAdd = await request(server).get(`/rooms/${roomId}`).set('Authorization', `Bearer ${token}`);
    expect(afterAdd.body.agents).toHaveLength(2);

    const removeRes = await request(server)
      .delete(`/rooms/${roomId}/agents/${a1.body.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(removeRes.status).toBe(200);

    const afterRemove = await request(server).get(`/rooms/${roomId}`).set('Authorization', `Bearer ${token}`);
    expect(afterRemove.body.agents).toHaveLength(1);
    expect(afterRemove.body.agents[0].id).toBe(a2.body.id);

    const topic = await request(server)
      .post(`/rooms/${roomId}/topics`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: '삭제할 토픽' });
    expect(topic.status).toBe(201);
    const topicId = topic.body.id;

    const deleteRes = await request(server)
      .delete(`/rooms/${roomId}/topics/${topicId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.ok).toBe(true);

    const topicsAfter = await request(server).get(`/rooms/${roomId}/topics`).set('Authorization', `Bearer ${token}`);
    expect(topicsAfter.body).toHaveLength(0);

    const otherWs = await request(server).post('/workspaces').set('Authorization', `Bearer ${token}`).send({ name: 'OTHER-WS' });
    const otherAgent = await request(server)
      .post(`/workspaces/${otherWs.body.id}/agents`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Other', instructions: 'X' });
    const crossAdd = await request(server)
      .post(`/rooms/${roomId}/agents`)
      .set('Authorization', `Bearer ${token}`)
      .send({ agentId: otherAgent.body.id });
    expect(crossAdd.status).toBe(400);
    expect(crossAdd.body.errorCode).toBe('3002');
  });

  it('멤버십 스코프: 비멤버는 워크스페이스 리소스에 접근할 수 없다', async () => {
    const owner = await login('owner2@test.com');
    const ws = await request(server).post('/workspaces').set('Authorization', `Bearer ${owner}`).send({ name: 'WS2' });
    const agent = await request(server)
      .post(`/workspaces/${ws.body.id}/agents`)
      .set('Authorization', `Bearer ${owner}`)
      .send({ name: 'A', instructions: 'x' });

    const outsider = await login('outsider@test.com');
    const denied = await request(server)
      .get(`/agents/${agent.body.id}`)
      .set('Authorization', `Bearer ${outsider}`);
    expect(denied.status).toBe(400);
    expect(denied.body.errorCode).toBe('2002');

    // 멤버로 추가되면 접근 가능
    await request(server)
      .post(`/workspaces/${ws.body.id}/members`)
      .set('Authorization', `Bearer ${owner}`)
      .send({ email: 'outsider@test.com' });
    const allowed = await request(server)
      .get(`/agents/${agent.body.id}`)
      .set('Authorization', `Bearer ${outsider}`);
    expect(allowed.status).toBe(200);
  });

  it('인증 없으면 401', async () => {
    const res = await request(server).get('/workspaces');
    expect(res.status).toBe(401);
  });
});
