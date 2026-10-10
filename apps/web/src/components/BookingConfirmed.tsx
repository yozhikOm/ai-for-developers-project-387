import { useId } from 'react'
import { Link } from 'react-router-dom'
import type { Booking } from '@/api/generated'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
import { formatDayLabel, formatTimeRange } from '@/lib/ownerCalendar'

type BookingConfirmedProps = {
  booking: Booking
  // Календарная дата Booking по поясу Owner
  date: string
  // IANA-пояс Owner: интервал показывается в нём
  timeZone: string
}

// Экран успешной брони: сводка и возврат к выбору EventType
function BookingConfirmed({ booking, date, timeZone }: BookingConfirmedProps) {
  const headingId = useId()
  return (
    <Card role="region" aria-labelledby={headingId} className="w-full max-w-md self-center text-center">
      <CardHeader>
        <h2 id={headingId} className="font-heading text-2xl font-semibold">
          Бронь подтверждена. До встречи!
        </h2>
        <CardDescription className="text-base">
          {booking.eventType.name} · {formatDayLabel(date)}, {formatTimeRange(booking.start, booking.end, timeZone)}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm">
        <p>
          {booking.guestName}, {booking.guestEmail}
        </p>
        <Link to="/" className={buttonVariants()}>
          Забронировать ещё
        </Link>
      </CardContent>
    </Card>
  )
}

export default BookingConfirmed
