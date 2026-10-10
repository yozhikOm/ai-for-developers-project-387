import { useEffect, useId, useState } from 'react'
import {
  getOwner,
  listEventTypes,
  listUpcomingBookings,
  type Booking,
  type Owner,
  type UpcomingBookings,
} from '@/api/generated'
import OwnerLayout from '@/components/OwnerLayout'
import OwnerTabs from '@/components/OwnerTabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatMomentDateTime, formatMomentDay, formatTimeRange } from '@/lib/ownerCalendar'

type PageState =
  | { status: 'loading' }
  | { status: 'ready'; owner: Owner; bookings: UpcomingBookings }
  | { status: 'error' }

// Раздел Owner, вкладка «Предстоящие»: идущая сейчас Booking и предстоящие всех EventType.
// Какая бронь текущая, а какая предстоящая, решает сервер по своим часам; время — в поясе Owner
function OwnerUpcomingPage() {
  const [state, setState] = useState<PageState>({ status: 'loading' })
  // Число EventType нужно только для счётчика соседней вкладки: без него страница работает
  const [eventTypesCount, setEventTypesCount] = useState<number>()

  useEffect(() => {
    // Ответ после ухода со страницы игнорируем
    let cancelled = false
    Promise.all([getOwner(), listUpcomingBookings()]).then(([owner, bookings]) => {
      if (cancelled) return
      setState(
        owner.data && bookings.data
          ? { status: 'ready', owner: owner.data, bookings: bookings.data }
          : { status: 'error' },
      )
    })
    listEventTypes().then(({ data }) => {
      if (!cancelled && data) setEventTypesCount(data.length)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <OwnerLayout>
      <div className="flex flex-col gap-4">
        <h1 className="font-heading text-2xl font-semibold">Кабинет владельца</h1>
        <OwnerTabs
          upcomingCount={state.status === 'ready' ? state.bookings.upcoming.length : undefined}
          eventTypesCount={eventTypesCount}
        />

        {state.status === 'loading' && (
          <p role="status" className="text-muted-foreground">Загрузка…</p>
        )}
        {state.status === 'error' && (
          <p role="alert" className="text-destructive">
            Не удалось загрузить предстоящие встречи. Попробуйте обновить страницу.
          </p>
        )}
        {state.status === 'ready' && (
          <>
            {state.bookings.current && (
              <CurrentBookingCard booking={state.bookings.current} timeZone={state.owner.timezone} />
            )}
            <UpcomingList bookings={state.bookings.upcoming} timeZone={state.owner.timezone} />
          </>
        )}
      </div>
    </OwnerLayout>
  )
}

// Карточка «● Сейчас идёт» с акцентной полосой; без идущего звонка её нет вовсе
function CurrentBookingCard({ booking, timeZone }: { booking: Booking; timeZone: string }) {
  const labelId = useId()
  return (
    <Card role="region" aria-labelledby={labelId} className="border-l-4 border-l-primary">
      <CardHeader>
        <p id={labelId} className="text-sm font-semibold text-primary">
          ● Сейчас идёт
        </p>
        <BookingDetails booking={booking} timeZone={timeZone} />
      </CardHeader>
    </Card>
  )
}

function UpcomingList({ bookings, timeZone }: { bookings: Booking[]; timeZone: string }) {
  if (bookings.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Предстоящих встреч нет. Поделитесь ссылкой на запись с гостями.
        </CardContent>
      </Card>
    )
  }

  return (
    <ul aria-label="Предстоящие встречи" className="grid gap-3 md:grid-cols-2">
      {bookings.map((booking) => (
        <li key={booking.id}>
          <Card size="sm" className="h-full">
            <CardHeader>
              <BookingDetails booking={booking} timeZone={timeZone} />
            </CardHeader>
          </Card>
        </li>
      ))}
    </ul>
  )
}

// Guest, EventType, дата и интервал Booking (без Buffer) и время создания — по поясу Owner
function BookingDetails({ booking, timeZone }: { booking: Booking; timeZone: string }) {
  return (
    <>
      <CardTitle>
        <h2 className="break-words">{booking.guestName}</h2>
      </CardTitle>
      <CardDescription className="break-words">{booking.guestEmail}</CardDescription>
      <p className="text-sm">
        {booking.eventType.name} · {formatMomentDay(booking.start, timeZone)},{' '}
        {formatTimeRange(booking.start, booking.end, timeZone)}
      </p>
      <p className="text-xs text-muted-foreground">Создано {formatMomentDateTime(booking.createdAt, timeZone)}</p>
    </>
  )
}

export default OwnerUpcomingPage
