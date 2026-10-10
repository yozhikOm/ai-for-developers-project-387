import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';

// Общий обработчик ошибок приводит любые отказы к ApiError { code, message }.
// В контракте пока нет операций со входными данными и сбоями, поэтому тест
// добавляет к приложению свои маршруты: обработчик действует на все маршруты.
describe('ошибки API', () => {
  it('невалидный запрос отвечает 400 VALIDATION_ERROR', async () => {
    const app = await buildApp();
    app.get(
      '/api/test-validation',
      { schema: { querystring: { type: 'object', required: ['n'], properties: { n: { type: 'integer' } } } } },
      async () => ({ ok: true }),
    );

    const response = await app.inject({ method: 'GET', url: '/api/test-validation?n=abc' });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ code: 'VALIDATION_ERROR', message: expect.any(String) });

    await app.close();
  });

  it('непредвиденная ошибка отвечает 500 INTERNAL_ERROR и не раскрывает подробностей', async () => {
    const app = await buildApp();
    app.get('/api/test-crash', async () => {
      throw new Error('секрет из стека');
    });

    const response = await app.inject({ method: 'GET', url: '/api/test-crash' });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ code: 'INTERNAL_ERROR', message: expect.any(String) });
    expect(response.body).not.toContain('секрет');

    await app.close();
  });
});
