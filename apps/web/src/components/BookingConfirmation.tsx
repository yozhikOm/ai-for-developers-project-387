import { useId, useState, type FormEvent } from 'react'
import { createBooking, type ApiErrorCode, type Booking, type EventType, type Slot } from '@/api/generated'
import FormField from '@/components/FormField'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { toNewBooking, validateBookingForm, type BookingFormValues } from '@/lib/bookingForm'
import { formatDayLabel, formatTimeRange } from '@/lib/ownerCalendar'

// Отказы, после которых выбранное время или EventType больше не годятся: их разбирает BookingPage.
// Остальные (VALIDATION_ERROR, INTERNAL_ERROR, сбой сети) — общее сообщение формы
const REJECTIONS = ['SLOT_TAKEN', 'SLOT_UNAVAILABLE', 'EVENT_TYPE_NOT_FOUND'] as const satisfies ApiErrorCode[]

export type BookingRejection = (typeof REJECTIONS)[number]

function isRejection(code: ApiErrorCode | undefined): code is BookingRejection {
  return REJECTIONS.some((rejection) => rejection === code)
}

type BookingConfirmationProps = {
  eventType: EventType
  // Календарная дата выбранного Slot по поясу Owner
  date: string
  slot: Slot
  // IANA-пояс Owner: интервал показывается в нём
  timeZone: string
  onEdit: () => void
  onBooked: (booking: Booking) => void
  onRejected: (rejection: BookingRejection) => void
}

// Шаг «Ваши данные»: сводка выбора, имя и email Guest, «Подтвердить запись» и «Изменить»
function BookingConfirmation({
  eventType,
  date,
  slot,
  timeZone,
  onEdit,
  onBooked,
  onRejected,
}: BookingConfirmationProps) {
  const headingId = useId()
  const [values, setValues] = useState<BookingFormValues>({ guestName: '', guestEmail: '' })
  // Ошибки под полями показываем после первой попытки отправить форму
  // и дальше пересчитываем на каждый ввод
  const [attempted, setAttempted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [failed, setFailed] = useState(false)
  const errors = attempted ? validateBookingForm(values) : {}

  const setField = (field: keyof BookingFormValues) => (value: string) =>
    setValues((current) => ({ ...current, [field]: value }))

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setAttempted(true)
    if (Object.keys(validateBookingForm(values)).length > 0) return

    setSubmitting(true)
    setFailed(false)
    const { data, error } = await createBooking({ body: toNewBooking(values, eventType.id, slot.start) }).catch(
      () => ({ data: undefined, error: undefined }),
    )
    if (data) {
      onBooked(data)
      return
    }
    const code = error?.code
    if (isRejection(code)) {
      onRejected(code)
      return
    }
    setSubmitting(false)
    setFailed(true)
  }

  return (
    <Card role="region" aria-labelledby={headingId} className="w-full max-w-md self-center">
      <CardHeader>
        <h2 id={headingId} className="font-heading text-xl leading-snug font-semibold">
          Подтверждение записи
        </h2>
        <CardDescription>
          {eventType.name} · {formatDayLabel(date)}, {formatTimeRange(slot.start, slot.end, timeZone)}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* noValidate: вместо всплывающих подсказок браузера — свои ошибки под полями */}
        <form noValidate onSubmit={submit} className="flex flex-col gap-4">
          <FormField id="booking-guest-name" label="Имя" error={errors.guestName}>
            {(fieldProps) => (
              <Input
                {...fieldProps}
                autoComplete="name"
                value={values.guestName}
                onChange={(e) => setField('guestName')(e.target.value)}
              />
            )}
          </FormField>
          <FormField id="booking-guest-email" label="Email" error={errors.guestEmail}>
            {(fieldProps) => (
              <Input
                {...fieldProps}
                type="email"
                autoComplete="email"
                value={values.guestEmail}
                onChange={(e) => setField('guestEmail')(e.target.value)}
              />
            )}
          </FormField>

          {failed && (
            <p role="alert" className="text-sm text-destructive">
              Не удалось создать бронь. Попробуйте ещё раз.
            </p>
          )}

          <div className="flex gap-2">
            <Button type="submit" disabled={submitting}>
              Подтвердить запись
            </Button>
            <Button type="button" variant="outline" onClick={onEdit}>
              Изменить
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

export default BookingConfirmation
