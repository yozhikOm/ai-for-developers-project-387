// API-контракт «Календаря звонков» — единый источник правды (ADR 0003).
// Изменение API начинается здесь; затем `npm run generate` пересобирает
// OpenAPI, SDK для apps/web и серверные артефакты для apps/api (ADR 0004).
//
// Правила:
// - у каждой операции явный @operationId в camelCase вида <глагол><Сущность>:
//   по нему fastify-openapi-glue находит обработчик, а Hey API называет функцию SDK;
// - все 4xx/5xx отвечают моделью ApiError.
import "@typespec/http";
import "@typespec/openapi";

using Http;
using OpenAPI;

@service(#{ title: "Календарь звонков" })
@route("/api")
namespace CallCalendar;

/** Машиночитаемая причина ошибки: клиент различает отказы по ней, а не по тексту. */
union ApiErrorCode {
  /** Тело или параметры запроса не прошли проверку. */
  "VALIDATION_ERROR",

  /** Неизвестный маршрут под /api. */
  "NOT_FOUND",

  /** EventType с таким id не существует. */
  "EVENT_TYPE_NOT_FOUND",

  /** Начало Booking пересекается с другой Booking с учётом Buffer. */
  "SLOT_TAKEN",

  /** Начало Booking не на сетке, вне BookingWindow или WorkingHours, в выходной или внутри MinimumNotice. */
  "SLOT_UNAVAILABLE",

  /** Непредвиденная ошибка сервера. */
  "INTERNAL_ERROR",
}

/** Единая модель ошибки API. */
@error
model ApiError {
  code: ApiErrorCode;

  /** Описание для разработчика; пользователю UI показывает свой текст по `code`. */
  message: string;
}

/** Ответ проверки живости. */
model Health {
  status: "ok";
}

/** Owner — владелец календаря; задаётся конфигурацией сервера. */
model Owner {
  /** Имя, которое видит Guest на публичной странице. */
  name: string;

  /** IANA-пояс Owner (например, `Europe/Moscow`): в нём считается и показывается время. */
  timezone: string;
}

/** EventType — вид звонка, который публикует Owner; Guest бронирует время в его рамках. */
model EventType {
  /** Системный id (UUID): его назначает сервер. */
  @format("uuid")
  id: string;

  /** Название; не уникально. */
  name: string;

  /** Необязательное описание; без описания поле отсутствует. */
  description?: string;

  /** Длительность звонка в минутах. */
  durationMinutes: int32;

  /** Момент создания: по нему упорядочен список типов. */
  createdAt: utcDateTime;
}

/** Данные нового EventType; id и момент создания назначает сервер. */
model NewEventType {
  /** Название; не уникально. Сервер обрезает пробелы по краям, название из одних пробелов — пустое. */
  @minLength(1)
  @maxLength(100)
  name: string;

  /** Необязательное описание; пустое после обрезки пробелов означает «нет описания». */
  @maxLength(500)
  description?: string;

  /** Длительность звонка в минутах, кратная 15: кратность контракт выразить не может, её проверяет сервер. */
  @minValue(15)
  @maxValue(540)
  durationMinutes: int32;
}

/** Статус Slot: «свободен» или «занят» пересечением с Booking с учётом Buffer. */
union SlotStatus {
  "free",
  "taken",
}

/** Slot — интервал `[начало, конец)` длиной в длительность EventType; вычисляется, не хранится. */
model Slot {
  /** Начало (UTC). */
  start: utcDateTime;

  /** Конец (UTC): начало плюс длительность EventType. */
  end: utcDateTime;

  status: SlotStatus;
}

/** День BookingWindow со слотами выбранного EventType. */
model BookingWindowDay {
  /** Календарная дата по поясу Owner. */
  date: plainDate;

  /** Рабочий ли день; у нерабочего (выходного) слотов нет. */
  isWorkingDay: boolean;

  /**
   * Слоты дня по возрастанию начала. Прошедших и попавших в MinimumNotice нет вовсе,
   * поэтому у рабочего дня список может быть пустым.
   */
  slots: Slot[];
}

/** Сводка EventType внутри Booking. */
model EventTypeSummary {
  @format("uuid")
  id: string;

  name: string;
}

/** Booking — бронь Guest на интервал `[начало, конец)`. */
model Booking {
  /** Системный id (UUID): его назначает сервер. */
  @format("uuid")
  id: string;

  /** Начало (UTC). */
  start: utcDateTime;

  /** Конец (UTC): начало плюс длительность EventType, без Buffer. */
  end: utcDateTime;

  /** Имя Guest. */
  guestName: string;

  /** Email Guest; регистр не меняется. */
  guestEmail: string;

  /** Момент создания. */
  createdAt: utcDateTime;

  eventType: EventTypeSummary;
}

/**
 * Предстоящие Booking всех EventType для Owner. «Текущая» и «предстоящая» — производные
 * состояния: сервер вычисляет их на момент запроса, закончившиеся Booking не попадают никуда.
 */
model UpcomingBookings {
  /** Идущая сейчас Booking (начало ≤ сейчас < конец); если такой нет, поле отсутствует. */
  current?: Booking;

  /** Booking с началом позже текущего момента, по возрастанию начала. */
  upcoming: Booking[];
}

/** Данные новой Booking; конец, id и момент создания назначает сервер. */
model NewBooking {
  /** EventType, в рамках которого Guest бронирует время. */
  eventTypeId: string;

  /** Начало выбранного Slot (UTC); сервер заново проверяет все правила на момент запроса. */
  start: utcDateTime;

  /** Имя Guest. Сервер обрезает пробелы по краям, имя из одних пробелов — пустое. */
  @minLength(1)
  @maxLength(100)
  guestName: string;

  /** Email Guest. Пробелы по краям допустимы: сервер их обрезает. */
  @maxLength(254)
  @pattern("^\\s*[^\\s@]+@[^\\s@]+\\.[^\\s@]+\\s*$")
  guestEmail: string;
}

/** Проверка живости: используется smoke-тестом и Docker HEALTHCHECK. */
@route("/health")
@get
@operationId("getHealth")
op getHealth(): Health | ApiError;

/** Имя и часовой пояс Owner. */
@route("/owner")
@get
@operationId("getOwner")
op getOwner(): Owner | ApiError;

/** Все EventType по возрастанию времени создания. */
@route("/event-types")
@get
@operationId("listEventTypes")
op listEventTypes(): EventType[] | ApiError;

/** Создаёт EventType и возвращает его с назначенным id (нужен для подсветки в списке Owner). */
@route("/event-types")
@post
@operationId("createEventType")
op createEventType(@body body: NewEventType): {
  @statusCode statusCode: 201;
  @body body: EventType;
} | ApiError;

/** Один EventType: для прямой ссылки на выбор времени и перезагрузки страницы. */
@route("/event-types/{eventTypeId}")
@get
@operationId("getEventType")
op getEventType(@path eventTypeId: string): EventType | ApiError;

/**
 * Всё BookingWindow одним ответом: 14 дней начиная с сегодняшнего по поясу Owner
 * со слотами EventType. Окно, «сегодня», выходные и MinimumNotice определяет сервер.
 */
@route("/event-types/{eventTypeId}/slots")
@get
@operationId("listSlots")
op listSlots(@path eventTypeId: string): BookingWindowDay[] | ApiError;

/**
 * Создаёт Booking на свободный Slot. Конец вычисляет сервер; занятый Slot отклоняется
 * с `SLOT_TAKEN` (409), недоступное начало — с `SLOT_UNAVAILABLE` (422).
 */
@route("/bookings")
@post
@operationId("createBooking")
op createBooking(@body body: NewBooking): {
  @statusCode statusCode: 201;
  @body body: Booking;
} | ApiError;

/** Текущая и предстоящие Booking для раздела Owner; пагинации нет. */
@route("/bookings/upcoming")
@get
@operationId("listUpcomingBookings")
op listUpcomingBookings(): UpcomingBookings | ApiError;
