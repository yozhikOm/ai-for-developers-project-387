import { GRID_STEP_MINUTES } from '../availability.ts';
import { HttpError } from '../errors.ts';
import type { EventTypeStore } from '../eventTypes.ts';
import type { RouteHandlers } from '../generated/fastify.gen.ts';
import type { EventType } from '../generated/index.ts';

// EventType по id из пути запроса или отказ 404 EVENT_TYPE_NOT_FOUND
export function findEventTypeOrThrow(eventTypes: EventTypeStore, eventTypeId: string): EventType {
  const eventType = eventTypes.get(eventTypeId);
  if (!eventType) {
    throw new HttpError(404, 'EVENT_TYPE_NOT_FOUND', `EventType ${eventTypeId} не найден`);
  }
  return eventType;
}

// listEventTypes — опубликованные EventType для публичной страницы;
// getEventType — один тип для прямой ссылки на выбор времени;
// createEventType — Owner создаёт новый тип
export function eventTypeHandlers(
  eventTypes: EventTypeStore,
  now: () => Date,
): Pick<RouteHandlers, 'listEventTypes' | 'getEventType' | 'createEventType'> {
  return {
    listEventTypes(_request, reply) {
      reply.code(200).send(eventTypes.list());
    },

    getEventType(request, reply) {
      reply.code(200).send(findEventTypeOrThrow(eventTypes, request.params.eventTypeId));
    },

    createEventType(request, reply) {
      // Длины, диапазон и типы полей уже проверены по контракту
      const { durationMinutes } = request.body;
      const name = request.body.name.trim();
      const description = request.body.description?.trim();

      if (name === '') {
        throw new HttpError(400, 'VALIDATION_ERROR', 'Название не может быть пустым');
      }
      // Длительность кратна шагу сетки слотов: контракт кратность выразить не может
      if (durationMinutes % GRID_STEP_MINUTES !== 0) {
        throw new HttpError(
          400,
          'VALIDATION_ERROR',
          `Длительность должна быть кратна ${GRID_STEP_MINUTES} минутам`,
        );
      }

      // Пустое после обрезки описание — «нет описания»
      const eventType = eventTypes.create(
        { name, ...(description && { description }), durationMinutes },
        now(),
      );
      reply.code(201).send(eventType);
    },
  };
}
