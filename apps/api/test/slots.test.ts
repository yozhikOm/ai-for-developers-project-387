import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.ts';
import type { BookingWindowDay } from '../src/generated/index.ts';

type App = Awaited<ReturnType<typeof buildApp>>;

// Все «сейчас» заданы моментами UTC и подписаны временем по Москве (UTC+3, без перехода
// на летнее время): тесты не зависят от дня недели, часа запуска и пояса машины.
// 2026-10-06 — вторник.
const TUESDAY_10_00_MSK = '2026-10-06T07:00:00.000Z';
const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

async function appAt(now: string) {
  return buildApp({ now: () => new Date(now) });
}

async function createEventType(app: App, durationMinutes: number) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/event-types',
    payload: { name: `Звонок ${durationMinutes} минут`, durationMinutes },
  });
  expect(response.statusCode).toBe(201);
  return response.json() as { id: string };
}

async function listSlots(app: App, eventTypeId: string): Promise<BookingWindowDay[]> {
  const response = await app.inject({ method: 'GET', url: `/api/event-types/${eventTypeId}/slots` });
  expect(response.statusCode).toBe(200);
  return response.json();
}

// Слоты одного дня окна для нового типа заданной длительности
async function slotsOn(now: string, durationMinutes: number, date: string) {
  const app = await appAt(now);
  const { id } = await createEventType(app, durationMinutes);
  const day = (await listSlots(app, id)).find((windowDay) => windowDay.date === date);
  await app.close();
  expect(day).toBeDefined();
  return day!;
}

beforeEach(() => {
  vi.stubEnv('OWNER_TIMEZONE', 'Europe/Moscow');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('GET /api/event-types/{eventTypeId}', () => {
  it('возвращает EventType по id', async () => {
    const app = await appAt(TUESDAY_10_00_MSK);
    const created = await createEventType(app, 30);

    const response = await app.inject({ method: 'GET', url: `/api/event-types/${created.id}` });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(created);

    await app.close();
  });

  it.each([
    ['getEventType', `/api/event-types/${UNKNOWN_ID}`],
    ['getEventType, id не UUID', '/api/event-types/not-a-uuid'],
    ['listSlots', `/api/event-types/${UNKNOWN_ID}/slots`],
    ['listSlots, id не UUID', '/api/event-types/not-a-uuid/slots'],
  ])('неизвестный id отвечает 404 EVENT_TYPE_NOT_FOUND: %s', async (_title, url) => {
    const app = await appAt(TUESDAY_10_00_MSK);

    const response = await app.inject({ method: 'GET', url });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ code: 'EVENT_TYPE_NOT_FOUND', message: expect.any(String) });

    await app.close();
  });
});

describe('GET /api/event-types/{eventTypeId}/slots', () => {
  describe('BookingWindow', () => {
    it('14 календарных дней начиная с сегодняшнего по поясу Owner', async () => {
      const app = await appAt(TUESDAY_10_00_MSK);
      const { id } = await createEventType(app, 30);

      const days = await listSlots(app, id);

      expect(days.map((day) => day.date)).toEqual([
        '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12',
        '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18', '2026-10-19',
      ]);

      await app.close();
    });

    it.each([
      // В UTC оба момента — 6 октября; по Москве второй уже 7-е
      ['23:59 по Москве — ещё вторник', '2026-10-06T20:59:00.000Z', '2026-10-06', '2026-10-19'],
      ['00:00 по Москве — уже среда', '2026-10-06T21:00:00.000Z', '2026-10-07', '2026-10-20'],
    ])('сдвигается в полночь по поясу Owner, а не по UTC: %s', async (_title, now, first, last) => {
      const app = await appAt(now);
      const { id } = await createEventType(app, 30);

      const days = await listSlots(app, id);

      expect(days).toHaveLength(14);
      expect(days[0].date).toBe(first);
      expect(days[13].date).toBe(last);

      await app.close();
    });

    it('считает окно в поясе Owner из конфигурации', async () => {
      // 2026-10-06 20:00 UTC — в Екатеринбурге (UTC+5) уже 01:00 среды
      vi.stubEnv('OWNER_TIMEZONE', 'Asia/Yekaterinburg');

      const day = await slotsOn('2026-10-06T20:00:00.000Z', 30, '2026-10-07');

      expect(day.slots[0].start).toBe('2026-10-07T04:00:00.000Z');
      expect(day.slots.at(-1)!.end).toBe('2026-10-07T13:00:00.000Z');
    });

    it('выходные — нерабочие дни без слотов, будни — рабочие', async () => {
      const app = await appAt(TUESDAY_10_00_MSK);
      const { id } = await createEventType(app, 30);

      const days = await listSlots(app, id);

      const weekends = ['2026-10-10', '2026-10-11', '2026-10-17', '2026-10-18'];
      for (const day of days) {
        if (weekends.includes(day.date)) {
          expect(day).toEqual({ date: day.date, isWorkingDay: false, slots: [] });
        } else {
          expect(day.isWorkingDay).toBe(true);
          expect(day.slots.length).toBeGreaterThan(0);
        }
      }

      await app.close();
    });
  });

  describe('сетка слотов в пустой день', () => {
    it('у 30-минутного типа 35 пересекающихся слотов с 09:00 до 18:00 с шагом 15 минут', async () => {
      const day = await slotsOn(TUESDAY_10_00_MSK, 30, '2026-10-07');

      expect(day.isWorkingDay).toBe(true);
      expect(day.slots).toHaveLength(35);
      // 09:00–09:30 и 09:15–09:45 по Москве: слоты пересекаются
      expect(day.slots.slice(0, 2)).toEqual([
        { start: '2026-10-07T06:00:00.000Z', end: '2026-10-07T06:30:00.000Z', status: 'free' },
        { start: '2026-10-07T06:15:00.000Z', end: '2026-10-07T06:45:00.000Z', status: 'free' },
      ]);
      // Последний слот 17:30–18:00 заканчивается ровно в конце рабочего дня
      expect(day.slots.at(-1)).toEqual({
        start: '2026-10-07T14:30:00.000Z',
        end: '2026-10-07T15:00:00.000Z',
        status: 'free',
      });
    });

    it('у 15-минутного типа 36 слотов', async () => {
      const day = await slotsOn(TUESDAY_10_00_MSK, 15, '2026-10-07');

      expect(day.slots).toHaveLength(36);
      expect(day.slots[0].start).toBe('2026-10-07T06:00:00.000Z');
      expect(day.slots.at(-1)!.end).toBe('2026-10-07T15:00:00.000Z');
    });

    it('без броней все слоты свободны', async () => {
      const app = await appAt(TUESDAY_10_00_MSK);
      const { id } = await createEventType(app, 60);

      const days = await listSlots(app, id);

      const statuses = new Set(days.flatMap((day) => day.slots.map((slot) => slot.status)));
      expect(statuses).toEqual(new Set(['free']));

      await app.close();
    });
  });

  describe('занятость с учётом Buffer', () => {
    // Бронь 12:00–12:30 по Москве в среду 7 октября
    const BOOKING_START = '2026-10-07T09:00:00.000Z';

    // Начало слота в среду по московскому времени «ЧЧ:ММ» → момент UTC
    const wednesdayAt = (time: string) => new Date(`2026-10-07T${time}:00.000+03:00`).toISOString();

    async function bookNoon(app: App, eventTypeId: string) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/bookings',
        payload: { eventTypeId, start: BOOKING_START, guestName: 'Иван Петров', guestEmail: 'ivan@example.com' },
      });
      expect(response.statusCode).toBe(201);
    }

    // Статусы слотов среды по началу «ЧЧ:ММ» по Москве
    async function wednesdayStatuses(app: App, eventTypeId: string) {
      const day = (await listSlots(app, eventTypeId)).find((windowDay) => windowDay.date === '2026-10-07')!;
      return (time: string) => day.slots.find((slot) => slot.start === wednesdayAt(time))?.status;
    }

    it('слоты того же типа, пересекающие бронь с Buffer 15 минут, заняты; через перерыв 15 минут — свободны', async () => {
      const app = await appAt(TUESDAY_10_00_MSK);
      const { id } = await createEventType(app, 30);
      await bookNoon(app, id);

      const statusAt = await wednesdayStatuses(app, id);

      for (const time of ['11:30', '11:45', '12:00', '12:15', '12:30']) {
        expect(statusAt(time), time).toBe('taken');
      }
      // 11:15–11:45 и 12:45–13:15 отделены от брони ровно 15 минутами
      expect(statusAt('11:15')).toBe('free');
      expect(statusAt('12:45')).toBe('free');

      await app.close();
    });

    it('бронь одного типа занимает пересекающиеся слоты другого типа', async () => {
      const app = await appAt(TUESDAY_10_00_MSK);
      const short = await createEventType(app, 30);
      const long = await createEventType(app, 60);
      await bookNoon(app, short.id);

      const statusAt = await wednesdayStatuses(app, long.id);

      for (const time of ['11:00', '11:15', '11:30', '11:45', '12:00', '12:15', '12:30']) {
        expect(statusAt(time), time).toBe('taken');
      }
      expect(statusAt('10:45')).toBe('free');
      expect(statusAt('12:45')).toBe('free');

      await app.close();
    });

    it('ответ не содержит данных гостей', async () => {
      const app = await appAt(TUESDAY_10_00_MSK);
      const { id } = await createEventType(app, 30);
      await bookNoon(app, id);

      const response = await app.inject({ method: 'GET', url: `/api/event-types/${id}/slots` });

      expect(response.body).not.toContain('Иван Петров');
      expect(response.body).not.toContain('ivan@example.com');
      const fields = new Set(
        (response.json() as BookingWindowDay[]).flatMap((day) => day.slots.flatMap((slot) => Object.keys(slot))),
      );
      expect(fields).toEqual(new Set(['start', 'end', 'status']));

      await app.close();
    });
  });

  describe('MinimumNotice', () => {
    it.each([
      ['в 14:00 первый слот в 15:00', '2026-10-06T11:00:00.000Z', '2026-10-06T12:00:00.000Z'],
      ['в 14:05 первый слот в 15:15', '2026-10-06T11:05:00.000Z', '2026-10-06T12:15:00.000Z'],
    ])('%s, прошедших слотов нет', async (_title, now, firstStart) => {
      const day = await slotsOn(now, 30, '2026-10-06');

      expect(day.slots[0].start).toBe(firstStart);
      // До 17:30 с шагом 15 минут
      expect(day.slots.at(-1)!.start).toBe('2026-10-06T14:30:00.000Z');
    });

    it('рабочий день без оставшихся слотов приходит с пустым списком', async () => {
      // 17:00 по Москве: самое раннее допустимое начало — 18:00, а рабочий день уже кончился
      const day = await slotsOn('2026-10-06T14:00:00.000Z', 30, '2026-10-06');

      expect(day).toEqual({ date: '2026-10-06', isWorkingDay: true, slots: [] });
    });
  });
});
