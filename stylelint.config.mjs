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
