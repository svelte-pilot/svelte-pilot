import antfu from '@antfu/eslint-config'
import perfectionist from 'eslint-plugin-perfectionist'

export default antfu(
  {
    svelte: true,
  },
  {
    rules: perfectionist.configs['recommended-natural'].rules,
  },
)
