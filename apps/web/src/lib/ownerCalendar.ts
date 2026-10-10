// Даты и время для Guest и Owner — по поясу Owner, а не браузера.
// Даты дней (plainDate «YYYY-MM-DD») уже посчитаны сервером в поясе Owner:
// их нельзя разбирать через new Date(date) и getDate(), иначе в поясе западнее
// UTC день съедет на предыдущий. Поэтому календарная арифметика здесь идёт в UTC.

export type CalendarMonth = { year: number; month: number }

function plainDateToUtc(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`)
}

function formatPlainDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function monthOf(date: string): CalendarMonth {
  const utc = plainDateToUtc(date)
  return { year: utc.getUTCFullYear(), month: utc.getUTCMonth() + 1 }
}

export function isSameMonth(a: CalendarMonth, b: CalendarMonth): boolean {
  return a.year === b.year && a.month === b.month
}

// Сетка месяца по неделям с понедельника: null — пустые клетки до первого числа
export function monthGrid({ year, month }: CalendarMonth): (string | null)[] {
  const first = new Date(Date.UTC(year, month - 1, 1))
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const leadingBlanks = (first.getUTCDay() + 6) % 7
  return [
    ...Array<null>(leadingBlanks).fill(null),
    ...Array.from({ length: daysInMonth }, (_, index) =>
      formatPlainDate(new Date(Date.UTC(year, month - 1, index + 1))),
    ),
  ]
}

export function dayOfMonth(date: string): number {
  return plainDateToUtc(date).getUTCDate()
}

const monthNameFormat = new Intl.DateTimeFormat('ru-RU', { month: 'long', timeZone: 'UTC' })

// «Октябрь 2026»
export function formatMonth({ year, month }: CalendarMonth): string {
  const name = monthNameFormat.format(new Date(Date.UTC(year, month - 1, 1)))
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${year}`
}

const dayLabelFormat = new Intl.DateTimeFormat('ru-RU', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
})

// «среда, 7 октября»
export function formatDayLabel(date: string): string {
  return dayLabelFormat.format(plainDateToUtc(date))
}

function timeFormat(timeZone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone })
}

// Интервал слота по поясу Owner: «09:00–09:30». start и end — моменты UTC (ISO 8601)
export function formatTimeRange(start: string, end: string, timeZone: string): string {
  const format = timeFormat(timeZone)
  return `${format.format(new Date(start))}–${format.format(new Date(end))}`
}

// Дата момента UTC по поясу Owner: «среда, 7 октября»
export function formatMomentDay(moment: string, timeZone: string): string {
  return new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long', timeZone }).format(
    new Date(moment),
  )
}

// Дата и время момента UTC по поясу Owner: «6 октября, 09:15».
// Собираем из частей: склейку даты и времени Intl в разных версиях ICU пишет по-разному
export function formatMomentDateTime(moment: string, timeZone: string): string {
  const date = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', timeZone }).format(new Date(moment))
  return `${date}, ${timeFormat(timeZone).format(new Date(moment))}`
}

// Названия поясов России в дательном падеже: «по Москве»
const TIME_ZONE_PLACES: Record<string, string> = {
  'Europe/Kaliningrad': 'Калининграду',
  'Europe/Moscow': 'Москве',
  'Europe/Samara': 'Самаре',
  'Asia/Yekaterinburg': 'Екатеринбургу',
  'Asia/Omsk': 'Омску',
  'Asia/Novosibirsk': 'Новосибирску',
  'Asia/Krasnoyarsk': 'Красноярску',
  'Asia/Irkutsk': 'Иркутску',
  'Asia/Yakutsk': 'Якутску',
  'Asia/Vladivostok': 'Владивостоку',
  'Asia/Magadan': 'Магадану',
  'Asia/Kamchatka': 'Камчатке',
}

// Подпись пояса Owner: «Время указано по Москве (UTC+3)».
// Смещение — на дату date (у поясов с летним временем оно меняется)
export function timeZoneCaption(timeZone: string, date: string): string {
  // Полдень UTC: дата в поясе Owner та же для любых смещений от −12 до +12
  const noon = new Date(`${date}T12:00:00.000Z`)
  const offset =
    new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'shortOffset' })
      .formatToParts(noon)
      .find((part) => part.type === 'timeZoneName')?.value ?? 'GMT'
  const place = TIME_ZONE_PLACES[timeZone] ?? `поясу ${timeZone}`
  return `Время указано по ${place} (${offset.replace('GMT', 'UTC')})`
}
