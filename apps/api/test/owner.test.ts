import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.ts';

describe('GET /api/owner', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('отдаёт имя и пояс Owner из OWNER_NAME и OWNER_TIMEZONE', async () => {
    vi.stubEnv('OWNER_NAME', 'Анна Смирнова');
    vi.stubEnv('OWNER_TIMEZONE', 'Asia/Yekaterinburg');
    const app = await buildApp();

    const response = await app.inject({ method: 'GET', url: '/api/owner' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ name: 'Анна Смирнова', timezone: 'Asia/Yekaterinburg' });

    await app.close();
  });

  it('без переменных окружения отдаёт значения по умолчанию', async () => {
    vi.stubEnv('OWNER_NAME', undefined);
    vi.stubEnv('OWNER_TIMEZONE', undefined);
    const app = await buildApp();

    const response = await app.inject({ method: 'GET', url: '/api/owner' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ name: 'Владелец календаря', timezone: 'Europe/Moscow' });

    await app.close();
  });
});
