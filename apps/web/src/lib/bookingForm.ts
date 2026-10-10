import type { NewBooking } from '@/api/generated'

// Ограничения полей Booking — те же, что в контракте (модель NewBooking)
const NAME_MAX_LENGTH = 100
const EMAIL_MAX_LENGTH = 254
// Формат email контракта без допуска пробелов по краям: их обрезаем до проверки
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type BookingFormValues = {
  guestName: string
  guestEmail: string
}

export type BookingFormErrors = Partial<Record<keyof BookingFormValues, string>>

// Проверка на клиенте повторяет серверную и показывает ошибки под полями до отправки.
// Пробелы по краям не считаются: сервер их обрезает
export function validateBookingForm(values: BookingFormValues): BookingFormErrors {
  const errors: BookingFormErrors = {}

  const name = values.guestName.trim()
  if (name === '') errors.guestName = 'Укажите имя'
  else if (name.length > NAME_MAX_LENGTH) errors.guestName = `Не длиннее ${NAME_MAX_LENGTH} символов`

  const email = values.guestEmail.trim()
  if (email === '') errors.guestEmail = 'Укажите email'
  else if (email.length > EMAIL_MAX_LENGTH) errors.guestEmail = `Не длиннее ${EMAIL_MAX_LENGTH} символов`
  else if (!EMAIL_PATTERN.test(email)) errors.guestEmail = 'Неверный формат email'

  return errors
}

// Тело запроса createBooking из проверенных значений формы и выбранного Slot
export function toNewBooking(values: BookingFormValues, eventTypeId: string, start: string): NewBooking {
  return {
    eventTypeId,
    start,
    guestName: values.guestName.trim(),
    guestEmail: values.guestEmail.trim(),
  }
}
