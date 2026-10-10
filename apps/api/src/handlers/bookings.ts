import { MINUTE_MS, slotStatusAt } from '../availability.ts';
import type { BookingStore } from '../bookings.ts';
import { HttpError } from '../errors.ts';
import type { EventTypeStore } from '../eventTypes.ts';
import type { RouteHandlers } from '../generated/fastify.gen.ts';
import type { Owner } from '../generated/index.ts';
import { findEventTypeOrThrow } from './eventTypes.ts';

// createBooking — Guest бронирует Slot; правила заново проверяются на момент запроса.
// listUpcomingBookings — текущая и предстоящие Booking для Owner на момент запроса
export function bookingHandlers(
  eventTypes: EventTypeStore,
  bookings: BookingStore,
  owner: Owner,
  now: () => Date,
): Pick<RouteHandlers, 'createBooking' | 'listUpcomingBookings'> {
  return {
    createBooking(request, reply) {
      // Длины, формат email и начала уже проверены по контракту
      const guestName = request.body.guestName.trim();
      const guestEmail = request.body.guestEmail.trim();
      if (guestName === '') {
        throw new HttpError(400, 'VALIDATION_ERROR', 'Имя не может быть пустым');
      }

      const eventType = findEventTypeOrThrow(eventTypes, request.body.eventTypeId);
      const start = new Date(request.body.start);
      // Конец — начало плюс длительность, без Buffer
      const end = new Date(start.getTime() + eventType.durationMinutes * MINUTE_MS);
      const createdAt = now();

      const booking = bookings.createChecked(
        { eventType, start, end, guestName, guestEmail },
        createdAt,
        (existing) => {
          const status = slotStatusAt({
            now: createdAt,
            timeZone: owner.timezone,
            durationMinutes: eventType.durationMinutes,
            bookings: existing,
            start,
          });
          if (status === 'taken') {
            throw new HttpError(409, 'SLOT_TAKEN', 'Slot пересекается с другой Booking с учётом Buffer');
          }
          if (status === 'unavailable') {
            throw new HttpError(422, 'SLOT_UNAVAILABLE', 'На это начало нельзя создать Booking');
          }
        },
      );
      reply.code(201).send(booking);
    },

    listUpcomingBookings(_request, reply) {
      const moment = now();
      // Закончившиеся Booking отсекает запрос: остаются текущая (начало ≤ сейчас < конец)
      // и предстоящие (начало позже сейчас). Брони не пересекаются, поэтому текущая одна
      const active = bookings.listEndingAfter(moment);
      const current = active.find((booking) => Date.parse(booking.start) <= moment.getTime());
      const upcoming = active.filter((booking) => booking !== current);
      reply.code(200).send(current ? { current, upcoming } : { upcoming });
    },
  };
}
