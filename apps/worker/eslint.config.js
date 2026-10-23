import globals from "globals"
import { config as baseConfig } from "@workspace/eslint-config/base"

export default [
  ...baseConfig,
  {
    languageOptions: {
      globals: globals.node,
    },
  },
]
