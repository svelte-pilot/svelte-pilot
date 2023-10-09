<script lang="ts" context="module">
  type Method = 'push' | 'replace' | null
  let defaultMethod: Method = 'push'

  export function setDefaultMethod(method: Method) {
    defaultMethod = method
  }
</script>

<script lang="ts">
  import isEqual from 'lodash-es/isEqual'
  import { getContext } from 'svelte'
  import { Writable } from 'svelte/store'
  import Router, { Route, Location } from './Router'
  import { CTX_ROUTE, CTX_ROUTER } from './ctxKeys'

  let className = ''

  const router: Router = getContext(CTX_ROUTER)
  const route: Writable<Route> = getContext(CTX_ROUTE)

  export { className as class }
  export let to: Location | string
  export let method = defaultMethod

  $: loc = router.parseLocation(to)
  $: active = loc.path === $route.path

  function onClick(e: Event) {
    if (method === null) {
      return
    }

    e.preventDefault()
    const current = $route

    const isSameLoc =
      loc.href === current.href &&
      isEqual(
        { ...loc.state, __position__: null },
        { ...current.state, __position__: null }
      )

    if (!isSameLoc) {
      if (method === 'replace') {
        router.replace(to)
      } else {
        router.push(to)
      }
    }
  }
</script>

<a
  href={loc.href}
  class="router-link {className}"
  class:router-link-active={active}
  on:click
  on:click={onClick}
  {...$$restProps}
>
  <slot />
</a>
