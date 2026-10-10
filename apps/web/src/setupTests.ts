// Подключает матчеры jest-dom (toBeInTheDocument и др.) к Vitest
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import { client } from '@/api/generated/client.gen.ts'

// Без `globals: true` RTL не регистрирует автоочистку сам: размонтируем
// отрисованное после каждого теста, иначе DOM копится между тестами файла.
afterEach(() => {
  cleanup()
})

// SDK строит запросы через `new Request('/api/...')`. В браузере относительный URL
// разрешается от адреса страницы, а Request из Node (jsdom его не подменяет) —
// нет, поэтому в тестах задаём базовый адрес явно.
client.setConfig({ baseUrl: window.location.origin })
