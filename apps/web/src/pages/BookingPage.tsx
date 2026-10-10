import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  getEventType,
  getOwner,
  listSlots,
  type Booking,
  type BookingWindowDay,
  type EventType,
  type Owner,
  type Slot,
} from '@/api/generated'
import BookingCalendar from '@/components/BookingCalendar'
import BookingConfirmation, { type BookingRejection } from '@/components/BookingConfirmation'
import BookingConfirmed from '@/components/BookingConfirmed'
import BookingInfo from '@/components/BookingInfo'
import SlotList from '@/components/SlotList'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'

type PageState =
  | { status: 'loading' }
  | { status: 'ready'; owner: Owner; eventType: EventType; days: BookingWindowDay[] }
  | { status: 'not-found' }
  | { status: 'error' }

// Отказ createBooking, после которого Guest возвращается к выбору времени
type SlotRejection = Exclude<BookingRejection, 'EVENT_TYPE_NOT_FOUND'>

// Шаг сценария внутри страницы: выбор времени → подтверждение → бронь создана.
// На выбор времени можно вернуться после отказа: тогда над календарём баннер с его причиной
type BookingStep =
  | { name: 'time'; rejection?: SlotRejection }
  | { name: 'confirm' }
  | { name: 'done'; booking: Booking }

const REJECTION_BANNERS: Record<SlotRejection, string> = {
  SLOT_TAKEN: 'Пока вы заполняли форму, этот слот заняли. Выберите другое время.',
  SLOT_UNAVAILABLE: 'Это время уже недоступно для записи. Выберите другое.',
}

const STEPS = ['Тип встречи', 'Дата и время', 'Ваши данные']

// Запись на звонок для EventType (/booking/:eventTypeId): шаги «Дата и время» и «Ваши данные»,
// затем подтверждение брони. Открывается и по прямой ссылке: всё нужное загружает сам по id из URL.
// Выбранные день и слот живут здесь, поэтому «Изменить» возвращает к выбору времени с ними.
function BookingPage() {
  const { eventTypeId = '' } = useParams()
  const [state, setState] = useState<PageState>({ status: 'loading' })
  const [step, setStep] = useState<BookingStep>({ name: 'time' })
  const [selectedDate, setSelectedDate] = useState<string>()
  const [selectedSlot, setSelectedSlot] = useState<Slot>()

  // Слот выбирается внутри дня: при смене дня выбор сбрасывается
  function selectDate(date: string) {
    if (date !== selectedDate) setSelectedSlot(undefined)
    setSelectedDate(date)
  }

  // Выбранное время больше не годится: возврат к выбору времени со свежими слотами. День остаётся выбранным.
  // Занятый слот сразу помечается «Занято», не дожидаясь ответа (и если слоты не загрузятся)
  function handleRejected(rejection: BookingRejection) {
    if (rejection === 'EVENT_TYPE_NOT_FOUND') {
      setState({ status: 'not-found' })
      return
    }
    const rejectedStart = selectedSlot?.start
    setSelectedSlot(undefined)
    setStep({ name: 'time', rejection })
    if (rejection === 'SLOT_TAKEN' && rejectedStart) {
      setState((current) =>
        current.status === 'ready' ? { ...current, days: markSlotTaken(current.days, rejectedStart) } : current,
      )
    }
    listSlots({ path: { eventTypeId } }).then(({ data, error }) => {
      setState((current) => {
        // Ответ для другого EventType (Guest успел уйти по ссылке) игнорируем
        if (current.status !== 'ready' || current.eventType.id !== eventTypeId) return current
        if (error?.code === 'EVENT_TYPE_NOT_FOUND') return { status: 'not-found' }
        // Если слоты не загрузились, остаются прежние: баннер всё равно просит выбрать другое время
        return data ? { ...current, days: data } : current
      })
    })
  }

  useEffect(() => {
    // Ответ после ухода со страницы игнорируем
    let cancelled = false
    const path = { eventTypeId }
    Promise.all([getOwner(), getEventType({ path }), listSlots({ path })]).then(([owner, eventType, days]) => {
      if (cancelled) return
      if ([eventType.error, days.error].some((error) => error?.code === 'EVENT_TYPE_NOT_FOUND')) {
        setState({ status: 'not-found' })
        return
      }
      setState(
        owner.data && eventType.data && days.data
          ? { status: 'ready', owner: owner.data, eventType: eventType.data, days: days.data }
          : { status: 'error' },
      )
    })
    return () => {
      cancelled = true
    }
  }, [eventTypeId])

  return (
    <div className="min-h-screen bg-muted/40">
      <main className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-8">
        <h1 className="font-heading text-2xl font-semibold">Запись на звонок</h1>
        {state.status === 'loading' && (
          <p role="status" className="text-muted-foreground">Загрузка…</p>
        )}
        {state.status === 'error' && (
          <p role="alert" className="text-destructive">
            Не удалось загрузить страницу. Попробуйте обновить её.
          </p>
        )}
        {state.status === 'not-found' && <EventTypeNotFound />}
        {state.status === 'ready' && step.name === 'confirm' && selectedDate && selectedSlot && (
          <>
            <Steps current={3} />
            <BookingConfirmation
              eventType={state.eventType}
              date={selectedDate}
              slot={selectedSlot}
              timeZone={state.owner.timezone}
              onEdit={() => setStep({ name: 'time' })}
              onBooked={(booking) => setStep({ name: 'done', booking })}
              onRejected={handleRejected}
            />
          </>
        )}
        {state.status === 'ready' && step.name === 'done' && selectedDate && (
          <BookingConfirmed booking={step.booking} date={selectedDate} timeZone={state.owner.timezone} />
        )}
        {state.status === 'ready' && step.name === 'time' && (
          <>
            <Steps current={2} />
            {step.rejection && (
              <p
                role="alert"
                className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
              >
                {REJECTION_BANNERS[step.rejection]}
              </p>
            )}
            <div className="grid items-start gap-4 md:grid-cols-[1fr_1.4fr_1fr]">
              <BookingInfo
                owner={state.owner}
                eventType={state.eventType}
                selectedDate={selectedDate}
                selectedSlot={selectedSlot}
              />
              <BookingCalendar
                days={state.days}
                timeZone={state.owner.timezone}
                selectedDate={selectedDate}
                onSelectDate={selectDate}
              />
              <SlotList
                day={state.days.find((day) => day.date === selectedDate)}
                timeZone={state.owner.timezone}
                selectedStart={selectedSlot?.start}
                onSelectSlot={setSelectedSlot}
              />
            </div>
            <div className="flex justify-end">
              <Button size="lg" disabled={!selectedSlot} onClick={() => setStep({ name: 'confirm' })}>
                Продолжить
              </Button>
            </div>
          </>
        )}
      </main>
    </div>
  )
}

// Дни с Slot, начинающимся в start, помеченным «Занято»
function markSlotTaken(days: BookingWindowDay[], start: string): BookingWindowDay[] {
  return days.map((day) => ({
    ...day,
    slots: day.slots.map((slot) => (slot.start === start ? { ...slot, status: 'taken' } : slot)),
  }))
}

// Индикатор шагов «Тип встречи → Дата и время → Ваши данные»; current — номер с 1
function Steps({ current }: { current: number }) {
  return (
    <ol aria-label="Шаги записи" className="flex flex-wrap gap-4 text-sm">
      {STEPS.map((step, index) => {
        const isCurrent = index + 1 === current
        return (
          <li
            key={step}
            aria-current={isCurrent ? 'step' : undefined}
            className={isCurrent ? 'font-semibold text-primary' : 'text-muted-foreground'}
          >
            {index + 1}. {step}
          </li>
        )
      })}
    </ol>
  )
}

// EventType из ссылки не существует: возврат к списку типов
function EventTypeNotFound() {
  return (
    <Card className="w-full max-w-md self-center text-center">
      <CardHeader>
        <h2 className="font-heading text-xl font-semibold">Тип больше недоступен</h2>
        <CardDescription>Выберите другой формат звонка из списка</CardDescription>
      </CardHeader>
      <CardContent>
        <Link to="/" className={buttonVariants()}>
          К списку типов
        </Link>
      </CardContent>
    </Card>
  )
}

export default BookingPage
