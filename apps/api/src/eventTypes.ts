import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { EventType } from './generated/index.ts';

export type NewEventType = {
  name: string;
  description?: string;
  durationMinutes: number;
};

type EventTypeRow = {
  id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  created_at: number;
};

export type EventTypeStore = ReturnType<typeof createEventTypeStore>;

// Хранилище EventType: строки БД ↔ модель контракта
export function createEventTypeStore(db: DatabaseSync) {
  // rowid разводит типы, созданные в одну миллисекунду, в порядке вставки
  const selectAll = db.prepare(
    'SELECT id, name, description, duration_minutes, created_at FROM event_types ORDER BY created_at, rowid',
  );
  const selectById = db.prepare(
    'SELECT id, name, description, duration_minutes, created_at FROM event_types WHERE id = ?',
  );
  const insert = db.prepare(
    'INSERT INTO event_types (id, name, description, duration_minutes, created_at) VALUES (?, ?, ?, ?, ?)',
  );

  return {
    // Все EventType по возрастанию времени создания
    list(): EventType[] {
      return (selectAll.all() as EventTypeRow[]).map(toEventType);
    },

    // EventType по id; undefined, если такого нет
    get(id: string): EventType | undefined {
      const row = selectById.get(id) as EventTypeRow | undefined;
      return row && toEventType(row);
    },

    create(input: NewEventType, createdAt: Date): EventType {
      const row: EventTypeRow = {
        id: randomUUID(),
        name: input.name,
        description: input.description ?? null,
        duration_minutes: input.durationMinutes,
        created_at: createdAt.getTime(),
      };
      insert.run(row.id, row.name, row.description, row.duration_minutes, row.created_at);
      return toEventType(row);
    },
  };
}

function toEventType(row: EventTypeRow): EventType {
  return {
    id: row.id,
    name: row.name,
    // Без описания поля в ответе нет вовсе
    ...(row.description !== null && { description: row.description }),
    durationMinutes: row.duration_minutes,
    createdAt: new Date(row.created_at).toISOString(),
  };
}
