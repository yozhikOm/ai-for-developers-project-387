import { defineConfig } from '@hey-api/openapi-ts'

// Второй шаг `npm run generate`: OpenAPI из contract/ → TS-код для потребителей (ADR 0004).
// `module.extension: '.ts'` обязателен: backend работает на нативном type stripping
// Node, который не переписывает импорты `.js` → `.ts`.
const input = './contract/generated/openapi.yaml'

export default defineConfig([
  {
    // fetch-SDK для frontend: рантайм клиента вшит в сгенерированный код
    input,
    output: { path: './apps/web/src/api/generated', module: { extension: '.ts' }, source: false },
    plugins: ['@hey-api/client-fetch', '@hey-api/typescript', '@hey-api/sdk'],
  },
  {
    // Типы обработчиков Fastify и копия спеки (source.json): по ней
    // fastify-openapi-glue регистрирует маршруты, не выходя за пределы apps/api
    input,
    output: { path: './apps/api/src/generated', module: { extension: '.ts' }, source: true },
    plugins: ['@hey-api/typescript', 'fastify'],
  },
])
