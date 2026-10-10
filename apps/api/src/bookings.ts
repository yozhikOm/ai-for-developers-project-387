import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { BookedInterval } from './availability.ts';
import type { Booking, EventType } from './generated/index.ts';

export type BookingInput = {
  eventType: Pick<EventType, 'id' | 'name'>;
  start: Date;
  end: Date;
  guestName: string;
  guestEmail: string;
};

type IntervalRow = { start_at: number; end_at: number };

type BookingRow = IntervalRow & {
  id: string;
  guest_name: string;
  guest_email: string;
  created_at: number;
  event_type_id: string;
  event_type_name: string;
};

// Строка Booking вместе с названием EventType → модель контракта
function toBooking(row: BookingRow): Booking {
  return {
    id: row.id,
    start: new Date(row.start_at).toISOString(),
    end: new Date(row.end_at).toISOString(),
    guestName: row.guest_name,
    guestEmail: row.guest_email,
    createdAt: new Date(row.created_at).toISOString(),
    eventType: { id: row.event_type_id, name: row.event_type_name },
  };
}

export type BookingStore = ReturnType<typeof createBookingStore>;

// Хранилище Booking: строки БД ↔ модель контракта
export function createBookingStore(db: DatabaseSync) {
  const selectIntervalsEndingAfter = db.prepare('SELECT start_at, end_at FROM bookings WHERE end_at > ?');
  const selectBookingsEndingAfter = db.prepare(
    `SELECT b.id, b.start_at, b.end_at, b.guest_name, b.guest_email, b.created_at,
            b.event_type_id, e.name AS event_type_name
     FROM bookings b JOIN event_types e ON e.id = b.event_type_id
     WHERE b.end_at > ?
     ORDER BY b.start_at`,
  );
  const insert = db.prepare(
    `INSERT INTO bookings (id, event_type_id, start_at, end_at, guest_name, guest_email, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );

  function intervalsEndingAfter(moment: Date): BookedInterval[] {
    return (selectIntervalsEndingAfter.all(moment.getTime()) as IntervalRow[]).map((row) => ({
      start: row.start_at,
      end: row.end_at,
    }));
  }

  return {
    // Интервалы Booking, которые заканчиваются позже moment: прошедшие на слоты уже не влияют
    intervalsEndingAfter,

    // Booking со сводкой EventType, которые заканчиваются позже moment, по возрастанию начала
    listEndingAfter(moment: Date): Booking[] {
      return (selectBookingsEndingAfter.all(moment.getTime()) as BookingRow[]).map(toBooking);
    },

    // Создаёт Booking, если assertAllowed не отказал по интервалам существующих Booking.
    // Проверка и INSERT — в BEGIN IMMEDIATE … COMMIT одним синхронным участком без await (ADR 0005):
    // между чтением броней и вставкой никто не создаст пересекающуюся Booking
    createChecked(
      input: BookingInput,
      createdAt: Date,
      assertAllowed: (existing: BookedInterval[]) => void,
    ): Booking {
      db.exec('BEGIN IMMEDIATE');
      try {
        assertAllowed(intervalsEndingAfter(createdAt));
        const row: BookingRow = {
          id: randomUUID(),
          start_at: input.start.getTime(),
          end_at: input.end.getTime(),
          guest_name: input.guestName,
          guest_email: input.guestEmail,
          created_at: createdAt.getTime(),
          event_type_id: input.eventType.id,
          event_type_name: input.eventType.name,
        };
        insert.run(
          row.id,
          row.event_type_id,
          row.start_at,
          row.end_at,
          row.guest_name,
          row.guest_email,
          row.created_at,
        );
        db.exec('COMMIT');
        return toBooking(row);
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
  };
}
