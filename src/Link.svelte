<script lang="ts" context="module">
  type Method = 'push' | 'replace' | null

  type Options = {
    method?: Method
    class?: string
    activeClass?: string
    origin?: string | string[]
  }

  export const options: Options = {
    method: 'push',
    class: 'router-link',
    activeClass: 'router-link-active'
  }

  export function setOptions(opts: Options) {
    Object.assign(options, opts)
  }
</script>

<script lang="ts">
  import isEqual from 'lodash-es/isEqual'
  import { getContext } from 'svelte'
  import { Writable } from 'svelte/store'
  import type {
    default as Router,
    Route,
    Location,
    ParsedLocation
  } from './Router'
  import { CTX_ROUTE, CTX_ROUTER } from './ctxKeys'

  const router: Router = getContext(CTX_ROUTER)
  const route: Writable<Route> = getContext(CTX_ROUTE)

  let className = options.class
  export { className as class }
  export let activeClass = options.activeClass
  export let to: Location | string
  export let method = options.method

  let href = ''
  let loc: ParsedLocation | undefined
  let _class: string | undefined

  $: active = loc?.path === $route.path

  $: {
    const cls = []

    if (className) {
      cls.push(className)
    }

    if (active && activeClass) {
      cls.push(activeClass)
    }

    _class = cls.length ? cls.join(' ') : undefined
  }

  $: {
    if (isExternalUrl(to)) {
      loc = undefined
      href = to
    } else {
      loc = router.parseLocation(to)
      href = loc.href
    }
  }

  function isExternalUrl(to: Location | string): to is string {
    if (to.constructor === String && /\w+:/.test(to)) {
      if (!options.origin) {
        return true
      } else if (Array.isArray(options.origin)) {
        return !options.origin.some(o => to.startsWith(o))
      } else {
        return !to.startsWith(options.origin)
      }
    }

    return false
  }

  function onClick(e: Event) {
    if (!method || !loc || !router.test(to)) {
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

<a {href} class={_class} on:click on:click={onClick} {...$$restProps}>
  <slot />
</a>
