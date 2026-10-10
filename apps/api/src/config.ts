import type { Owner } from './generated/index.ts';

// Owner — конфигурация сервера, а не сущность БД: имя и IANA-пояс
// задаются переменными окружения OWNER_NAME и OWNER_TIMEZONE.
export function readOwner(env: NodeJS.ProcessEnv = process.env): Owner {
  return {
    name: env.OWNER_NAME || 'Владелец календаря',
    timezone: env.OWNER_TIMEZONE || 'Europe/Moscow',
  };
}
