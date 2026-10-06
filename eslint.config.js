// Correctness checks only: formatting and style are left as they are.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/', '.claude/', 'tools/audio/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      // The compiler already reports unused names (noUnusedLocals / noUnusedParameters).
      '@typescript-eslint/no-unused-vars': 'off',
      // `!` is used where the markup was just written by the same function.
      '@typescript-eslint/no-non-null-assertion': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
      eqeqeq: ['error', 'smart'],
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },
  { files: ['tools/**/*.mjs', '*.config.{js,ts}', 'e2e/**/*.ts'], languageOptions: { globals: { ...globals.node } } },
);
