import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import prettier from 'eslint-config-prettier'
import globals from 'globals'

// Flat config (ESLint 10). Migrated from the legacy `.eslintrc.cjs`.
export default tseslint.config(
  { ignores: ['dist/**', 'coverage/**'] },

  // Source: recommended + type-checked TypeScript rules, scoped to TS/TSX.
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      },
      globals: {
        ...globals.browser,
        ...globals.node
      }
    },
    plugins: {
      'react-hooks': reactHooks
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      '@typescript-eslint/no-unnecessary-type-assertion': 'warn',
      '@typescript-eslint/require-await': 'warn',
      '@typescript-eslint/no-misused-promises': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/naming-convention': [
        'warn',
        {
          selector: 'function',
          format: ['PascalCase', 'camelCase']
        }
      ]
    }
  },

  // Tests reference class methods unbound when wiring up mocks.
  {
    files: ['**/*.spec.{ts,tsx}'],
    rules: {
      '@typescript-eslint/unbound-method': 'off'
    }
  },

  // Must come last: turn off rules that conflict with Prettier formatting.
  prettier
)
