/* eslint-env node */
module.exports = {
  root: true,
  env: { browser: true, es2022: true },
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } },
  plugins: ['@typescript-eslint', 'import', 'react-hooks'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended', 'plugin:import/typescript'],
  settings: {
    'import/resolver': {
      typescript: { project: './tsconfig.app.json' },
      node: { extensions: ['.js', '.jsx', '.ts', '.tsx'] },
    },
  },
  ignorePatterns: ['dist', 'node_modules', '*.config.js', '*.config.ts', '.eslintrc.cjs'],
  rules: {
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'error',
    'no-restricted-syntax': [
      'error',
      {
        selector: "BinaryExpression[operator='<='][left.property.name='daysRemaining']",
        message: 'Cấm so sánh daysRemaining trực tiếp — dùng timeline.mode (CLAUDE.md §4.2).',
      },
    ],
  },
  overrides: [
    {
      // arch §3 — luật phụ thuộc một chiều.
      files: ['src/engines/**/*.ts'],
      rules: {
        'no-restricted-imports': [
          'error',
          { patterns: ['@/ui/*', '@/app/*', '@/storage/*'] },
        ],
      },
    },
    {
      files: ['src/content/**/*.ts'],
      rules: { 'no-restricted-imports': ['error', { patterns: ['@/storage/*', '@/app/*', '@/ui/*'] }] },
    },
    {
      files: ['src/domain/**/*.ts'],
      rules: {
        'no-restricted-imports': [
          'error',
          { patterns: ['@/config/*', '@/content/*', '@/storage/*', '@/app/*', '@/ui/*', '@/engines/*'] },
        ],
      },
    },
    {
      files: ['**/*.test.ts', '**/*.test.tsx', 'src/test-setup.ts'],
      env: { node: true },
      rules: { '@typescript-eslint/no-explicit-any': 'off' },
    },
  ],
};
