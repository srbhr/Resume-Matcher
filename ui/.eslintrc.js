module.exports = {
  env: {
    browser: true,
    es2021: true
  },
  extends: [
    'plugin:react/recommended',
    'next/core-web-vitals',
    'prettier',
    'plugin:tailwindcss/recommended'
  ],
  overrides: [
    {
      files: ['*.ts', '*.tsx'],
      extends: ['standard-with-typescript'],
      parserOptions: {
        project: 'tsconfig.json',
        tsconfigRootDir: __dirname,
        ecmaVersion: 'latest',
        sourceType: 'module',
        babelOptions: {
          presets: [require.resolve('next/babel')]
        }
      },
      rules: {
        '@typescript-eslint/no-unused-vars': ['error'],
        '@typescript-eslint/explicit-function-return-type': 'off',
        '@typescript-eslint/no-confusing-void-expression': 'off',
        '@typescript-eslint/semi': 'off',
        '@typescript-eslint/member-delimiter-style': 'off',
        '@typescript-eslint/space-before-function-paren': 'off'
      }
    }
  ],
  parser: '@typescript-eslint/parser',
  plugins: ['react', 'tailwindcss', 'react-hooks', '@typescript-eslint'],
  rules: {
    '@next/next/no-html-link-for-pages': 'off',
    'tailwindcss/no-custom-classname': 'off',
    'tailwindcss/classnames-order': 'error',
    'react-hooks/rules-of-hooks': 'error',
    'no-console': 'error',
    'no-var': 'error',
    'no-use-before-define': 'off',
    'react/jsx-curly-brace-presence': [
      'warn',
      { props: 'never', children: 'never' }
    ],
    'max-lines': [
      'error',
      { max: 500, skipBlankLines: false, skipComments: false }
    ],
    'react/jsx-uses-react': 'off',
    'react/react-in-jsx-scope': 'off'
    // "react-hooks/exhaustive-deps": "off"
  },
  settings: {
    tailwindcss: {
      callees: ['classnames', 'clsx', 'ctl'],
      config: 'tailwind.config.cjs'
    },
    next: {
      rootDir: ['ui/*']
    }
  },
  root: true
};
