import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderApp, stubApi } from './testing.tsx'

afterEach(() => {
  vi.unstubAllGlobals()
})

const owner = { name: 'Анна Смирнова', timezone: 'Europe/Moscow' }

const eventTypeWithDescription = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Знакомство',
  description: 'Короткий созвон, чтобы понять задачу',
  durationMinutes: 15,
  createdAt: '2026-10-01T09:00:00.000Z',
}

// Тип без описания: поля description в ответе нет вовсе
const eventTypeWithoutDescription = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Разбор проекта',
  durationMinutes: 60,
  createdAt: '2026-10-02T09:00:00.000Z',
}

describe('публичная страница Owner', () => {
  it('показывает имя Owner и EventType в порядке из API: название, описание и длительность', async () => {
    const fetchMock = stubApi({
      'GET /api/owner': [200, owner],
      'GET /api/event-types': [200, [eventTypeWithDescription, eventTypeWithoutDescription]],
    })

    renderApp('/')

    expect(await screen.findByRole('heading', { level: 1, name: 'Анна Смирнова' })).toBeInTheDocument()
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(within(items[0]).getByRole('heading', { name: 'Знакомство' })).toBeInTheDocument()
    expect(items[0]).toHaveTextContent('Короткий созвон, чтобы понять задачу')
    expect(items[0]).toHaveTextContent('15 мин')
    expect(within(items[1]).getByRole('heading', { name: 'Разбор проекта' })).toBeInTheDocument()
    expect(items[1]).toHaveTextContent('60 мин')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('у EventType без описания нет пустого блока', async () => {
    stubApi({
      'GET /api/owner': [200, owner],
      'GET /api/event-types': [200, [eventTypeWithoutDescription]],
    })

    renderApp('/')

    const item = await screen.findByRole('listitem')
    const emptyElements = Array.from(item.querySelectorAll('*')).filter(
      (element) => element instanceof HTMLElement && element.children.length === 0 && !element.textContent?.trim(),
    )
    expect(emptyElements).toEqual([])
  })

  it('без EventType сообщает, что форматов звонка сейчас нет', async () => {
    stubApi({
      'GET /api/owner': [200, owner],
      'GET /api/event-types': [200, []],
    })

    renderApp('/')

    expect(await screen.findByText('Сейчас нет доступных форматов звонка')).toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  it('по клику на EventType ведёт к выбору времени этого типа', async () => {
    const { id } = eventTypeWithoutDescription
    stubApi({
      'GET /api/owner': [200, owner],
      'GET /api/event-types': [200, [eventTypeWithDescription, eventTypeWithoutDescription]],
      [`GET /api/event-types/${id}`]: [200, eventTypeWithoutDescription],
      [`GET /api/event-types/${id}/slots`]: [200, []],
    })
    renderApp('/')

    const link = await screen.findByRole('link', { name: /Разбор проекта/ })
    expect(link).toHaveAttribute('href', `/booking/${id}`)

    await userEvent.click(link)

    const info = await screen.findByRole('region', { name: 'Информация' })
    expect(info).toHaveTextContent('Разбор проекта')
  })

  it.each([
    ['данные Owner', 'GET /api/owner'],
    ['список EventType', 'GET /api/event-types'],
  ])('сообщает об ошибке, если API не ответил: %s', async (_title, failedRoute) => {
    stubApi({
      'GET /api/owner': [200, owner],
      'GET /api/event-types': [200, [eventTypeWithDescription]],
      [failedRoute]: [500, { code: 'INTERNAL_ERROR', message: 'Внутренняя ошибка сервера' }],
    })

    renderApp('/')

    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось загрузить страницу')
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
  })
})

// Fake API с состоянием: тип, созданный POST-запросом, появляется в GET-списке
function stubApiWithEventTypes(initial: unknown[]) {
  const eventTypes = [...initial]
  const createdBodies: unknown[] = []
  const fetchMock = stubApi({
    'GET /api/owner': [200, owner],
    'GET /api/event-types': async () => [200, eventTypes],
    'GET /api/bookings/upcoming': [200, { upcoming: [] }],
    'POST /api/event-types': async (request) => {
      const body = await request.json()
      createdBodies.push(body)
      const eventType = {
        id: '33333333-3333-4333-8333-333333333333',
        ...body,
        createdAt: '2026-10-03T09:00:00.000Z',
      }
      eventTypes.push(eventType)
      return [201, eventType]
    },
  })
  return { fetchMock, createdBodies }
}

function postRequests(fetchMock: ReturnType<typeof stubApi>) {
  return fetchMock.mock.calls.filter(([request]) => request.method === 'POST')
}

async function openNewEventTypeScreen() {
  await userEvent.click(await screen.findByRole('link', { name: '+ Создать тип события' }))
  return screen.findByRole('heading', { name: 'Новый тип события' })
}

describe('раздел Owner: типы событий', () => {
  it('ссылка «Вход для владельца» ведёт в раздел Owner, вкладка «Типы событий» открывается из него', async () => {
    stubApiWithEventTypes([eventTypeWithDescription])
    renderApp('/')

    await userEvent.click(await screen.findByRole('link', { name: 'Вход для владельца' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Кабинет владельца' })).toBeInTheDocument()
    await userEvent.click(await screen.findByRole('link', { name: 'Типы событий (1)' }))

    expect(screen.getByRole('link', { name: 'Типы событий (1)' })).toHaveAttribute('aria-current', 'page')
    expect(await screen.findByRole('link', { name: 'Предстоящие (0)' })).not.toHaveAttribute('aria-current')
    expect(await screen.findByRole('table')).toHaveTextContent('Знакомство')
  })

  it('показывает счётчик во вкладке и таблицу: название, описание или «—», длительность', async () => {
    stubApiWithEventTypes([eventTypeWithDescription, eventTypeWithoutDescription])

    renderApp('/owner/event-types')

    expect(await screen.findByRole('link', { name: 'Типы событий (2)' })).toBeInTheDocument()
    const [, ...rows] = screen.getAllByRole('row')
    expect(rows).toHaveLength(2)
    expect(within(rows[0]).getAllByRole('cell').map((cell) => cell.textContent)).toEqual([
      'Знакомство',
      'Короткий созвон, чтобы понять задачу',
      '15 мин',
    ])
    expect(within(rows[1]).getAllByRole('cell').map((cell) => cell.textContent)).toEqual([
      'Разбор проекта',
      '—',
      '60 мин',
    ])
  })

  it('без EventType предупреждает, что гостям нечего бронировать', async () => {
    stubApiWithEventTypes([])

    renderApp('/owner/event-types')

    expect(await screen.findByText(/гости не смогут записаться/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Типы событий (0)' })).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('«+ Создать тип события» открывает отдельный экран, «Создать» возвращает к списку с подсвеченным новым типом', async () => {
    const { createdBodies } = stubApiWithEventTypes([eventTypeWithDescription])
    renderApp('/owner/event-types')

    await openNewEventTypeScreen()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()

    await userEvent.type(screen.getByLabelText('Название'), '  Консультация  ')
    await userEvent.type(screen.getByLabelText(/Описание/), '   ')
    const duration = screen.getByLabelText(/Длительность/)
    await userEvent.clear(duration)
    await userEvent.type(duration, '45')
    await userEvent.click(screen.getByRole('button', { name: 'Создать' }))

    expect(await screen.findByRole('link', { name: 'Типы событий (2)' })).toBeInTheDocument()
    // На сервер уходят обрезанные значения, пустое описание не отправляется
    expect(createdBodies).toEqual([{ name: 'Консультация', durationMinutes: 45 }])
    const [, first, created] = screen.getAllByRole('row')
    expect(within(created).getByText('Новый')).toBeInTheDocument()
    expect(created).toHaveTextContent('Консультация')
    expect(within(first).queryByText('Новый')).not.toBeInTheDocument()
  })

  it('созданный тип виден на публичной странице', async () => {
    stubApiWithEventTypes([])
    renderApp('/owner/event-types/new')

    await userEvent.type(await screen.findByLabelText('Название'), 'Консультация')
    await userEvent.click(screen.getByRole('button', { name: 'Создать' }))
    await screen.findByRole('link', { name: 'Типы событий (1)' })
    await userEvent.click(screen.getByRole('link', { name: 'Публичная страница' }))

    expect(await screen.findByRole('link', { name: /Консультация/ })).toBeInTheDocument()
  })

  it('«Отмена» возвращает к списку без изменений', async () => {
    const { fetchMock } = stubApiWithEventTypes([eventTypeWithDescription])
    renderApp('/owner/event-types')
    await openNewEventTypeScreen()

    await userEvent.type(screen.getByLabelText('Название'), 'Черновик')
    await userEvent.click(screen.getByRole('link', { name: 'Отмена' }))

    expect(await screen.findByRole('link', { name: 'Типы событий (1)' })).toBeInTheDocument()
    expect(screen.getAllByRole('row')).toHaveLength(2)
    expect(screen.queryByText('Новый')).not.toBeInTheDocument()
    expect(postRequests(fetchMock)).toEqual([])
  })

  it.each<[string, { name?: string; description?: string; duration?: string }, string | RegExp, string]>([
    ['пустое название', { name: '' }, 'Название', 'Укажите название'],
    ['название из одних пробелов', { name: '   ' }, 'Название', 'Укажите название'],
    ['название длиннее 100', { name: 'н'.repeat(101) }, 'Название', 'Не длиннее 100 символов'],
    ['описание длиннее 500', { description: 'о'.repeat(501) }, /Описание/, 'Не длиннее 500 символов'],
    ['пустая длительность', { duration: '' }, /Длительность/, 'Укажите длительность'],
    ['длительность 0', { duration: '0' }, /Длительность/, 'От 15 до 540 минут, кратно 15'],
    ['длительность 555', { duration: '555' }, /Длительность/, 'От 15 до 540 минут, кратно 15'],
    ['длительность 600', { duration: '600' }, /Длительность/, 'От 15 до 540 минут, кратно 15'],
  ])('показывает ошибку под полем и не отправляет форму: %s', async (_title, values, field, message) => {
    const { fetchMock } = stubApiWithEventTypes([])
    renderApp('/owner/event-types/new')
    const { name = 'Звонок', description = '', duration = '30' } = values

    await screen.findByRole('heading', { name: 'Новый тип события' })
    // Текст вставляем целиком, а не печатаем посимвольно: длинные значения так быстрее
    if (name) {
      await userEvent.click(screen.getByLabelText('Название'))
      await userEvent.paste(name)
    }
    if (description) {
      await userEvent.click(screen.getByLabelText(/Описание/))
      await userEvent.paste(description)
    }
    const durationInput = screen.getByLabelText(/Длительность/)
    await userEvent.clear(durationInput)
    if (duration) await userEvent.type(durationInput, duration)
    await userEvent.click(screen.getByRole('button', { name: 'Создать' }))

    expect(screen.getByLabelText(field)).toHaveAccessibleDescription(message)
    expect(screen.getByLabelText(field)).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('heading', { name: 'Новый тип события' })).toBeInTheDocument()
    expect(postRequests(fetchMock)).toEqual([])
  })

  it('ошибка исчезает, когда поле исправлено', async () => {
    stubApiWithEventTypes([])
    renderApp('/owner/event-types/new')
    await userEvent.click(await screen.findByRole('button', { name: 'Создать' }))
    const name = screen.getByLabelText('Название')
    expect(name).toHaveAccessibleDescription('Укажите название')

    await userEvent.type(name, 'Звонок')

    expect(name).not.toHaveAccessibleDescription()
    expect(name).not.toHaveAttribute('aria-invalid', 'true')
  })

  it('отказ сервера показывает общее сообщение формы', async () => {
    stubApi({
      'POST /api/event-types': [400, { code: 'VALIDATION_ERROR', message: 'Длительность должна быть кратна 15 минутам' }],
    })
    renderApp('/owner/event-types/new')

    await userEvent.type(await screen.findByLabelText('Название'), 'Звонок')
    await userEvent.click(screen.getByRole('button', { name: 'Создать' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось создать тип события')
    expect(screen.getByRole('heading', { name: 'Новый тип события' })).toBeInTheDocument()
  })
})
