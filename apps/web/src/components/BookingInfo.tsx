import { useId } from 'react'
import { Link } from 'react-router-dom'
import type { EventType, Owner, Slot } from '@/api/generated'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { formatDayLabel, formatTimeRange } from '@/lib/ownerCalendar'
import { cn } from '@/lib/utils'

type BookingInfoProps = {
  owner: Owner
  eventType: EventType
  selectedDate?: string
  selectedSlot?: Slot
}

// Колонка «Информация»: к кому и на какой звонок записывается Guest, выбранные дата и время
function BookingInfo({ owner, eventType, selectedDate, selectedSlot }: BookingInfoProps) {
  const headingId = useId()
  return (
    <Card role="region" aria-labelledby={headingId}>
      <CardHeader>
        <h2 id={headingId} className="font-heading font-medium">
          Информация
        </h2>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <p className="text-muted-foreground">{owner.name}</p>
        <p className="font-medium">{eventType.name}</p>
        <p>{eventType.durationMinutes} мин</p>
        {eventType.description && <p className="text-muted-foreground">{eventType.description}</p>}
        <hr />
        <p>
          Дата:{' '}
          {selectedDate ? formatDayLabel(selectedDate) : <span className="text-muted-foreground">не выбрана</span>}
        </p>
        <p>
          Время:{' '}
          {selectedSlot ? (
            formatTimeRange(selectedSlot.start, selectedSlot.end, owner.timezone)
          ) : (
            <span className="text-muted-foreground">не выбрано</span>
          )}
        </p>
        <Link to="/" className={cn(buttonVariants({ variant: 'ghost' }), 'self-start')}>
          ← Другой тип
        </Link>
      </CardContent>
    </Card>
  )
}

export default BookingInfo
