import { useId, useState } from 'react'
import type { BookingWindowDay } from '@/api/generated'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import {
  dayOfMonth,
  formatDayLabel,
  formatMonth,
  isSameMonth,
  monthGrid,
  monthOf,
  timeZoneCaption,
} from '@/lib/ownerCalendar'
import { cn } from '@/lib/utils'

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

type BookingCalendarProps = {
  // Дни BookingWindow из listSlots, по возрастанию даты
  days: BookingWindowDay[]
  // IANA-пояс Owner: для подписи пояса
  timeZone: string
  selectedDate?: string
  onSelectDate: (date: string) => void
}

// Месячный календарь BookingWindow. Активны только рабочие дни окна, у них —
// счётчик свободных слотов. Стрелки листают месяцы, которые захватывает окно.
function BookingCalendar({ days, timeZone, selectedDate, onSelectDate }: BookingCalendarProps) {
  const headingId = useId()
  const daysByDate = new Map(days.map((day) => [day.date, day]))
  // Окно в 14 дней захватывает один или два месяца
  const months = days.map((day) => monthOf(day.date)).filter(
    (month, index, all) => index === 0 || !isSameMonth(month, all[index - 1]),
  )
  const [monthIndex, setMonthIndex] = useState(0)
  const month = months[monthIndex]

  return (
    <Card role="region" aria-label="Календарь">
      <CardHeader className="grid-cols-[auto_1fr_auto] items-center">
        <Button
          size="icon-sm"
          variant="outline"
          aria-label="Предыдущий месяц"
          disabled={monthIndex === 0}
          onClick={() => setMonthIndex(monthIndex - 1)}
        >
          ←
        </Button>
        <h2 id={headingId} className="text-center font-heading font-medium">
          {month && formatMonth(month)}
        </h2>
        <Button
          size="icon-sm"
          variant="outline"
          aria-label="Следующий месяц"
          disabled={monthIndex >= months.length - 1}
          onClick={() => setMonthIndex(monthIndex + 1)}
        >
          →
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {month && (
          <div role="group" aria-labelledby={headingId} className="grid grid-cols-7 gap-1 text-center text-xs">
            {WEEKDAYS.map((weekday) => (
              <div key={weekday} aria-hidden className="text-muted-foreground">
                {weekday}
              </div>
            ))}
            {monthGrid(month).map((date, index) => {
              if (!date) return <div key={`blank-${index}`} />
              const day = daysByDate.get(date)
              // Вне окна дня в ответе нет; выходной в окне — нерабочий
              const isActive = day?.isWorkingDay === true
              const freeCount = day?.slots.filter((slot) => slot.status === 'free').length ?? 0
              const isSelected = date === selectedDate
              return (
                <button
                  key={date}
                  type="button"
                  disabled={!isActive}
                  aria-pressed={isActive ? isSelected : undefined}
                  onClick={() => onSelectDate(date)}
                  className={cn(
                    'flex min-h-12 flex-col items-center justify-center rounded-md p-1 outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                    isSelected
                      ? 'bg-primary text-primary-foreground'
                      : isActive
                        ? 'hover:bg-muted'
                        : 'text-muted-foreground/40',
                  )}
                >
                  <span className="sr-only">{formatDayLabel(date)}</span>
                  <span aria-hidden className="text-sm">
                    {dayOfMonth(date)}
                  </span>
                  {isActive && (
                    <span
                      className={cn('text-[10px]', freeCount === 0 && !isSelected && 'text-destructive')}
                    >
                      {freeCount} св.
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )}
        {days.length > 0 && (
          <p className="text-xs text-muted-foreground">{timeZoneCaption(timeZone, days[0].date)}</p>
        )}
      </CardContent>
    </Card>
  )
}

export default BookingCalendar
