import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BookingWindowDay, SlotStatus } from '@/api/generated'
import { renderApp, stubApi, type StubResponse } from '@/testing.tsx'

afterEach(() => {
  vi.unstubAllGlobals()
})

const owner = { name: 'Анна Смирнова', timezone: 'Europe/Moscow' }

const eventType = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Встреча 30 минут',
  description: 'Обсудим задачу и следующие шаги',
  durationMinutes: 30,
  createdAt: '2026-10-01T09:00:00.000Z',
}

// Ответ listSlots: 14 дней с первого, выходные — нерабочие без слотов.
// У рабочего дня по умолчанию два свободных слота, statusesByDate задаёт статусы слотов дня
function bookingWindow(first: string, statusesByDate: Record<string, SlotStatus[]> = {}): BookingWindowDay[] {
  return Array.from({ length: 14 }, (_, offset) => {
    const start = new Date(`${first}T00:00:00.000Z`)
    start.setUTCDate(start.getUTCDate() + offset)
    const date = start.toISOString().slice(0, 10)
    const weekday = start.getUTCDay()
    if (weekday === 0 || weekday === 6) return { date, isWorkingDay: false, slots: [] }

    const statuses = statusesByDate[date] ?? ['free', 'free']
    return {
      date,
      isWorkingDay: true,
      // Слоты по 30 минут с 06:00 UTC (09:00 по Москве) с шагом 15 минут
      slots: statuses.map((status, index) => ({
        start: new Date(Date.parse(`${date}T06:00:00.000Z`) + index * 15 * 60_000).toISOString(),
        end: new Date(Date.parse(`${date}T06:30:00.000Z`) + index * 15 * 60_000).toISOString(),
        status,
      })),
    }
  })
}

// Ответ createBooking по умолчанию: бронь из тела запроса, конец — начало плюс 30 минут
async function bookingCreated(request: Request): Promise<StubResponse> {
  // Копия: тест сам читает тело отправленного запроса
  const body = await request.clone().json()
  return [
    201,
    {
      id: '22222222-2222-4222-8222-222222222222',
      start: body.start,
      end: new Date(Date.parse(body.start) + 30 * 60_000).toISOString(),
      guestName: body.guestName,
      guestEmail: body.guestEmail,
      createdAt: '2026-10-06T07:00:00.000Z',
      eventType: { id: eventType.id, name: eventType.name },
    },
  ]
}

// API для экрана выбора времени, подтверждения и публичной страницы (куда ведут ссылки возврата)
function stubBookingApi({
  ownerData = owner,
  days = bookingWindow('2026-10-06'),
  createBooking = bookingCreated,
  listSlots = async () => [200, days],
}: {
  ownerData?: typeof owner
  days?: BookingWindowDay[]
  createBooking?: (request: Request) => Promise<StubResponse>
  // Ответ listSlots, если он меняется между запросами (например, после отказа createBooking)
  listSlots?: (request: Request) => Promise<StubResponse>
} = {}) {
  return stubApi({
    'GET /api/owner': [200, ownerData],
    'GET /api/event-types': [200, [eventType]],
    [`GET /api/event-types/${eventType.id}`]: [200, eventType],
    [`GET /api/event-types/${eventType.id}/slots`]: listSlots,
    'POST /api/bookings': createBooking,
  })
}

async function openBookingPage() {
  renderApp(`/booking/${eventType.id}`)
  return screen.findByRole('region', { name: 'Календарь' })
}

// Кнопка дня календаря по полной дате, например «среда, 7 октября»
function dayButton(label: string) {
  return screen.getByRole('button', { name: new RegExp(`^${label}`) })
}

function slotColumn() {
  return screen.getByRole('region', { name: 'Статус слотов' })
}

// Слоты колонки по порядку: «интервал статус»
function slotButtonNames() {
  return within(slotColumn())
    .getAllByRole('button')
    .map((button) => button.textContent)
}

function slotButton(range: string) {
  return within(slotColumn()).getByRole('button', { name: new RegExp(`^${range}`) })
}

function continueButton() {
  return screen.getByRole('button', { name: 'Продолжить' })
}

describe('экран выбора времени', () => {
  it('открывается по прямой ссылке: шаги и «Информация» с Owner, типом, длительностью и описанием', async () => {
    const fetchMock = stubBookingApi()

    await openBookingPage()

    const steps = screen.getByRole('list', { name: 'Шаги записи' })
    expect(within(steps).getAllByRole('listitem').map((step) => step.textContent)).toEqual([
      '1. Тип встречи',
      '2. Дата и время',
      '3. Ваши данные',
    ])
    expect(within(steps).getByText('2. Дата и время')).toHaveAttribute('aria-current', 'step')

    const info = screen.getByRole('region', { name: 'Информация' })
    expect(info).toHaveTextContent('Анна Смирнова')
    expect(info).toHaveTextContent('Встреча 30 минут')
    expect(info).toHaveTextContent('30 мин')
    expect(info).toHaveTextContent('Обсудим задачу и следующие шаги')

    const requested = fetchMock.mock.calls.map(([request]) => new URL(request.url).pathname)
    expect(requested).toEqual(
      expect.arrayContaining([`/api/event-types/${eventType.id}`, `/api/event-types/${eventType.id}/slots`]),
    )
  })

  it('«← Другой тип» ведёт к списку типов', async () => {
    stubBookingApi()
    await openBookingPage()

    await userEvent.click(screen.getByRole('link', { name: '← Другой тип' }))

    expect(await screen.findByRole('link', { name: /Встреча 30 минут/ })).toHaveAttribute(
      'href',
      `/booking/${eventType.id}`,
    )
  })

  it('для несуществующего типа показывает «Тип больше недоступен» с возвратом к списку типов', async () => {
    const notFound = [404, { code: 'EVENT_TYPE_NOT_FOUND', message: 'EventType не найден' }] as const
    stubApi({
      'GET /api/owner': [200, owner],
      'GET /api/event-types': [200, [eventType]],
      [`GET /api/event-types/${eventType.id}`]: [...notFound],
      [`GET /api/event-types/${eventType.id}/slots`]: [...notFound],
    })
    renderApp(`/booking/${eventType.id}`)

    expect(await screen.findByRole('heading', { name: 'Тип больше недоступен' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Календарь' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('link', { name: 'К списку типов' }))

    expect(await screen.findByRole('link', { name: /Встреча 30 минут/ })).toBeInTheDocument()
  })

  it('сообщает об ошибке, если API не ответил', async () => {
    stubApi({
      'GET /api/owner': [200, owner],
      [`GET /api/event-types/${eventType.id}`]: [200, eventType],
      [`GET /api/event-types/${eventType.id}/slots`]: [500, { code: 'INTERNAL_ERROR', message: 'Ошибка' }],
    })
    renderApp(`/booking/${eventType.id}`)

    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось загрузить страницу')
  })
})

describe('календарь BookingWindow', () => {
  it('дни вне окна и выходные неактивны и без счётчика', async () => {
    // Окно — со вторника 6 по понедельник 19 октября
    stubBookingApi()
    await openBookingPage()

    expect(screen.getByRole('heading', { name: 'Октябрь 2026' })).toBeInTheDocument()
    for (const label of [
      'понедельник, 5 октября', // до окна
      'суббота, 10 октября', // выходной в окне
      'воскресенье, 18 октября', // выходной в окне
      'вторник, 20 октября', // после окна
    ]) {
      expect(dayButton(label)).toBeDisabled()
      expect(dayButton(label)).not.toHaveTextContent('св.')
    }
    for (const label of ['вторник, 6 октября', 'пятница, 9 октября', 'понедельник, 19 октября']) {
      expect(dayButton(label)).toBeEnabled()
      expect(dayButton(label)).toHaveTextContent('2 св.')
    }
  })

  it('«N св.» и «0 св.» считаются по статусам слотов из ответа', async () => {
    stubBookingApi({
      days: bookingWindow('2026-10-06', {
        // Сегодня вечером: рабочий день без оставшихся слотов
        '2026-10-06': [],
        '2026-10-07': ['free', 'taken', 'free', 'taken', 'free'],
        '2026-10-08': ['taken', 'taken'],
      }),
    })
    await openBookingPage()

    expect(dayButton('вторник, 6 октября')).toHaveTextContent('0 св.')
    expect(dayButton('среда, 7 октября')).toHaveTextContent('3 св.')
    expect(dayButton('четверг, 8 октября')).toHaveTextContent('0 св.')
    expect(dayButton('четверг, 8 октября')).toBeEnabled()
  })

  it('окно на стыке месяцев листается стрелками', async () => {
    // Окно — с понедельника 26 октября по воскресенье 8 ноября
    stubBookingApi({ days: bookingWindow('2026-10-26') })
    await openBookingPage()
    const previous = screen.getByRole('button', { name: 'Предыдущий месяц' })
    const next = screen.getByRole('button', { name: 'Следующий месяц' })

    expect(screen.getByRole('heading', { name: 'Октябрь 2026' })).toBeInTheDocument()
    expect(previous).toBeDisabled()
    expect(dayButton('пятница, 30 октября')).toHaveTextContent('2 св.')
    expect(screen.queryByRole('button', { name: /ноября/ })).not.toBeInTheDocument()

    await userEvent.click(next)

    expect(screen.getByRole('heading', { name: 'Ноябрь 2026' })).toBeInTheDocument()
    expect(next).toBeDisabled()
    expect(dayButton('понедельник, 2 ноября')).toHaveTextContent('2 св.')
    expect(dayButton('суббота, 7 ноября')).toBeDisabled()
    expect(dayButton('понедельник, 9 ноября')).toBeDisabled()
    expect(dayButton('понедельник, 9 ноября')).not.toHaveTextContent('св.')

    await userEvent.click(previous)

    expect(screen.getByRole('heading', { name: 'Октябрь 2026' })).toBeInTheDocument()
  })

  it('подпись пояса — по поясу Owner', async () => {
    stubBookingApi()
    await openBookingPage()

    expect(screen.getByText('Время указано по Москве (UTC+3)')).toBeInTheDocument()
  })

  it('дни и подпись пояса — в поясе Owner независимо от пояса jsdom', async () => {
    // Пояс тестов задан в vite.config.ts и лежит западнее UTC: наивный разбор
    // даты «2026-10-07» через new Date() показал бы 6 октября
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('Pacific/Honolulu')
    stubBookingApi({
      ownerData: { ...owner, timezone: 'Asia/Yekaterinburg' },
      days: bookingWindow('2026-10-07', { '2026-10-07': ['free', 'free', 'free'] }),
    })
    await openBookingPage()

    expect(screen.getByText('Время указано по Екатеринбургу (UTC+5)')).toBeInTheDocument()
    expect(dayButton('среда, 7 октября')).toHaveTextContent('3 св.')
    expect(dayButton('вторник, 6 октября')).toBeDisabled()
  })
})

describe('колонка «Статус слотов»', () => {
  it('пока день не выбран, просит выбрать дату, а «Продолжить» неактивна', async () => {
    stubBookingApi()
    await openBookingPage()

    expect(slotColumn()).toHaveTextContent('Выберите дату в календаре')
    expect(continueButton()).toBeDisabled()
  })

  it('после выбора дня показывает все слоты дня с интервалами в поясе Owner и статусами', async () => {
    stubBookingApi({
      days: bookingWindow('2026-10-06', { '2026-10-07': ['free', 'taken', 'free'] }),
    })
    await openBookingPage()

    await userEvent.click(dayButton('среда, 7 октября'))

    expect(slotButtonNames()).toEqual([
      '09:00–09:30 Свободно',
      '09:15–09:45 Занято',
      '09:30–10:00 Свободно',
    ])
    expect(slotColumn()).not.toHaveTextContent('Выберите дату в календаре')
  })

  it('занятый слот не нажимается, выбранный свободный подсвечен и показан в «Информации»', async () => {
    stubBookingApi({
      days: bookingWindow('2026-10-06', { '2026-10-07': ['free', 'taken', 'free'] }),
    })
    await openBookingPage()
    const info = screen.getByRole('region', { name: 'Информация' })
    expect(info).toHaveTextContent('Дата: не выбрана')
    expect(info).toHaveTextContent('Время: не выбрано')

    await userEvent.click(dayButton('среда, 7 октября'))
    expect(slotButton('09:15–09:45')).toBeDisabled()
    expect(info).toHaveTextContent('Дата: среда, 7 октября')
    expect(continueButton()).toBeDisabled()

    await userEvent.click(slotButton('09:30–10:00'))

    expect(slotButton('09:30–10:00')).toHaveAttribute('aria-pressed', 'true')
    expect(slotButton('09:00–09:30')).toHaveAttribute('aria-pressed', 'false')
    expect(info).toHaveTextContent('Время: 09:30–10:00')
    expect(continueButton()).toBeEnabled()
  })

  it('выбор другого дня сбрасывает выбранный слот', async () => {
    stubBookingApi()
    await openBookingPage()
    await userEvent.click(dayButton('среда, 7 октября'))
    await userEvent.click(slotButton('09:00–09:30'))
    expect(continueButton()).toBeEnabled()

    await userEvent.click(dayButton('четверг, 8 октября'))

    expect(slotButton('09:00–09:30')).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('region', { name: 'Информация' })).toHaveTextContent('Время: не выбрано')
    expect(continueButton()).toBeDisabled()
  })

  it('у рабочего дня без оставшихся слотов — «На этот день слотов не осталось»', async () => {
    // Сегодня вечером: все слоты дня прошли или попали в MinimumNotice
    stubBookingApi({ days: bookingWindow('2026-10-06', { '2026-10-06': [] }) })
    await openBookingPage()

    await userEvent.click(dayButton('вторник, 6 октября'))

    expect(slotColumn()).toHaveTextContent('На этот день слотов не осталось')
    expect(within(slotColumn()).queryAllByRole('button')).toEqual([])
    expect(slotColumn()).not.toHaveTextContent('Все слоты заняты')
  })

  it('если все слоты дня заняты — «Все слоты заняты — выберите другой день»', async () => {
    stubBookingApi({ days: bookingWindow('2026-10-06', { '2026-10-08': ['taken', 'taken'] }) })
    await openBookingPage()

    await userEvent.click(dayButton('четверг, 8 октября'))

    expect(slotColumn()).toHaveTextContent('Все слоты заняты — выберите другой день')
    expect(slotButtonNames()).toEqual(['09:00–09:30 Занято', '09:15–09:45 Занято'])
    expect(slotColumn()).not.toHaveTextContent('На этот день слотов не осталось')
  })

  it('у дня со свободными слотами пустых состояний нет', async () => {
    stubBookingApi({ days: bookingWindow('2026-10-06', { '2026-10-07': ['taken', 'free'] }) })
    await openBookingPage()

    await userEvent.click(dayButton('среда, 7 октября'))

    expect(slotColumn()).not.toHaveTextContent('Все слоты заняты')
    expect(slotColumn()).not.toHaveTextContent('На этот день слотов не осталось')
  })

  it('интервалы — в поясе Owner независимо от пояса jsdom', async () => {
    stubBookingApi({
      ownerData: { ...owner, timezone: 'Asia/Yekaterinburg' },
      days: bookingWindow('2026-10-07', { '2026-10-07': ['free', 'taken'] }),
    })
    await openBookingPage()

    await userEvent.click(dayButton('среда, 7 октября'))
    await userEvent.click(slotButton('11:00–11:30'))

    expect(slotButtonNames()).toEqual(['11:00–11:30 Свободно', '11:15–11:45 Занято'])
    expect(screen.getByRole('region', { name: 'Информация' })).toHaveTextContent('Время: 11:00–11:30')
  })
})

describe('подтверждение и создание Booking', () => {
  // Выбирает слот 09:30–10:00 среды 7 октября и переходит к подтверждению
  async function continueWithSlot() {
    await openBookingPage()
    await userEvent.click(dayButton('среда, 7 октября'))
    await userEvent.click(slotButton('09:30–10:00'))
    await userEvent.click(continueButton())
    return screen.findByRole('heading', { name: 'Подтверждение записи' })
  }

  function confirmButton() {
    return screen.getByRole('button', { name: 'Подтвердить запись' })
  }

  // Отправленные запросы к операции API: метод и путь
  function requestsTo(fetchMock: ReturnType<typeof stubBookingApi>, method: string, pathname: string) {
    return fetchMock.mock.calls
      .map(([request]) => request)
      .filter((request) => request.method === method && new URL(request.url).pathname === pathname)
  }

  function bookingRequests(fetchMock: ReturnType<typeof stubBookingApi>) {
    return requestsTo(fetchMock, 'POST', '/api/bookings')
  }

  function slotRequests(fetchMock: ReturnType<typeof stubBookingApi>) {
    return requestsTo(fetchMock, 'GET', `/api/event-types/${eventType.id}/slots`)
  }

  it('«Продолжить» ведёт на подтверждение со сводкой выбора', async () => {
    stubBookingApi({ days: bookingWindow('2026-10-06', { '2026-10-07': ['free', 'free', 'free'] }) })

    await continueWithSlot()

    const confirmation = screen.getByRole('region', { name: 'Подтверждение записи' })
    expect(confirmation).toHaveTextContent('Встреча 30 минут')
    expect(confirmation).toHaveTextContent('среда, 7 октября')
    expect(confirmation).toHaveTextContent('09:30–10:00')
    expect(screen.getByText('3. Ваши данные')).toHaveAttribute('aria-current', 'step')
    expect(screen.queryByRole('region', { name: 'Календарь' })).not.toBeInTheDocument()
  })

  it.each([
    ['пустые поля', '', '', ['Укажите имя', 'Укажите email']],
    ['поля из одних пробелов', '   ', '  ', ['Укажите имя', 'Укажите email']],
    ['неверный email', 'Иван', 'ivan@example', ['Неверный формат email']],
    ['слишком длинные значения', 'и'.repeat(101), `${'a'.repeat(243)}@example.com`, [
      'Не длиннее 100 символов',
      'Не длиннее 254 символов',
    ]],
  ])('ошибки под полями видны до отправки: %s', async (_title, name, email, errors) => {
    const fetchMock = stubBookingApi({ days: bookingWindow('2026-10-06', { '2026-10-07': ['free', 'free', 'free'] }) })
    await continueWithSlot()

    // paste, а не type: длинные значения посимвольно вводятся слишком долго
    await userEvent.click(screen.getByLabelText('Имя'))
    if (name) await userEvent.paste(name)
    await userEvent.click(screen.getByLabelText('Email'))
    if (email) await userEvent.paste(email)
    await userEvent.click(confirmButton())

    for (const error of errors) {
      expect(screen.getByText(error)).toBeInTheDocument()
    }
    expect(bookingRequests(fetchMock)).toEqual([])
  })

  it('ошибка под полем пропадает после исправления ввода', async () => {
    stubBookingApi({ days: bookingWindow('2026-10-06', { '2026-10-07': ['free', 'free', 'free'] }) })
    await continueWithSlot()
    await userEvent.click(confirmButton())
    expect(screen.getByLabelText('Имя')).toHaveAccessibleDescription('Укажите имя')

    await userEvent.type(screen.getByLabelText('Имя'), 'Иван')

    expect(screen.queryByText('Укажите имя')).not.toBeInTheDocument()
    expect(screen.getByText('Укажите email')).toBeInTheDocument()
  })

  it('«Изменить» возвращает к выбору времени с сохранённым слотом', async () => {
    stubBookingApi({ days: bookingWindow('2026-10-06', { '2026-10-07': ['free', 'free', 'free'] }) })
    await continueWithSlot()

    await userEvent.click(screen.getByRole('button', { name: 'Изменить' }))

    expect(screen.getByRole('region', { name: 'Календарь' })).toBeInTheDocument()
    expect(dayButton('среда, 7 октября')).toHaveAttribute('aria-pressed', 'true')
    expect(slotButton('09:30–10:00')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('region', { name: 'Информация' })).toHaveTextContent('Время: 09:30–10:00')
    expect(continueButton()).toBeEnabled()
  })

  it('«Подтвердить запись» отправляет createBooking с обрезанными значениями и показывает подтверждение', async () => {
    const fetchMock = stubBookingApi({
      days: bookingWindow('2026-10-06', { '2026-10-07': ['free', 'free', 'free'] }),
    })
    await continueWithSlot()

    await userEvent.type(screen.getByLabelText('Имя'), '  Иван Петров ')
    await userEvent.type(screen.getByLabelText('Email'), ' ivan@example.com  ')
    await userEvent.click(confirmButton())

    expect(
      await screen.findByRole('heading', { name: 'Бронь подтверждена. До встречи!' }),
    ).toBeInTheDocument()
    const [request] = bookingRequests(fetchMock)
    expect(await request.json()).toEqual({
      eventTypeId: eventType.id,
      start: '2026-10-07T06:30:00.000Z',
      guestName: 'Иван Петров',
      guestEmail: 'ivan@example.com',
    })
    const summary = screen.getByRole('region', { name: 'Бронь подтверждена. До встречи!' })
    expect(summary).toHaveTextContent('Встреча 30 минут')
    expect(summary).toHaveTextContent('среда, 7 октября')
    expect(summary).toHaveTextContent('09:30–10:00')
    expect(summary).toHaveTextContent('Иван Петров')
    expect(summary).toHaveTextContent('ivan@example.com')

    await userEvent.click(screen.getByRole('link', { name: 'Забронировать ещё' }))

    expect(await screen.findByRole('link', { name: /Встреча 30 минут/ })).toHaveAttribute(
      'href',
      `/booking/${eventType.id}`,
    )
  })

  it.each([
    ['непредвиденная ошибка', 500, 'INTERNAL_ERROR'],
    ['сервер отклонил данные', 400, 'VALIDATION_ERROR'],
  ])('при отказе «%s» показывает общее сообщение формы', async (_title, status, code) => {
    stubBookingApi({
      days: bookingWindow('2026-10-06', { '2026-10-07': ['free', 'free', 'free'] }),
      createBooking: async () => [status, { code, message: 'Ошибка' }],
    })
    await continueWithSlot()

    await fillAndConfirm()

    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось создать бронь')
    expect(screen.getByRole('region', { name: 'Подтверждение записи' })).toBeInTheDocument()
    expect(confirmButton()).toBeEnabled()
  })

  // Отказы, после которых выбранное время больше не подходит

  async function fillAndConfirm() {
    await userEvent.type(screen.getByLabelText('Имя'), 'Иван')
    await userEvent.type(screen.getByLabelText('Email'), 'ivan@example.com')
    await userEvent.click(confirmButton())
  }

  it('на SLOT_TAKEN показывает баннер и возвращает к выбору времени, где слот уже «Занято»', async () => {
    // Пока Guest заполнял форму, слот 09:30–10:00 заняли
    let slotTaken = false
    const fetchMock = stubBookingApi({
      listSlots: async () => [
        200,
        bookingWindow('2026-10-06', { '2026-10-07': ['free', 'free', slotTaken ? 'taken' : 'free'] }),
      ],
      createBooking: async () => {
        slotTaken = true
        return [409, { code: 'SLOT_TAKEN', message: 'Slot занят' }]
      },
    })
    await continueWithSlot()

    await fillAndConfirm()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Пока вы заполняли форму, этот слот заняли. Выберите другое время.',
    )
    expect(screen.queryByRole('region', { name: 'Подтверждение записи' })).not.toBeInTheDocument()
    expect(await within(slotColumn()).findByRole('button', { name: '09:30–10:00 Занято' })).toBeDisabled()
    expect(slotRequests(fetchMock)).toHaveLength(2)
    // День остаётся выбранным, а занятый слот — нет
    expect(dayButton('среда, 7 октября')).toHaveAttribute('aria-pressed', 'true')
    expect(dayButton('среда, 7 октября')).toHaveTextContent('2 св.')
    expect(screen.getByRole('region', { name: 'Информация' })).toHaveTextContent('Время: не выбрано')
    expect(continueButton()).toBeDisabled()

    // Баннер относится к прошлой попытке и после выбора другого времени уходит
    await userEvent.click(slotButton('09:15–09:45'))
    await userEvent.click(continueButton())

    expect(await screen.findByRole('heading', { name: 'Подтверждение записи' })).toBeInTheDocument()
    expect(screen.queryByText(/этот слот заняли/)).not.toBeInTheDocument()
  })

  it('на SLOT_TAKEN слот «Занято», даже если слоты не удалось запросить заново', async () => {
    let slotRequestCount = 0
    stubBookingApi({
      listSlots: async () => {
        slotRequestCount += 1
        return slotRequestCount === 1
          ? [200, bookingWindow('2026-10-06', { '2026-10-07': ['free', 'free', 'free'] })]
          : [500, { code: 'INTERNAL_ERROR', message: 'Ошибка' }]
      },
      createBooking: async () => [409, { code: 'SLOT_TAKEN', message: 'Slot занят' }],
    })
    await continueWithSlot()

    await fillAndConfirm()

    expect(await screen.findByRole('alert')).toHaveTextContent('этот слот заняли')
    await waitFor(() => expect(slotRequestCount).toBe(2))
    expect(slotButton('09:30–10:00')).toHaveTextContent('Занято')
    expect(slotButton('09:30–10:00')).toBeDisabled()
    expect(slotButton('09:15–09:45')).toHaveTextContent('Свободно')
  })

  it('на SLOT_UNAVAILABLE показывает свой баннер и возвращает к выбору времени', async () => {
    const fetchMock = stubBookingApi({
      days: bookingWindow('2026-10-06', { '2026-10-07': ['free', 'free', 'free'] }),
      createBooking: async () => [422, { code: 'SLOT_UNAVAILABLE', message: 'Начало недоступно' }],
    })
    await continueWithSlot()

    await fillAndConfirm()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Это время уже недоступно для записи. Выберите другое.',
    )
    expect(screen.getByRole('region', { name: 'Календарь' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Подтверждение записи' })).not.toBeInTheDocument()
    expect(screen.getByText('2. Дата и время')).toHaveAttribute('aria-current', 'step')
    await waitFor(() => expect(slotRequests(fetchMock)).toHaveLength(2))
  })

  it('на EVENT_TYPE_NOT_FOUND показывает «Тип больше недоступен» с возвратом к списку типов', async () => {
    stubBookingApi({
      days: bookingWindow('2026-10-06', { '2026-10-07': ['free', 'free', 'free'] }),
      createBooking: async () => [404, { code: 'EVENT_TYPE_NOT_FOUND', message: 'EventType не найден' }],
    })
    await continueWithSlot()

    await fillAndConfirm()

    expect(await screen.findByRole('heading', { name: 'Тип больше недоступен' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Подтверждение записи' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'К списку типов' })).toHaveAttribute('href', '/')
  })
})
