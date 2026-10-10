import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import App from './App.tsx'

// Общие помощники RTL-тестов: приложение целиком на нужном маршруте и подменённый API

export type StubResponse = [number, unknown]

// Подменяет глобальный fetch: ответы API задаются как «метод путь → [статус, тело]»
// или функцией от запроса (когда ответ зависит от тела или предыдущих запросов).
// Запросы при этом идут через настоящий сгенерированный SDK.
// Снять подмену — vi.unstubAllGlobals() в afterEach.
export function stubApi(routes: Record<string, StubResponse | ((request: Request) => Promise<StubResponse>)>) {
  const fetchMock = vi.fn(async (request: Request) => {
    const { pathname } = new URL(request.url)
    const route = routes[`${request.method} ${pathname}`]
    const [status, body] =
      typeof route === 'function'
        ? await route(request)
        : (route ?? [404, { code: 'NOT_FOUND', message: 'нет такого маршрута' }])
    return Response.json(body, { status })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

export function renderApp(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  )
}
