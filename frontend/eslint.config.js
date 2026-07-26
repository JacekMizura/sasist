import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'
import sasistUiKit from './eslint-plugins/sasist-ui-kit.js'

export default defineConfig([
  globalIgnores(['dist', 'eslint-plugins']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'sasist-ui-kit': sasistUiKit,
    },
    rules: {
      // Hard block for new magic chrome outside design-system (legacy facades allowlisted in plugin).
      'sasist-ui-kit/no-magic-tailwind': 'warn',
      'sasist-ui-kit/no-local-ui-token-file': 'error',
      // Warn while modules migrate off facades; promote to error after purge.
      'sasist-ui-kit/no-deprecated-facade-import': 'warn',
    },
  },
  {
    files: ['src/design-system/**/*.{ts,tsx}'],
    rules: {
      'react-refresh/only-export-components': 'off',
      // Inside the kit, magic classes are allowed — they ARE the tokens/components.
      'sasist-ui-kit/no-magic-tailwind': 'off',
      'sasist-ui-kit/no-deprecated-facade-import': 'off',
    },
  },
])
