import type { EventTypeStore } from './eventTypes.ts';

// Стартовые EventType новой БД: чтобы сервисом можно было сразу пользоваться.
// Удобство разработки, а не требование (история 66 спеки).
export function seedEventTypes(eventTypes: EventTypeStore, now: Date) {
  eventTypes.create(
    { name: 'Звонок 15 минут', description: 'Короткий звонок, чтобы познакомиться и обсудить задачу', durationMinutes: 15 },
    now,
  );
  eventTypes.create(
    { name: 'Встреча 30 минут', description: 'Подробный разбор вопроса с рекомендациями', durationMinutes: 30 },
    now,
  );
}
