import type { NewEventType } from '@/api/generated'

// Ограничения полей EventType — те же, что в контракте (модель NewEventType),
// плюс кратность 15, которую контракт выразить не может
const NAME_MAX_LENGTH = 100
const DESCRIPTION_MAX_LENGTH = 500
export const DURATION_MIN = 15
export const DURATION_MAX = 540
export const DURATION_STEP = 15

// Значения формы как их ввёл Owner: длительность — строка из поля ввода
export type EventTypeFormValues = {
  name: string
  description: string
  durationMinutes: string
}

export type EventTypeFormErrors = Partial<Record<keyof EventTypeFormValues, string>>

// Проверка на клиенте повторяет серверную и показывает ошибки под полями до отправки.
// Пробелы по краям не считаются: сервер их обрезает
export function validateEventTypeForm(values: EventTypeFormValues): EventTypeFormErrors {
  const errors: EventTypeFormErrors = {}

  const name = values.name.trim()
  if (name === '') errors.name = 'Укажите название'
  else if (name.length > NAME_MAX_LENGTH) errors.name = `Не длиннее ${NAME_MAX_LENGTH} символов`

  if (values.description.trim().length > DESCRIPTION_MAX_LENGTH) {
    errors.description = `Не длиннее ${DESCRIPTION_MAX_LENGTH} символов`
  }

  const duration = values.durationMinutes.trim()
  const minutes = Number(duration)
  if (duration === '') errors.durationMinutes = 'Укажите длительность'
  else if (
    !/^\d+$/.test(duration) ||
    minutes < DURATION_MIN ||
    minutes > DURATION_MAX ||
    minutes % DURATION_STEP !== 0
  ) {
    errors.durationMinutes = `От ${DURATION_MIN} до ${DURATION_MAX} минут, кратно ${DURATION_STEP}`
  }

  return errors
}

// Тело запроса createEventType из проверенных значений формы.
// Пустое после обрезки описание не отправляем: это «нет описания»
export function toNewEventType(values: EventTypeFormValues): NewEventType {
  const description = values.description.trim()
  return {
    name: values.name.trim(),
    ...(description && { description }),
    durationMinutes: Number(values.durationMinutes),
  }
}
