import type { RouteHandlers } from '../generated/fastify.gen.ts';
import type { Owner } from '../generated/index.ts';

// getOwner — Owner не хранится в БД, а приходит из конфигурации сервера
export function ownerHandlers(owner: Owner): Pick<RouteHandlers, 'getOwner'> {
  return {
    getOwner(_request, reply) {
      reply.code(200).send(owner);
    },
  };
}
