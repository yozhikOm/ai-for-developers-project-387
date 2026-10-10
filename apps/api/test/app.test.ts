import { existsSync } from 'node:fs';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';

// Путь совпадает с webDistDir внутри src/app.ts
const webDistDir = path.resolve(import.meta.dirname, '../../web/dist');
const webDistBackupDir = `${webDistDir}.bak-${Date.now()}`;

describe('404 и SPA-fallback', () => {
  // На случай, если на диске уже лежит реальная сборка (npm run build) —
  // временно убираем её, чтобы тесты не зависели от локального состояния,
  // и возвращаем обратно после всех проверок.
  let hadExistingDist = false;

  beforeAll(async () => {
    hadExistingDist = existsSync(webDistDir);
    if (hadExistingDist) {
      await rename(webDistDir, webDistBackupDir);
    }
  });

  afterAll(async () => {
    if (hadExistingDist) {
      await rename(webDistBackupDir, webDistDir);
    }
  });

  describe('когда web/dist не собран', () => {
    it('на неизвестный маршрут отвечает стандартным 404 Fastify (статика не подключена)', async () => {
      const app = await buildApp();

      const response = await app.inject({ method: 'GET', url: '/unknown' });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ error: 'Not Found', message: expect.stringContaining('not found') });

      await app.close();
    });

    it.each([
      ['GET', '/api'],
      ['GET', '/api/unknown'],
      ['POST', '/api/owner'],
    ] as const)('на неизвестный /api-маршрут %s %s отвечает ApiError NOT_FOUND', async (method, url) => {
      const app = await buildApp();

      const response = await app.inject({ method, url });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ code: 'NOT_FOUND', message: expect.any(String) });

      await app.close();
    });
  });

  describe('когда web/dist собран', () => {
    beforeAll(async () => {
      await mkdir(webDistDir, { recursive: true });
      await writeFile(path.join(webDistDir, 'index.html'), '<html><body>spa</body></html>');
    });

    afterAll(async () => {
      await rm(webDistDir, { recursive: true, force: true });
    });

    it('отдаёт ApiError NOT_FOUND на неизвестный /api-маршрут', async () => {
      const app = await buildApp();

      const response = await app.inject({ method: 'GET', url: '/api/unknown' });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ code: 'NOT_FOUND', message: expect.any(String) });

      await app.close();
    });

    it('отдаёт JSON 404 на неизвестный маршрут не-GET методом', async () => {
      const app = await buildApp();

      const response = await app.inject({ method: 'POST', url: '/unknown' });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: 'Not Found' });

      await app.close();
    });

    it('отдаёт index.html (SPA-fallback) на неизвестный GET-маршрут', async () => {
      const app = await buildApp();

      const response = await app.inject({ method: 'GET', url: '/some/client/route' });

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('spa');

      await app.close();
    });

    it('отдаёт index.html (SPA-fallback), а не JSON 404, для маршрута, начинающегося с "api", но не под /api/', async () => {
      const app = await buildApp();

      const response = await app.inject({ method: 'GET', url: '/apidocs' });

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('spa');

      await app.close();
    });
  });
});

