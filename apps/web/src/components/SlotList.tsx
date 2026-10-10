import { useId } from 'react'
import type { BookingWindowDay, Slot } from '@/api/generated'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { formatTimeRange } from '@/lib/ownerCalendar'
import { cn } from '@/lib/utils'

type SlotListProps = {
  // Выбранный в календаре день; не выбран — undefined
  day?: BookingWindowDay
  // IANA-пояс Owner: интервалы слотов показываются в нём
  timeZone: string
  // Начало выбранного слота
  selectedStart?: string
  onSelectSlot: (slot: Slot) => void
}

// Колонка «Статус слотов»: все слоты выбранного дня со статусами.
// Выбрать можно только свободный слот
function SlotList({ day, timeZone, selectedStart, onSelectSlot }: SlotListProps) {
  const headingId = useId()
  const emptyMessage = !day
    ? 'Выберите дату в календаре'
    : day.slots.length === 0
      ? 'На этот день слотов не осталось'
      : day.slots.every((slot) => slot.status === 'taken')
        ? 'Все слоты заняты — выберите другой день'
        : undefined
  return (
    <Card role="region" aria-labelledby={headingId}>
      <CardHeader>
        <h2 id={headingId} className="font-heading font-medium">
          Статус слотов
        </h2>
      </CardHeader>
      <CardContent className="flex max-h-96 flex-col gap-1 overflow-auto">
        {emptyMessage && <p className="text-sm text-muted-foreground">{emptyMessage}</p>}
        {day?.slots.map((slot) => {
          const isFree = slot.status === 'free'
          const isSelected = slot.start === selectedStart
          return (
            <button
              key={slot.start}
              type="button"
              disabled={!isFree}
              aria-pressed={isFree ? isSelected : undefined}
              onClick={() => onSelectSlot(slot)}
              className={cn(
                'flex justify-between rounded-md border px-2 py-1 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                isSelected && 'border-primary bg-muted',
                isFree ? 'hover:bg-muted' : 'opacity-50',
              )}
            >
              <span>{formatTimeRange(slot.start, slot.end, timeZone)}</span>{' '}
              <span className={isFree ? 'text-primary' : 'text-muted-foreground'}>
                {isFree ? 'Свободно' : 'Занято'}
              </span>
            </button>
          )
        })}
      </CardContent>
    </Card>
  )
}

export default SlotList
