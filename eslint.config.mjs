import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTypeScript from 'eslint-config-next/typescript'

const config = [
  ...nextVitals,
  ...nextTypeScript,
  {
    rules: {
      // Existing effects intentionally initialize local UI state synchronously.
      'react-hooks/set-state-in-effect': 'off',
    },
  },
]

export default config
