/**
 * @fileoverview 校验存量 CSS Modules 的结构与语义令牌用法（ADR 001 迁移期过渡门禁）。
 */

export default {
  extends: ['stylelint-config-standard', 'stylelint-config-css-modules'],
  ignoreFiles: [
    '**/node_modules/**',
    '**/.next/**',
    '**/dist/**',
    '**/coverage/**',
    '**/playwright-report/**',
    '**/test-results/**',
    '**/blob-report/**',
    // Tailwind 主题入口与 shadcn vendored 源码由 check-design-tokens 与 CLI 治理，不经 stylelint。
    'packages/ui/src/**',
    'apps/web/src/app/globals.css',
  ],
  plugins: ['stylelint-declaration-strict-value'],
  rules: {
    'declaration-no-important': true,
    'selector-class-pattern': '^(?:[a-z][a-z0-9]*)(?:-[a-z0-9]+)*$',
    'max-nesting-depth': 3,
    'scale-unlimited/declaration-strict-value': [
      [
        '/color$/',
        '/^margin(?:-.+)?$/',
        '/^padding(?:-.+)?$/',
        '/^(?:column-|row-)?gap$/',
        '/^border(?:-.+)?-radius$/',
        'border-radius',
        'box-shadow',
        'animation-duration',
        'transition-duration',
      ],
      {
        ignoreFunctions: false,
        ignoreValues: [
          '0',
          'currentcolor',
          'inherit',
          'initial',
          'none',
          'revert',
          'revert-layer',
          'transparent',
          'unset',
        ],
      },
    ],
    'selector-max-compound-selectors': 3,
  },
};
