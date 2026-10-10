import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.ts';
import type { BookingWindowDay } from '../src/generated/index.ts';

type App = Awaited<ReturnType<typeof buildApp>>;

// «Сейчас» — момент UTC, подписанный временем по Москве (UTC+3, без перехода на летнее время).
// 2026-10-06 — вторник, 2026-10-07 — среда.
const TUESDAY_10_00_MSK = '2026-10-06T07:00:00.000Z';
const NOW = () => new Date(TUESDAY_10_00_MSK);
const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

// Моменты среды 7 октября по Москве
const WEDNESDAY_09_00 = '2026-10-07T06:00:00.000Z';
const WEDNESDAY_12_00 = '2026-10-07T09:00:00.000Z';
const WEDNESDAY_12_30 = '2026-10-07T09:30:00.000Z';
const WEDNESDAY_17_30 = '2026-10-07T14:30:00.000Z';

async function createEventType(app: App, durationMinutes: number, name = `Звонок ${durationMinutes} минут`) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/event-types',
    payload: { name, durationMinutes },
  });
  expect(response.statusCode).toBe(201);
  return response.json() as { id: string; name: string };
}

function createBooking(app: App, payload: object) {
  return app.inject({ method: 'POST', url: '/api/bookings', payload });
}

function bookingPayload(eventTypeId: string, start: string, overrides: object = {}) {
  return { eventTypeId, start, guestName: 'Иван Петров', guestEmail: 'ivan@example.com', ...overrides };
}

async function slotStatus(app: App, eventTypeId: string, start: string) {
  const response = await app.inject({ method: 'GET', url: `/api/event-types/${eventTypeId}/slots` });
  expect(response.statusCode).toBe(200);
  const slot = (response.json() as BookingWindowDay[])
    .flatMap((day) => day.slots)
    .find((candidate) => candidate.start === start);
  expect(slot).toBeDefined();
  return slot!.status;
}

beforeEach(() => {
  vi.stubEnv('OWNER_TIMEZONE', 'Europe/Moscow');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('POST /api/bookings', () => {
  let app: App;

  beforeEach(async () => {
    app = await buildApp({ now: NOW });
  });

  afterEach(async () => {
    await app.close();
  });

  it('создаёт Booking: 201 с вычисленным концом, обрезанными значениями и сводкой типа', async () => {
    const eventType = await createEventType(app, 30, 'Встреча 30 минут');

    const response = await createBooking(
      app,
      bookingPayload(eventType.id, WEDNESDAY_12_00, { guestName: '  Иван Петров ', guestEmail: '\tIvan@Example.com  ' }),
    );

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      start: WEDNESDAY_12_00,
      // Конец — начало плюс длительность, без Buffer
      end: WEDNESDAY_12_30,
      guestName: 'Иван Петров',
      // Регистр email не меняется
      guestEmail: 'Ivan@Example.com',
      createdAt: TUESDAY_10_00_MSK,
      eventType: { id: eventType.id, name: 'Встреча 30 минут' },
    });
  });

  it('принимает имя длиной 100 и email длиной 254', async () => {
    const eventType = await createEventType(app, 30);

    const response = await createBooking(
      app,
      bookingPayload(eventType.id, WEDNESDAY_12_00, {
        guestName: 'и'.repeat(100),
        guestEmail: `${'a'.repeat(242)}@example.com`,
      }),
    );

    expect(response.statusCode).toBe(201);
  });

  it.each([
    ['без имени', { guestName: undefined }],
    ['пустое имя', { guestName: '' }],
    ['имя из одних пробелов', { guestName: '   ' }],
    ['имя длиннее 100', { guestName: 'и'.repeat(101) }],
    ['без email', { guestEmail: undefined }],
    ['пустой email', { guestEmail: '' }],
    ['email без @', { guestEmail: 'ivan.example.com' }],
    ['email без домена верхнего уровня', { guestEmail: 'ivan@example' }],
    ['email с пробелом внутри', { guestEmail: 'ivan petrov@example.com' }],
    ['email длиннее 254', { guestEmail: `${'a'.repeat(243)}@example.com` }],
    ['без начала', { start: undefined }],
    ['начало не дата-время', { start: 'завтра в полдень' }],
  ])('отвечает 400 VALIDATION_ERROR: %s', async (_title, overrides) => {
    const eventType = await createEventType(app, 30);

    const response = await createBooking(app, bookingPayload(eventType.id, WEDNESDAY_12_00, overrides));

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ code: 'VALIDATION_ERROR', message: expect.any(String) });
    expect(await slotStatus(app, eventType.id, WEDNESDAY_12_00)).toBe('free');
  });

  it('неизвестный eventTypeId отвечает 404 EVENT_TYPE_NOT_FOUND', async () => {
    const response = await createBooking(app, bookingPayload(UNKNOWN_ID, WEDNESDAY_12_00));

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ code: 'EVENT_TYPE_NOT_FOUND', message: expect.any(String) });
  });

  it('две брони на пересекающееся время подряд дают 201 и 409 SLOT_TAKEN, в том числе для другого типа', async () => {
    const short = await createEventType(app, 30);
    const long = await createEventType(app, 60);

    const first = await createBooking(app, bookingPayload(short.id, WEDNESDAY_12_00));
    const sameType = await createBooking(app, bookingPayload(short.id, WEDNESDAY_12_00));
    // 11:30–12:30 другого типа пересекается с бронью 12:00–12:30
    const otherType = await createBooking(app, bookingPayload(long.id, '2026-10-07T08:30:00.000Z'));

    expect(first.statusCode).toBe(201);
    for (const response of [sameType, otherType]) {
      expect(response.statusCode).toBe(409);
      expect(response.json()).toEqual({ code: 'SLOT_TAKEN', message: expect.any(String) });
    }
  });

  // Существующая Booking — среда 12:00–12:30 по Москве; новая — другого EventType
  it.each([
    ['30 минут вплотную после', '2026-10-07T09:30:00.000Z', 30], // 12:30–13:00
    ['30 минут вплотную до', '2026-10-07T08:30:00.000Z', 30], // 11:30–12:00
    ['45 минут вплотную до', '2026-10-07T08:15:00.000Z', 45], // 11:15–12:00
  ])('Booking ближе Buffer к другой отвечает 409 SLOT_TAKEN: %s', async (_title, start, durationMinutes) => {
    const booked = await createEventType(app, 30);
    const eventType = await createEventType(app, durationMinutes, 'Проверяемый тип');
    expect((await createBooking(app, bookingPayload(booked.id, WEDNESDAY_12_00))).statusCode).toBe(201);

    const response = await createBooking(app, bookingPayload(eventType.id, start));

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ code: 'SLOT_TAKEN', message: expect.any(String) });
  });

  it('Booking ровно через Buffer 15 минут до и после другой создаётся', async () => {
    const eventType = await createEventType(app, 30);
    expect((await createBooking(app, bookingPayload(eventType.id, WEDNESDAY_12_00))).statusCode).toBe(201);

    // 11:15–11:45 и 12:45–13:15 по Москве
    const before = await createBooking(app, bookingPayload(eventType.id, '2026-10-07T08:15:00.000Z'));
    const after = await createBooking(app, bookingPayload(eventType.id, '2026-10-07T09:45:00.000Z'));

    expect(before.statusCode).toBe(201);
    expect(after.statusCode).toBe(201);
  });

  // «Сейчас» — вторник 6 октября 10:00 по Москве; окно — с 6 по 19 октября
  it.each([
    ['начало не на 15-минутной сетке', '2026-10-07T09:05:00.000Z'], // среда 12:05
    ['вне BookingWindow', '2026-10-20T09:00:00.000Z'], // вторник 20 октября 12:00
    ['до начала WorkingHours', '2026-10-07T05:45:00.000Z'], // среда 08:45
    ['слот заканчивался бы после 18:00', '2026-10-07T14:45:00.000Z'], // среда 17:45–18:15
    ['начало в 18:00', '2026-10-07T15:00:00.000Z'], // среда 18:00
    ['в выходной', '2026-10-10T09:00:00.000Z'], // суббота 12:00
    ['внутри MinimumNotice', '2026-10-06T07:45:00.000Z'], // сегодня 10:45
    ['в прошлом', '2026-10-06T06:00:00.000Z'], // сегодня 09:00
  ])('отвечает 422 SLOT_UNAVAILABLE: %s', async (_title, start) => {
    const eventType = await createEventType(app, 30);

    const response = await createBooking(app, bookingPayload(eventType.id, start));

    expect(response.statusCode).toBe(422);
    expect(response.json()).toEqual({ code: 'SLOT_UNAVAILABLE', message: expect.any(String) });
  });

  it('начало ровно через MinimumNotice 60 минут доступно', async () => {
    const eventType = await createEventType(app, 30);

    // Сегодня 11:00 по Москве
    const response = await createBooking(app, bookingPayload(eventType.id, '2026-10-06T08:00:00.000Z'));

    expect(response.statusCode).toBe(201);
  });

  it('на краях рабочего дня Buffer не применяется: брони с 09:00 и до 18:00 возможны', async () => {
    const eventType = await createEventType(app, 30);

    const morning = await createBooking(app, bookingPayload(eventType.id, WEDNESDAY_09_00));
    const evening = await createBooking(app, bookingPayload(eventType.id, WEDNESDAY_17_30));

    expect(morning.statusCode).toBe(201);
    expect(evening.statusCode).toBe(201);
    expect(evening.json().end).toBe('2026-10-07T15:00:00.000Z');
  });
});

describe('хранение Booking в файле БД', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), 'call-calendar-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('Booking переживает пересоздание приложения', async () => {
    const databasePath = path.join(tempDir, 'data', 'calendar.db');
    const first = await buildApp({ databasePath, now: NOW });
    const eventType = await createEventType(first, 30);
    expect((await createBooking(first, bookingPayload(eventType.id, WEDNESDAY_12_00))).statusCode).toBe(201);
    await first.close();

    const reopened = await buildApp({ databasePath, now: NOW });

    expect(await slotStatus(reopened, eventType.id, WEDNESDAY_12_00)).toBe('taken');

    await reopened.close();
  });
});
