import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ApiError, ApiErrorCode } from './generated/index.ts';

export function apiError(code: ApiErrorCode, message: string): ApiError {
  return { code, message };
}

// Отказ, который обработчик операции бросает вместо ответа: общий обработчик
// ошибок отправит его как ApiError с этим статусом. Сгенерированный тип ответа
// обработчика описывает только успешные статусы, поэтому отказы идут через throw.
export class HttpError extends Error {
  readonly statusCode: number;
  readonly code: ApiErrorCode;

  constructor(statusCode: number, code: ApiErrorCode, message: string) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

// Относится ли URL (возможно, с query-строкой) к API: /api или /api/...
export function isApiUrl(url: string): boolean {
  const pathname = url.split('?', 1)[0];
  return pathname === '/api' || pathname.startsWith('/api/');
}

// Ответ на неизвестный маршрут под /api
export function replyApiNotFound(request: FastifyRequest, reply: FastifyReply) {
  reply.code(404).send(apiError('NOT_FOUND', `Маршрут ${request.method} ${request.url} не найден`));
}

// Приводит ответы API к единой модели ApiError { code, message } из контракта.
// Регистрировать до маршрутов glue: дочерние контексты наследуют обработчики.
export async function registerApiErrors(app: FastifyInstance) {
  app.setErrorHandler((error: FastifyError | HttpError, request, reply) => {
    // Отказ из обработчика операции: код и статус задал он сам
    if (error instanceof HttpError) {
      reply.code(error.statusCode).send(apiError(error.code, error.message));
      return;
    }

    const statusCode = error.statusCode ?? 500;

    // Запрос не прошёл проверку: ошибки валидации Fastify (error.validation), битый JSON,
    // неподдерживаемый Content-Type и т. п. Статус сохраняем, текст — от Fastify.
    if (error.validation || (statusCode >= 400 && statusCode < 500)) {
      reply.code(error.validation ? 400 : statusCode).send(apiError('VALIDATION_ERROR', error.message));
      return;
    }

    // Непредвиденная ошибка: подробности только в лог, клиенту — общий текст.
    // Свой обработчик отключает логирование Fastify, поэтому пишем сами.
    request.log.error({ err: error }, 'Непредвиденная ошибка');
    reply.code(500).send(apiError('INTERNAL_ERROR', 'Внутренняя ошибка сервера'));
  });

  // Неизвестные маршруты под /api. Обработчик ограничен префиксом,
  // поэтому 404 остальных маршрутов он не затрагивает.
  await app.register(
    async (api) => {
      api.setNotFoundHandler(replyApiNotFound);
    },
    { prefix: '/api' },
  );
}
