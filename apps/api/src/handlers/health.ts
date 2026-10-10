import type { RouteHandlers } from '../generated/fastify.gen.ts';

// getHealth — проверка живости: используется smoke-тестом и Docker HEALTHCHECK
export function healthHandlers(): Pick<RouteHandlers, 'getHealth'> {
  return {
    getHealth(_request, reply) {
      reply.code(200).send({ status: 'ok' });
    },
  };
}
