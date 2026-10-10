import type { BookingWindowDay, Slot, SlotStatus } from './generated/index.ts';

// Модуль доступности: правила вычисления слотов (спека, GLOSSARY.md).
// Все расчёты — в поясе Owner, интервалы полуоткрытые [начало, конец).

// BookingWindow — сегодня и ещё 13 календарных дней
const WINDOW_DAYS = 14;
// WorkingHours — Пн–Пт 09:00–18:00
const WORKDAY_START_MINUTES = 9 * 60;
const WORKDAY_END_MINUTES = 18 * 60;
// Шаг сетки начал слотов для всех EventType; длительность EventType ему кратна
export const GRID_STEP_MINUTES = 15;
// MinimumNotice — слот доступен, только если начало ≥ сейчас + 60 минут
const MINIMUM_NOTICE_MINUTES = 60;
// Buffer — минимальный перерыв между Booking; к краям WorkingHours не применяется
const BUFFER_MINUTES = 15;

export const MINUTE_MS = 60_000;

// Интервал существующей Booking [начало, конец), мс UTC, без Buffer
export type BookedInterval = { start: number; end: number };

export type BookingWindowInput = {
  now: Date;
  // IANA-пояс Owner
  timeZone: string;
  durationMinutes: number;
  // Booking всех EventType: занятость общая для всех типов
  bookings: BookedInterval[];
};

// Дни BookingWindow со слотами EventType и их статусами.
// Slot занят, если пересекается с какой-либо Booking, расширенной на Buffer с каждой стороны.
// Слоты всегда лежат внутри WorkingHours, поэтому Buffer за края рабочего дня не выходит сам собой
export function bookingWindow({ now, timeZone, durationMinutes, bookings }: BookingWindowInput): BookingWindowDay[] {
  const today = zonedDate(now, timeZone);
  const earliestStart = now.getTime() + MINIMUM_NOTICE_MINUTES * MINUTE_MS;
  const buffer = BUFFER_MINUTES * MINUTE_MS;
  const isTaken = (start: number, end: number) =>
    bookings.some((booking) => start < booking.end + buffer && booking.start - buffer < end);

  return Array.from({ length: WINDOW_DAYS }, (_, offset) => {
    const date = addDays(today, offset);
    if (!isWorkingDay(date)) {
      return { date: formatPlainDate(date), isWorkingDay: false, slots: [] };
    }

    const slots: Slot[] = [];
    for (
      let startMinutes = WORKDAY_START_MINUTES;
      startMinutes + durationMinutes <= WORKDAY_END_MINUTES;
      startMinutes += GRID_STEP_MINUTES
    ) {
      const start = zonedTimeToUtc(date, startMinutes, timeZone);
      const end = zonedTimeToUtc(date, startMinutes + durationMinutes, timeZone);
      // Прошедшие слоты и слоты внутри MinimumNotice не возвращаются вовсе
      if (start < earliestStart) continue;
      slots.push({
        start: new Date(start).toISOString(),
        end: new Date(end).toISOString(),
        status: isTaken(start, end) ? 'taken' : 'free',
      });
    }
    return { date: formatPlainDate(date), isWorkingDay: true, slots };
  });
}

// Можно ли создать Booking с таким началом: статус Slot с этим началом или 'unavailable',
// если такого Slot нет (не на сетке, вне BookingWindow или WorkingHours, выходной, MinimumNotice).
// Правила те же, что у списка слотов: ответ берётся из него, второй реализации нет
export function slotStatusAt(input: BookingWindowInput & { start: Date }): SlotStatus | 'unavailable' {
  const start = input.start.getTime();
  for (const day of bookingWindow(input)) {
    const slot = day.slots.find((candidate) => Date.parse(candidate.start) === start);
    if (slot) return slot.status;
  }
  return 'unavailable';
}

// Календарная дата без времени и пояса
type PlainDate = { year: number; month: number; day: number };

function addDays(date: PlainDate, days: number): PlainDate {
  const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() };
}

function isWorkingDay(date: PlainDate): boolean {
  const weekday = new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
  return weekday !== 0 && weekday !== 6;
}

function formatPlainDate({ year, month, day }: PlainDate): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// Части момента по стенным часам пояса
function zonedParts(instant: number, timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
    })
      .formatToParts(instant)
      .map((part) => [part.type, Number(part.value)]),
  );
  return parts as Record<'year' | 'month' | 'day' | 'hour' | 'minute', number>;
}

// Календарная дата момента по поясу
function zonedDate(instant: Date, timeZone: string): PlainDate {
  const { year, month, day } = zonedParts(instant.getTime(), timeZone);
  return { year, month, day };
}

// Смещение пояса относительно UTC в момент instant, мс
function offsetAt(instant: number, timeZone: string): number {
  const { year, month, day, hour, minute } = zonedParts(instant, timeZone);
  return Date.UTC(year, month - 1, day, hour, minute) - Math.floor(instant / MINUTE_MS) * MINUTE_MS;
}

// Момент UTC для стенного времени (минуты от полуночи) даты в поясе.
// Смещение берём в момент первой оценки и уточняем: так учитывается смена смещения (летнее время)
function zonedTimeToUtc(date: PlainDate, minutes: number, timeZone: string): number {
  const wallClock = Date.UTC(date.year, date.month - 1, date.day, 0, minutes);
  const guess = wallClock - offsetAt(wallClock, timeZone);
  return wallClock - offsetAt(guess, timeZone);
}
