import 'dotenv/config';
import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import authRoutes from './routes/auth.js';
import privateRoutes from './routes/private.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const fastify = Fastify({ logger: true });

await fastify.register(fastifyCookie);

// 공개 정적 파일 (소개 페이지, 등록/로그인/비공개 화면) — 이 자체는 항상 공개로 서빙된다.
// 실제 비공개 "내용"은 여기서 내려주는 게 아니라 /api/private/content API가 로그인 확인 후에만 내려준다.
// (T08-C18: 로그인 안 한 상태로 받은 페이지 소스 어디에도 비공개 내용이 없어야 함 — 그래서 정적 HTML에는
//  내용이 아예 없고, 로그인 후 JS가 API를 불러와 화면에 채워 넣는 구조로 만든다.)
await fastify.register(fastifyStatic, {
  root: path.join(__dirname, '..', 'public'),
});

await fastify.register(authRoutes);
await fastify.register(privateRoutes);

fastify.get('/healthz', async () => ({ ok: true }));

const port = Number(process.env.PORT || 3000);
fastify.listen({ port, host: '0.0.0.0' }, (err) => {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
});
