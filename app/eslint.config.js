import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import importX from 'eslint-plugin-import-x'
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
    // Register the (maintained) import plugin under the `import` name so the existing
    // `// eslint-disable-next-line import/first` directives keep resolving. `import/first`
    // documents why specs place their imports after `vi.mock(...)` hoisting setup.
    plugins: {
      'react-hooks': reactHooks,
      import: importX
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'import/first': 'error',
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

  // Tests reference class methods unbound when wiring up mocks, and mocks/fixtures legitimately
  // traffic in `any` (vi.fn() return values, stubbed globals, cast partials). Enforcing the
  // no-unsafe-* / no-explicit-any family here is high-noise and low-value, so relax it for specs
  // only — real source stays strict.
  {
    files: ['**/*.spec.{ts,tsx}'],
    rules: {
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/require-await': 'off',
      'react-hooks/exhaustive-deps': 'off'
    }
  },

  // Must come last: turn off rules that conflict with Prettier formatting.
  prettier
)
