import nextVitals from 'eslint-config-next/core-web-vitals'

const config = [
  {
    ignores: ['.claude/**'],
  },
  ...nextVitals,
  {
    files: ['app/**/*.{ts,tsx}', 'lib/**/*.{ts,tsx}'],
    rules: {
      'no-console': 'error',
    },
  },
  {
    // The structured logger is the one place console.* is allowed — it IS the sink.
    files: ['lib/log/index.ts'],
    rules: {
      'no-console': 'off',
    },
  },
]

export default config
