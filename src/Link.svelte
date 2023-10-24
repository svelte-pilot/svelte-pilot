<script lang="ts" context="module">
  type Method = 'push' | 'replace' | null

  type Options = {
    method: Method
    class: string
    activeClass: string
  }

  export const options: Options = {
    method: 'push',
    class: 'router-link',
    activeClass: 'router-link-active'
  }

  export function setOptions(opts: Partial<Options>) {
    Object.assign(options, opts)
  }
</script>

<script lang="ts">
  import isEqual from 'lodash-es/isEqual'
  import { getContext } from 'svelte'
  import { Writable } from 'svelte/store'
  import Router, { Route, Location } from './Router'
  import { CTX_ROUTE, CTX_ROUTER } from './ctxKeys'

  let className = options.class

  const router: Router = getContext(CTX_ROUTER)
  const route: Writable<Route> = getContext(CTX_ROUTE)

  export { className as class }
  export let activeClass = options.activeClass
  export let to: Location | string
  export let method = options.method

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
  class="{className} {active ? activeClass : ''}"
  on:click
  on:click={onClick}
  {...$$restProps}
>
  <slot />
</a>
