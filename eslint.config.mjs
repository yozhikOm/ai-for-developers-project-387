// @ts-check
import js from '@eslint/js'
import { defineConfig, globalIgnores } from 'eslint/config'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'
import tseslint from 'typescript-eslint'

// Единый flat config на всё монорепозиторий (ESLint 10, eslintrc-формат удалён).
export default defineConfig(
  // generated — код из `npm run generate` (ADR 0004): руками не правится,
  // поэтому правилам проекта следовать не обязан
  // test-results и playwright-report — вывод Playwright (npm run e2e)
  globalIgnores(['**/dist', '**/node_modules', '**/generated', 'test-results', 'playwright-report']),
  {
    files: ['**/*.{js,mjs,ts,tsx}'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.node,
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [tseslint.configs.recommended],
  },
  {
    // Специфика React-пакета: хуки и ограничения fast refresh
    files: ['apps/web/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat['recommended-latest'], reactRefresh.configs.vite],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    // Компоненты shadcn/ui — сгенерированный код, обновляемый через `shadcn add`.
    // Они намеренно экспортируют вместе с компонентом и variants-функцию (cva),
    // что конфликтует с react-refresh/only-export-components.
    files: ['apps/web/src/components/ui/**/*.{ts,tsx}'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
)
