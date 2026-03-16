module.exports = [
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        L: 'readonly',
        topojson: 'readonly',
        polylabel: 'readonly',
        CONFIG: 'readonly',
        state: 'readonly',
        document: 'readonly',
        window: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        navigator: 'readonly',
        URL: 'readonly',
        console: 'readonly',
        alert: 'readonly',
        confirm: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        Math: 'readonly',
        Date: 'readonly',
        Array: 'readonly',
        Object: 'readonly',
        Map: 'readonly',
        Set: 'readonly',
        Promise: 'readonly',
        fetch: 'readonly',
        FileReader: 'readonly',
        DOMParser: 'readonly'
      }
    },
    rules: {
      // 基本的なコード品質
      'no-unused-vars': 'warn',
      'no-undef': 'error',
      'no-console': 'off', // 開発中は許可
      'no-debugger': 'warn',
      'no-alert': 'off', // 必要な場合があるため
      
      // コードスタイル
      'indent': ['error', 2, { SwitchCase: 1 }],
      'quotes': ['error', 'single', { avoidEscape: true }],
      'semi': ['error', 'always'],
      'comma-dangle': ['error', 'never'],
      'no-trailing-spaces': 'error',
      'eol-last': 'error',
      
      // 最佳プラクティス
      'eqeqeq': ['error', 'always'],
      'no-var': 'error',
      'prefer-const': 'error',
      'prefer-arrow-callback': 'error',
      'arrow-spacing': 'error',
      'no-unused-expressions': 'error',
      
      // エラー防止
      'no-throw-literal': 'error',
      'no-catch-shadow': 'error',
      'no-delete-var': 'error',
      'no-label-var': 'error',
      'no-shadow': 'warn',
      'no-shadow-restricted-names': 'error',
      
      // JSDoc
      'valid-jsdoc': 'off', // JSDocはコメントとして扱う
      
      // ES6+
      'no-duplicate-imports': 'error',
      'no-useless-rename': 'error',
      'prefer-template': 'error',
      'template-curly-spacing': ['error', 'never'],
      
      // その他
      'curly': ['error', 'multi-line'],
      'dot-notation': 'error',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-iterator': 'error',
      'no-proto': 'error',
      'no-return-assign': 'error',
      'no-self-compare': 'error',
      'radix': 'error',
      'wrap-iife': ['error', 'any'],
      'yoda': 'error'
    }
  }
];