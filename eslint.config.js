import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'reference', 'public', 'node_modules', 'src/content/generated'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // The engine must stay pure and deterministic: no rendering, UI, DOM, or wall-clock randomness.
    files: ['src/engine/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            'three',
            'three/*',
            'preact',
            'preact/*',
            '**/render/**',
            '**/ui/**',
            '**/app/**',
            '**/platform/**',
          ],
        },
      ],
      'no-restricted-globals': ['error', 'window', 'document', 'localStorage', 'performance'],
      'no-restricted-properties': ['error', { object: 'Math', property: 'random', message: 'Use the seeded Random.' }],
    },
  },
);
