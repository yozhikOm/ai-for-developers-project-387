import { expect, test, type Locator } from '@playwright/test'
import type { Owner, UpcomingBookings } from '../apps/web/src/api/generated/types.gen.ts'

// Основной сценарий бронирования в браузере: Guest записывается на звонок,
// Owner видит его Booking. «Сейчас» в сервере не подменить, поэтому тест не знает
// конкретных дат: берёт первый день со свободными слотами и первый свободный Slot.
// В BookingWindow из 14 дней рабочие дни есть всегда — тест проходит в любой день и час.

const GUEST_NAME = 'Гость E2E'
const GUEST_EMAIL = 'guest.e2e@example.com'
const EVENT_TYPE_NAME = 'Встреча 30 минут'

// Интервал «10:00–10:30» в поясе timeZone — так его показывают экраны.
// Своя копия, а не formatTimeRange из apps/web: ожидание считается независимо от кода экранов
function formatTimeRange({ start, end }: { start: string; end: string }, timeZone: string): string {
  const format = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone })
  return `${format.format(new Date(start))}–${format.format(new Date(end))}`
}

// Листает календарь вперёд, пока на экране не появится target. Окно захватывает
// один или два месяца: нужный день может оказаться во втором.
// Сначала ждём загрузки календаря, иначе пустой экран загрузки пролистает первый месяц
async function showInCalendar(calendar: Locator, target: Locator) {
  await expect(calendar).toBeVisible()
  const nextMonth = calendar.getByRole('button', { name: 'Следующий месяц' })
  while ((await target.count()) === 0 && (await nextMonth.isEnabled())) {
    await nextMonth.click()
  }
  await expect(target).toBeVisible()
}

test('Guest бронирует свободный Slot, Owner видит Booking в «Предстоящих»', async ({ page, request }) => {
  const owner: Owner = await (await request.get('/api/owner')).json()
  const browserTimeZone = await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone)
  expect(browserTimeZone, 'пояс браузера должен отличаться от пояса Owner').not.toBe(owner.timezone)

  // 1. Публичная страница: выбор EventType из засева
  await page.goto('/')
  await page.getByRole('link', { name: new RegExp(EVENT_TYPE_NAME) }).click()

  // 2. Первый день с «N св.» > 0 и первый свободный Slot в нём
  const calendar = page.getByRole('region', { name: 'Календарь' })
  const freeDay = calendar.getByRole('button', { name: /(^|\s)[1-9]\d* св\.$/ }).first()
  await showInCalendar(calendar, freeDay)
  // Подпись дня для экранных читалок: «четверг, 8 октября» — по ней день найдём снова
  const dayLabel = (await freeDay.locator('.sr-only').textContent()) ?? ''
  await freeDay.click()

  const slots = page.getByRole('region', { name: 'Статус слотов' })
  const freeSlot = slots.getByRole('button', { name: /Свободно$/ }).first()
  const interval = (await freeSlot.locator('span').first().textContent()) ?? ''
  await freeSlot.click()
  await page.getByRole('button', { name: 'Продолжить' }).click()

  // 3. «Ваши данные»: имя, email и подтверждение
  const confirmation = page.getByRole('region', { name: 'Подтверждение записи' })
  await expect(confirmation).toContainText(`${dayLabel}, ${interval}`)
  await confirmation.getByLabel('Имя').fill(GUEST_NAME)
  await confirmation.getByLabel('Email').fill(GUEST_EMAIL)
  await confirmation.getByRole('button', { name: 'Подтвердить запись' }).click()

  const confirmed = page.getByRole('region', { name: 'Бронь подтверждена. До встречи!' })
  await expect(confirmed).toBeVisible()
  await expect(confirmed).toContainText(`${dayLabel}, ${interval}`)
  await expect(confirmed).toContainText(`${GUEST_NAME}, ${GUEST_EMAIL}`)

  // Созданная Booking по данным API: выбранный интервал — это её время в поясе Owner, а не браузера
  const { upcoming }: UpcomingBookings = await (await request.get('/api/bookings/upcoming')).json()
  const booking = upcoming.find((item) => item.guestEmail === GUEST_EMAIL)
  if (!booking) throw new Error('созданной Booking нет среди предстоящих')
  expect(interval).toBe(formatTimeRange(booking, owner.timezone))
  expect(interval).not.toBe(formatTimeRange(booking, browserTimeZone))

  // При повторном открытии календаря забронированный Slot занят
  await confirmed.getByRole('link', { name: 'Забронировать ещё' }).click()
  await page.getByRole('link', { name: new RegExp(EVENT_TYPE_NAME) }).click()
  const bookedDay = calendar.getByRole('button', { name: new RegExp(`^${dayLabel} `) })
  await showInCalendar(calendar, bookedDay)
  await bookedDay.click()
  await expect(slots.getByRole('button', { name: `${interval} Занято` })).toBeDisabled()

  // 4. Owner: «Вход для владельца» → вкладка «Предстоящие» с карточкой этой Booking
  await page.goto('/')
  await page.getByRole('link', { name: 'Вход для владельца' }).click()
  await expect(page).toHaveURL(/\/owner\/upcoming$/)
  const card = page
    .getByRole('list', { name: 'Предстоящие встречи' })
    .getByRole('listitem')
    .filter({ hasText: GUEST_NAME })
  await expect(card).toHaveCount(1)
  await expect(card).toContainText(GUEST_EMAIL)
  await expect(card).toContainText(`${EVENT_TYPE_NAME} · ${dayLabel}, ${interval}`)
})
