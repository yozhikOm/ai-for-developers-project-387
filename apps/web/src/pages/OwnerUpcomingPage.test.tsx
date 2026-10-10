import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderApp, stubApi } from '@/testing.tsx'

afterEach(() => {
  vi.unstubAllGlobals()
})

// Пояс Owner (UTC+5) не совпадает ни с UTC, ни с поясом «браузера» в тестах (Гонолулу, UTC−10)
const owner = { name: 'Анна Смирнова', timezone: 'Asia/Yekaterinburg' }

const meeting = { id: '11111111-1111-4111-8111-111111111111', name: 'Встреча 30 минут' }
const review = { id: '22222222-2222-4222-8222-222222222222', name: 'Разбор проекта' }

const eventTypes = [
  { ...meeting, durationMinutes: 30, createdAt: '2026-10-01T09:00:00.000Z' },
  { ...review, durationMinutes: 60, createdAt: '2026-10-02T09:00:00.000Z' },
]

// Идёт сейчас: вторник 6 октября 13:00–13:30 по Екатеринбургу
const ongoing = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  start: '2026-10-06T08:00:00.000Z',
  end: '2026-10-06T08:30:00.000Z',
  guestName: 'Иван Петров',
  guestEmail: 'ivan@example.com',
  createdAt: '2026-10-05T05:00:00.000Z',
  eventType: meeting,
}

// Среда 7 октября 09:00–09:30 по Екатеринбургу; в Гонолулу это ещё вторник
const wednesday = {
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  start: '2026-10-07T04:00:00.000Z',
  end: '2026-10-07T04:30:00.000Z',
  guestName: 'Ольга Смирнова',
  guestEmail: 'Olga@Example.com',
  createdAt: '2026-10-06T04:15:00.000Z',
  eventType: meeting,
}

// Четверг 8 октября 11:00–12:00 по Екатеринбургу
const thursday = {
  id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  start: '2026-10-08T06:00:00.000Z',
  end: '2026-10-08T07:00:00.000Z',
  guestName: 'Пётр Иванов',
  guestEmail: 'petr@example.com',
  createdAt: '2026-10-06T07:40:00.000Z',
  eventType: review,
}

function stubOwnerApi(upcomingBookings: unknown) {
  return stubApi({
    'GET /api/owner': [200, owner],
    'GET /api/event-types': [200, eventTypes],
    'GET /api/bookings/upcoming': [200, upcomingBookings],
  })
}

describe('раздел Owner: предстоящие Booking', () => {
  it('«Вход для владельца» открывает вкладку «Предстоящие»; счётчик считает только не начавшиеся брони', async () => {
    stubOwnerApi({ current: ongoing, upcoming: [wednesday, thursday] })
    renderApp('/')

    await userEvent.click(await screen.findByRole('link', { name: 'Вход для владельца' }))

    expect(await screen.findByRole('link', { name: 'Предстоящие (2)' })).toHaveAttribute('aria-current', 'page')
    expect(await screen.findByRole('link', { name: 'Типы событий (2)' })).not.toHaveAttribute('aria-current')
  })

  it('показывает карточки по порядку из API: гость, email, EventType, дата и интервал без Buffer, время создания в поясе Owner', async () => {
    stubOwnerApi({ upcoming: [wednesday, thursday] })

    renderApp('/owner/upcoming')

    const list = await screen.findByRole('list', { name: 'Предстоящие встречи' })
    const cards = within(list).getAllByRole('listitem')
    expect(cards).toHaveLength(2)
    expect(within(cards[0]).getByRole('heading', { name: 'Ольга Смирнова' })).toBeInTheDocument()
    expect(cards[0]).toHaveTextContent('Olga@Example.com')
    expect(cards[0]).toHaveTextContent('Встреча 30 минут · среда, 7 октября, 09:00–09:30')
    expect(cards[0]).toHaveTextContent('Создано 6 октября, 09:15')
    expect(within(cards[1]).getByRole('heading', { name: 'Пётр Иванов' })).toBeInTheDocument()
    expect(cards[1]).toHaveTextContent('petr@example.com')
    expect(cards[1]).toHaveTextContent('Разбор проекта · четверг, 8 октября, 11:00–12:00')
    expect(cards[1]).toHaveTextContent('Создано 6 октября, 12:40')
  })

  it('над списком — карточка «● Сейчас идёт» с идущей бронью', async () => {
    stubOwnerApi({ current: ongoing, upcoming: [wednesday] })

    renderApp('/owner/upcoming')

    const current = await screen.findByRole('region', { name: '● Сейчас идёт' })
    expect(within(current).getByRole('heading', { name: 'Иван Петров' })).toBeInTheDocument()
    expect(current).toHaveTextContent('ivan@example.com')
    expect(current).toHaveTextContent('Встреча 30 минут · вторник, 6 октября, 13:00–13:30')
    expect(current).toHaveTextContent('Создано 5 октября, 10:00')
    // Идущая бронь не дублируется в списке предстоящих
    const cards = within(screen.getByRole('list', { name: 'Предстоящие встречи' })).getAllByRole('listitem')
    expect(cards).toHaveLength(1)
    expect(cards[0]).toHaveTextContent('Ольга Смирнова')
    expect(current.compareDocumentPosition(cards[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('без идущего звонка карточки «Сейчас идёт» нет', async () => {
    stubOwnerApi({ upcoming: [wednesday] })

    renderApp('/owner/upcoming')

    await screen.findByRole('list', { name: 'Предстоящие встречи' })
    expect(screen.queryByRole('region', { name: '● Сейчас идёт' })).not.toBeInTheDocument()
    expect(screen.queryByText(/Сейчас идёт/)).not.toBeInTheDocument()
  })

  it('без предстоящих броней показывает «Предстоящих встреч нет» и счётчик (0)', async () => {
    stubOwnerApi({ upcoming: [] })

    renderApp('/owner/upcoming')

    expect(await screen.findByText(/Предстоящих встреч нет/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Предстоящие (0)' })).toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  it('идущая бронь без предстоящих: карточка «Сейчас идёт» и пустое состояние, счётчик (0)', async () => {
    stubOwnerApi({ current: ongoing, upcoming: [] })

    renderApp('/owner/upcoming')

    expect(await screen.findByRole('region', { name: '● Сейчас идёт' })).toBeInTheDocument()
    expect(screen.getByText(/Предстоящих встреч нет/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Предстоящие (0)' })).toBeInTheDocument()
  })

  it('во вкладке «Типы событий» тоже виден счётчик предстоящих; переход по вкладке открывает список', async () => {
    stubOwnerApi({ current: ongoing, upcoming: [thursday] })
    renderApp('/owner/event-types')

    await userEvent.click(await screen.findByRole('link', { name: 'Предстоящие (1)' }))

    const list = await screen.findByRole('list', { name: 'Предстоящие встречи' })
    expect(within(list).getByRole('listitem')).toHaveTextContent('Пётр Иванов')
  })

  it.each([
    ['данные Owner', 'GET /api/owner'],
    ['предстоящие Booking', 'GET /api/bookings/upcoming'],
  ])('сообщает об ошибке, если API не ответил: %s', async (_title, failedRoute) => {
    stubApi({
      'GET /api/owner': [200, owner],
      'GET /api/event-types': [200, eventTypes],
      'GET /api/bookings/upcoming': [200, { upcoming: [wednesday] }],
      [failedRoute]: [500, { code: 'INTERNAL_ERROR', message: 'Внутренняя ошибка сервера' }],
    })

    renderApp('/owner/upcoming')

    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось загрузить предстоящие встречи')
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })
})
