/**
 * @fileoverview 统一工作区的类型检查、复杂度和 JSDoc 门禁。
 */

import js from '@eslint/js';
import nextPlugin from '@next/eslint-plugin-next';
import { defineConfig, globalIgnores } from 'eslint/config';
import importPlugin from 'eslint-plugin-import';
import jsdocPlugin from 'eslint-plugin-jsdoc';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const sourceFiles = ['**/*.{js,mjs,cjs,ts,mts,cts,tsx}'];
const typeScriptFiles = ['**/*.{ts,mts,cts,tsx}'];
const ignoredPaths = [
  '**/node_modules/**',
  '**/.next/**',
  '**/.turbo/**',
  '**/dist/**',
  '**/coverage/**',
  '**/playwright-report/**',
  '**/test-results/**',
  '**/next-env.d.ts',
];

const boundedCodeRules = {
  complexity: ['error', 10],
  'max-classes-per-file': ['error', 1],
  'max-depth': ['error', 4],
  'max-lines': ['error', { max: 400, skipBlankLines: false, skipComments: false }],
  'max-lines-per-function': [
    'error',
    { IIFEs: true, max: 50, skipBlankLines: false, skipComments: false },
  ],
  'max-params': ['error', 4],
  'no-console': 'error',
};

const documentationRules = {
  'jsdoc/require-file-overview': 'error',
  'jsdoc/require-jsdoc': [
    'error',
    {
      require: {
        ArrowFunctionExpression: true,
        ClassDeclaration: true,
        ClassExpression: true,
        FunctionDeclaration: true,
        FunctionExpression: true,
        MethodDefinition: true,
      },
    },
  ],
};

export default defineConfig([
  globalIgnores(ignoredPaths),
  {
    extends: [js.configs.recommended],
    files: sourceFiles,
    languageOptions: { globals: globals.node },
    plugins: { import: importPlugin, jsdoc: jsdocPlugin },
    rules: {
      ...boundedCodeRules,
      ...documentationRules,
      'import/no-cycle': 'error',
    },
    settings: { jsdoc: { tagNamePreference: { file: 'fileoverview' } } },
  },
  {
    extends: [...tseslint.configs.recommendedTypeChecked, ...tseslint.configs.stylisticTypeChecked],
    files: typeScriptFiles,
    languageOptions: {
      parserOptions: {
        project: [
          './tsconfig.json',
          './apps/*/tsconfig.json',
          './apps/*/tsconfig.spec.json',
          './packages/*/tsconfig.json',
        ],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      'no-undef': 'off',
    },
    settings: {
      'import/resolver': {
        typescript: {
          noWarnOnMultipleProjects: true,
          project: [
            'tsconfig.json',
            'apps/*/tsconfig.json',
            'apps/*/tsconfig.spec.json',
            'packages/*/tsconfig.json',
          ],
        },
      },
    },
  },
  {
    files: ['**/migrations/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-argument': 'off',
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: {
      '@next/next': nextPlugin,
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      ...reactPlugin.configs.recommended.rules,
      ...reactHooksPlugin.configs.recommended.rules,
      '@next/next/no-html-link-for-pages': 'off',
      'react/jsx-uses-react': 'off',
      'react/react-in-jsx-scope': 'off',
    },
    settings: { react: { version: 'detect' } },
  },
  /* 分层方向门禁：依赖只允许沿 app(shell) → features → shared 单向流动。 */
  {
    files: ['apps/web/src/features/**', 'apps/web/src/shared/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['**/app/**', '**/app'], message: 'features/shared 不得依赖 app 路由层' },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/web/src/shared/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['**/features/**'], message: 'shared 不得依赖 features' }] },
      ],
    },
  },
  {
    files: ['packages/*/src/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['**/apps/**'], message: '包不得依赖应用' }] },
      ],
    },
  },
  {
    files: ['apps/api/src/database/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['**/knowledge-bases/**'], message: '数据层不得依赖业务模块' }] },
      ],
    },
  },
]);
