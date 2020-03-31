<svelte:component this={$view.component} {...$view.props}/>

<script>
import { getContext, setContext } from 'svelte'
import key from './key'
export let name
const view = getContext(key)[name]
</script>
