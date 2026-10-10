import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.ts';
import type { Booking, UpcomingBookings } from '../src/generated/index.ts';

type App = Awaited<ReturnType<typeof buildApp>>;

// «Сейчас» — моменты UTC, подписанные временем по Москве (UTC+3).
// 2026-10-06 — вторник, 2026-10-07 — среда.
const TUESDAY_10_00 = '2026-10-06T07:00:00.000Z';
const TUESDAY_11_00 = '2026-10-06T08:00:00.000Z';
const TUESDAY_11_10 = '2026-10-06T08:10:00.000Z';
const TUESDAY_11_30 = '2026-10-06T08:30:00.000Z';
const WEDNESDAY_09_00 = '2026-10-07T06:00:00.000Z';
const WEDNESDAY_12_00 = '2026-10-07T09:00:00.000Z';
const THURSDAY_10_00 = '2026-10-08T07:00:00.000Z';

// Часы приложения, которые тест переводит вперёд: брони создаются через createBooking
// в «прошлом», а список запрашивается позже — когда бронь уже идёт или закончилась
function createClock(initial: string) {
  let moment = new Date(initial);
  return {
    now: () => moment,
    set(iso: string) {
      moment = new Date(iso);
    },
  };
}

async function createEventType(app: App, name: string, durationMinutes: number) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/event-types',
    payload: { name, durationMinutes },
  });
  expect(response.statusCode).toBe(201);
  return response.json() as { id: string; name: string };
}

async function createBooking(app: App, eventTypeId: string, start: string, guestName: string) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/bookings',
    payload: { eventTypeId, start, guestName, guestEmail: 'guest@example.com' },
  });
  expect(response.statusCode).toBe(201);
  return response.json() as Booking;
}

async function listUpcoming(app: App) {
  const response = await app.inject({ method: 'GET', url: '/api/bookings/upcoming' });
  expect(response.statusCode).toBe(200);
  return response.json() as UpcomingBookings;
}

beforeEach(() => {
  vi.stubEnv('OWNER_TIMEZONE', 'Europe/Moscow');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('GET /api/bookings/upcoming', () => {
  let app: App;
  let clock: ReturnType<typeof createClock>;

  beforeEach(async () => {
    clock = createClock(TUESDAY_10_00);
    app = await buildApp({ now: clock.now });
  });

  afterEach(async () => {
    await app.close();
  });

  it('без броней отвечает пустым списком и без current', async () => {
    expect(await listUpcoming(app)).toEqual({ upcoming: [] });
  });

  it('возвращает брони всех EventType по возрастанию начала со сводкой типа; без звонка current нет', async () => {
    const meeting = await createEventType(app, 'Встреча 30 минут', 30);
    const review = await createEventType(app, 'Разбор проекта', 60);
    // Создаём не по порядку начала
    const wednesdayNoon = await createBooking(app, meeting.id, WEDNESDAY_12_00, 'Ольга');
    const tuesday = await createBooking(app, meeting.id, TUESDAY_11_00, 'Иван');
    const wednesdayMorning = await createBooking(app, review.id, WEDNESDAY_09_00, 'Пётр');

    const result = await listUpcoming(app);

    expect(result).toEqual({ upcoming: [tuesday, wednesdayMorning, wednesdayNoon] });
    expect(result.upcoming.map((booking) => booking.eventType)).toEqual([
      { id: meeting.id, name: 'Встреча 30 минут' },
      { id: review.id, name: 'Разбор проекта' },
      { id: meeting.id, name: 'Встреча 30 минут' },
    ]);
  });

  it('идущая сейчас бронь — в current, а не в upcoming', async () => {
    const meeting = await createEventType(app, 'Встреча 30 минут', 30);
    const ongoing = await createBooking(app, meeting.id, TUESDAY_11_00, 'Иван');
    const later = await createBooking(app, meeting.id, WEDNESDAY_12_00, 'Ольга');

    clock.set(TUESDAY_11_10);

    expect(await listUpcoming(app)).toEqual({ current: ongoing, upcoming: [later] });
  });

  it('бронь, начавшаяся ровно сейчас, уже текущая', async () => {
    const meeting = await createEventType(app, 'Встреча 30 минут', 30);
    const ongoing = await createBooking(app, meeting.id, TUESDAY_11_00, 'Иван');

    clock.set(TUESDAY_11_00);

    expect(await listUpcoming(app)).toEqual({ current: ongoing, upcoming: [] });
  });

  it('закончившиеся брони не попадают ни в current, ни в upcoming', async () => {
    const meeting = await createEventType(app, 'Встреча 30 минут', 30);
    await createBooking(app, meeting.id, TUESDAY_11_00, 'Иван');
    const later = await createBooking(app, meeting.id, WEDNESDAY_12_00, 'Ольга');

    // Конец интервала не входит в него: в 11:30 бронь 11:00–11:30 уже закончилась
    clock.set(TUESDAY_11_30);
    expect(await listUpcoming(app)).toEqual({ upcoming: [later] });

    clock.set(THURSDAY_10_00);
    expect(await listUpcoming(app)).toEqual({ upcoming: [] });
  });
});
