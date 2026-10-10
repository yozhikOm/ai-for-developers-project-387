import { existsSync } from 'node:fs';
import path from 'node:path';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import fastifyOpenapiGlue from 'fastify-openapi-glue';
import { createBookingStore } from './bookings.ts';
import { readOwner } from './config.ts';
import { openDatabase } from './db.ts';
import { isApiUrl, registerApiErrors, replyApiNotFound } from './errors.ts';
import { createEventTypeStore } from './eventTypes.ts';
import type { RouteHandlers } from './generated/fastify.gen.ts';
import { bookingHandlers } from './handlers/bookings.ts';
import { eventTypeHandlers } from './handlers/eventTypes.ts';
import { healthHandlers } from './handlers/health.ts';
import { ownerHandlers } from './handlers/owner.ts';
import { slotHandlers } from './handlers/slots.ts';
import { seedEventTypes } from './seed.ts';

// Каталог собранного frontend (apps/web/dist).
// В dev-режиме его может не быть: тогда backend обслуживает только API,
// а статику отдаёт Vite dev server.
const webDistDir = path.resolve(import.meta.dirname, '../../web/dist');

// Копия OpenAPI-спеки, сгенерированная из contract/ (`npm run generate`).
// Лежит внутри apps/api, поэтому ни пакет, ни Docker-образ не читают файлов вне него.
const specificationPath = path.resolve(import.meta.dirname, './generated/source.json');

export type BuildAppOptions = {
  // Путь к файлу SQLite; по умолчанию у каждого инстанса своя БД в памяти
  databasePath?: string;
  // Засеять стартовые EventType, если БД создана только что. Включает точка входа
  seedNewDatabase?: boolean;
  // Часы приложения; тесты подставляют свои, чтобы не зависеть от реального времени
  now?: () => Date;
};

// Фабрика приложения: собирает Fastify-инстанс со всеми маршрутами.
// Отделена от index.ts, чтобы тесты могли вызывать app.inject()
// без поднятия реального HTTP-порта.
export async function buildApp({
  databasePath = ':memory:',
  seedNewDatabase = false,
  now = () => new Date(),
}: BuildAppOptions = {}) {
  // Под тестами (Vitest выставляет NODE_ENV=test) логгер отключаем,
  // чтобы не засорять вывод; в остальных режимах — JSON-логи Pino
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' });

  const { db, isNew } = openDatabase(databasePath);
  app.addHook('onClose', async () => {
    db.close();
  });

  const eventTypes = createEventTypeStore(db);
  const bookings = createBookingStore(db);
  if (seedNewDatabase && isNew) {
    seedEventTypes(eventTypes, now());
  }

  await registerApiErrors(app);

  const owner = readOwner();

  // Обработчики операций контракта; тип RouteHandlers требует реализовать каждую
  const serviceHandlers: RouteHandlers = {
    ...healthHandlers(),
    ...ownerHandlers(owner),
    ...eventTypeHandlers(eventTypes, now),
    ...slotHandlers(eventTypes, bookings, owner, now),
    ...bookingHandlers(eventTypes, bookings, owner, now),
  };

  // Маршруты и проверку запросов регистрирует glue по спеке;
  // обработчик ищется по operationId
  await app.register(fastifyOpenapiGlue, { specification: specificationPath, serviceHandlers });

  if (existsSync(webDistDir)) {
    await app.register(fastifyStatic, { root: webDistDir });

    // SPA-fallback: на неизвестные GET-маршруты (кроме /api) отдаём index.html,
    // на остальные — JSON 404. GET /api/... тоже попадают сюда: их перехватывает
    // wildcard-маршрут @fastify/static, поэтому отвечаем ApiError явно.
    app.setNotFoundHandler((request, reply) => {
      if (isApiUrl(request.url)) {
        replyApiNotFound(request, reply);
        return;
      }
      if (request.method !== 'GET') {
        reply.code(404).send({ error: 'Not Found' });
        return;
      }
      reply.sendFile('index.html');
    });
  }

  return app;
}
