import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

// Схема БД — миграции в коде (ADR 0005). Номер применённой миграции хранится
// в PRAGMA user_version: миграция с индексом i переводит БД в версию i + 1.
// Миграции только дописываются в конец; уже выпущенные не меняются.
const migrations: string[] = [
  // 1: EventType. id — UUID, created_at — мс UTC
  `CREATE TABLE event_types (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    duration_minutes INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  // 2: Booking. end_at — снимок «начало + длительность» без Buffer; моменты — мс UTC
  `CREATE TABLE bookings (
    id TEXT PRIMARY KEY,
    event_type_id TEXT NOT NULL REFERENCES event_types(id),
    start_at INTEGER NOT NULL,
    end_at INTEGER NOT NULL,
    guest_name TEXT NOT NULL,
    guest_email TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`,
];

export type OpenedDatabase = {
  db: DatabaseSync;
  // БД создана только что: до открытия в ней не было применённых миграций
  isNew: boolean;
};

// Открывает БД (':memory:' или путь к файлу) и применяет недостающие миграции
export function openDatabase(databasePath: string): OpenedDatabase {
  if (databasePath !== ':memory:') {
    mkdirSync(path.dirname(databasePath), { recursive: true });
  }

  const db = new DatabaseSync(databasePath);
  try {
    db.exec('PRAGMA foreign_keys = ON');
    const version = migrate(db);
    return { db, isNew: version === 0 };
  } catch (error) {
    db.close();
    throw error;
  }
}

// Применяет недостающие миграции, каждую в своей транзакции.
// Возвращает версию схемы до применения.
function migrate(db: DatabaseSync): number {
  const { user_version: version } = db.prepare('PRAGMA user_version').get() as { user_version: number };

  for (let index = version; index < migrations.length; index += 1) {
    db.exec('BEGIN');
    try {
      db.exec(migrations[index]);
      // PRAGMA не принимает параметры; значение — целое из счётчика цикла
      db.exec(`PRAGMA user_version = ${index + 1}`);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  return version;
}
