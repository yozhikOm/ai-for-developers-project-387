import { bookingWindow } from '../availability.ts';
import type { BookingStore } from '../bookings.ts';
import type { EventTypeStore } from '../eventTypes.ts';
import type { RouteHandlers } from '../generated/fastify.gen.ts';
import type { Owner } from '../generated/index.ts';
import { findEventTypeOrThrow } from './eventTypes.ts';

// listSlots — всё BookingWindow со слотами EventType в поясе Owner.
// Guest видит только статусы слотов: данные Booking в ответ не попадают
export function slotHandlers(
  eventTypes: EventTypeStore,
  bookings: BookingStore,
  owner: Owner,
  now: () => Date,
): Pick<RouteHandlers, 'listSlots'> {
  return {
    listSlots(request, reply) {
      const { durationMinutes } = findEventTypeOrThrow(eventTypes, request.params.eventTypeId);
      const moment = now();
      const days = bookingWindow({
        now: moment,
        timeZone: owner.timezone,
        durationMinutes,
        bookings: bookings.intervalsEndingAfter(moment),
      });
      reply.code(200).send(days);
    },
  };
}
