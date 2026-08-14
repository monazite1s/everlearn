/**
 * @fileoverview 统一 CSS Modules 结构和语义化设计令牌用法。
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
  ],
  plugins: ['stylelint-declaration-strict-value'],
  rules: {
    'declaration-no-important': true,
    // 允许 Mantine 官方 mantine-{Component}-{part} 命名（用于 globals.css 的浮层 reduced-motion 兜底）。
    'selector-class-pattern': '^(?:[a-z][a-z0-9]*)(?:-[a-z0-9]+)*$|^mantine-[A-Za-z][A-Za-z0-9-]*$',
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
