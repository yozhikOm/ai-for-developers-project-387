import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';

type App = Awaited<ReturnType<typeof buildApp>>;

async function listEventTypes(app: App) {
  const response = await app.inject({ method: 'GET', url: '/api/event-types' });
  expect(response.statusCode).toBe(200);
  return response.json();
}

function createEventType(app: App, payload: object) {
  return app.inject({ method: 'POST', url: '/api/event-types', payload });
}

describe('GET /api/event-types', () => {
  it('на пустой БД возвращает пустой список', async () => {
    const app = await buildApp();

    expect(await listEventTypes(app)).toEqual([]);

    await app.close();
  });

  it('возвращает созданные типы по возрастанию времени создания, а не порядка вставки', async () => {
    // Часы идут назад: каждый следующий тип создан раньше предыдущего
    const createdAt = ['2026-10-06T10:00:00.000Z', '2026-10-06T09:00:00.000Z', '2026-10-06T08:00:00.000Z'];
    let tick = 0;
    const app = await buildApp({ now: () => new Date(createdAt[tick++]) });
    for (const name of ['Третий', 'Второй', 'Первый']) {
      expect((await createEventType(app, { name, durationMinutes: 30 })).statusCode).toBe(201);
    }

    const eventTypes = await listEventTypes(app);

    expect(eventTypes.map((eventType: { name: string }) => eventType.name)).toEqual(['Первый', 'Второй', 'Третий']);
    expect(eventTypes.map((eventType: { createdAt: string }) => eventType.createdAt)).toEqual(
      [...createdAt].reverse(),
    );

    await app.close();
  });
});

describe('POST /api/event-types', () => {
  let app: App;

  beforeEach(async () => {
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('создаёт тип: 201 с назначенным id и обрезанными пробелами', async () => {
    const response = await createEventType(app, {
      name: '  Консультация  ',
      description: '\tРазбор вопроса \n',
      durationMinutes: 45,
    });

    expect(response.statusCode).toBe(201);
    const eventType = response.json();
    expect(eventType).toEqual({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      name: 'Консультация',
      description: 'Разбор вопроса',
      durationMinutes: 45,
      createdAt: expect.any(String),
    });
    expect(await listEventTypes(app)).toEqual([eventType]);
  });

  it.each([
    ['без описания', { name: 'Звонок', durationMinutes: 15 }],
    ['с описанием из одних пробелов', { name: 'Звонок', description: '   ', durationMinutes: 15 }],
    ['с пустым описанием', { name: 'Звонок', description: '', durationMinutes: 15 }],
  ])('создаёт тип без описания: %s', async (_title, payload) => {
    const response = await createEventType(app, payload);

    expect(response.statusCode).toBe(201);
    expect(response.json()).not.toHaveProperty('description');
  });

  it('допускает повторяющиеся названия', async () => {
    const first = await createEventType(app, { name: 'Звонок', durationMinutes: 15 });
    const second = await createEventType(app, { name: 'Звонок', durationMinutes: 15 });

    expect(second.statusCode).toBe(201);
    expect(second.json().id).not.toBe(first.json().id);
    expect(await listEventTypes(app)).toHaveLength(2);
  });

  it.each([15, 540])('принимает граничную длительность %i', async (durationMinutes) => {
    const response = await createEventType(app, { name: 'Звонок', durationMinutes });

    expect(response.statusCode).toBe(201);
    expect(response.json().durationMinutes).toBe(durationMinutes);
  });

  it('принимает название длиной 100 и описание длиной 500', async () => {
    const response = await createEventType(app, {
      name: 'н'.repeat(100),
      description: 'о'.repeat(500),
      durationMinutes: 30,
    });

    expect(response.statusCode).toBe(201);
  });

  it.each([
    ['без названия', { durationMinutes: 30 }],
    ['пустое название', { name: '', durationMinutes: 30 }],
    ['название из одних пробелов', { name: '   ', durationMinutes: 30 }],
    ['название длиннее 100', { name: 'н'.repeat(101), durationMinutes: 30 }],
    ['описание длиннее 500', { name: 'Звонок', description: 'о'.repeat(501), durationMinutes: 30 }],
    ['без длительности', { name: 'Звонок' }],
    ['длительность 0', { name: 'Звонок', durationMinutes: 0 }],
    ['длительность 555 (не кратна 15)', { name: 'Звонок', durationMinutes: 555 }],
    ['длительность 600 (больше 540)', { name: 'Звонок', durationMinutes: 600 }],
    ['дробная длительность', { name: 'Звонок', durationMinutes: 22.5 }],
  ])('отвечает 400 VALIDATION_ERROR: %s', async (_title, payload) => {
    const response = await createEventType(app, payload);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ code: 'VALIDATION_ERROR', message: expect.any(String) });
    expect(await listEventTypes(app)).toEqual([]);
  });
});

describe('хранение в файле БД', () => {
  let tempDir: string;
  // Каталог data/ ещё не существует: его должно создать приложение
  let databasePath: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), 'call-calendar-'));
    databasePath = path.join(tempDir, 'data', 'calendar.db');
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('применяет миграции к новому файлу и сама ничего не засевает', async () => {
    const app = await buildApp({ databasePath });

    expect(await listEventTypes(app)).toEqual([]);

    await app.close();
  });

  it('засевает два EventType при создании новой БД', async () => {
    const app = await buildApp({ databasePath, seedNewDatabase: true });

    const eventTypes = await listEventTypes(app);

    expect(eventTypes).toEqual([
      {
        id: expect.stringMatching(/^[0-9a-f-]{36}$/),
        name: 'Звонок 15 минут',
        description: expect.any(String),
        durationMinutes: 15,
        createdAt: expect.any(String),
      },
      {
        id: expect.stringMatching(/^[0-9a-f-]{36}$/),
        name: 'Встреча 30 минут',
        description: expect.any(String),
        durationMinutes: 30,
        createdAt: expect.any(String),
      },
    ]);
    expect(new Date(eventTypes[0].createdAt).toISOString()).toBe(eventTypes[0].createdAt);

    await app.close();
  });

  it('данные переживают пересоздание приложения, а засев при повторном открытии не дублируется', async () => {
    const first = await buildApp({ databasePath, seedNewDatabase: true });
    const seeded = await listEventTypes(first);
    await first.close();

    const reopened = await buildApp({ databasePath, seedNewDatabase: true });

    expect(await listEventTypes(reopened)).toEqual(seeded);

    await reopened.close();
  });
});
