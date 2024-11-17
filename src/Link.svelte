<script lang="ts" module>
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
  import { getContext, type Snippet } from 'svelte'
  import type {
    default as Router,
    Route,
    Location,
    ParsedLocation
  } from './Router'
  import { CTX_ROUTE, CTX_ROUTER } from './ctxKeys'

  const router: Router = getContext(CTX_ROUTER)
  const route: () => Route = getContext(CTX_ROUTE)

  let {
    class: className,
    activeClass,
    to,
    method,
    onclick: _onclick,
    children,
    ...props
  }: {
    class?: string
    activeClass?: string
    to: Location | string
    method?: Method
    onclick?: (e: Event) => void
    children: Snippet
  } = $props()

  let { loc, href, _class, active } = $derived.by(() => {
    let loc: ParsedLocation | undefined
    let href: string

    if (isExternalUrl(to)) {
      loc = undefined
      href = to
    } else {
      loc = router.parseLocation(to)
      href = loc.href
    }

    const active = loc?.path === route().path
    const cls = []

    if (className) {
      cls.push(className)
    }

    if (active && activeClass) {
      cls.push(activeClass)
    }

    const _class = cls.length ? cls.join(' ') : undefined
    return { href, loc, _class, active }
  })

  function isExternalUrl(to: Location | string): to is string {
    if (to.constructor === String && /\w+:/.test(to)) {
      if (!options.origin?.length) {
        return true
      } else if (Array.isArray(options.origin)) {
        return !options.origin.some(o => to.startsWith(o))
      } else {
        return !to.startsWith(options.origin)
      }
    }

    return false
  }

  function onclick(e: Event) {
    if (!method || !loc || !router.test(to)) {
      return
    }

    e.preventDefault()
    const current = route()

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

    if (_onclick) {
      _onclick(e)
    }
  }
</script>

<a {href} class={_class} {onclick} {...props}>
  {@render children()}
</a>
