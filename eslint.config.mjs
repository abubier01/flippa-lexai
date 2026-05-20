import nextVitals from 'eslint-config-next/core-web-vitals'

const config = [
  {
    ignores: ['.claude/**'],
  },
  ...nextVitals,
]

export default config
