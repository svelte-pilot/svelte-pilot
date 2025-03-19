<script lang='ts' module>
  type Method = 'push' | 'replace' | null

  type Options = {
    activeClass?: string
    class?: string
    method?: Method
    origin?: string | string[]
  }

  export const options: Options = {
    activeClass: 'router-link-active',
    class: 'router-link',
    method: 'push',
  }

  export function setOptions(opts: Options) {
    Object.assign(options, opts)
  }
</script>

<script lang='ts'>
  import type { Snippet } from 'svelte'
  import type { HTMLAnchorAttributes } from 'svelte/elements'

  import isEqual from 'lodash-es/isEqual'
  import { getContext } from 'svelte'

  import type {
    Location,
    ParsedLocation,
    Route,
    Router,
  } from './Router'

  import { CTX_ROUTE, CTX_ROUTER } from './ctxKeys'

  const router: Router = getContext(CTX_ROUTER)
  const route: () => Route = getContext(CTX_ROUTE)

  let {
    activeClass = options.activeClass,
    children,
    class: className = options.class,
    method = options.method,
    onclick: _onclick,
    to,
    ...rest
  }: HTMLAnchorAttributes & {
    activeClass?: string
    children: Snippet
    class?: string
    method?: Method
    onclick?: (e: Event) => void
    to: Location | string
  } = $props()

  let { _class, href, loc } = $derived.by(() => {
    let loc: ParsedLocation | undefined
    let href: string

    if (isExternalUrl(to)) {
      loc = undefined
      href = to
    }
    else {
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
    return { _class, active, href, loc }
  })

  function isExternalUrl(to: Location | string): to is string {
    if (to.constructor === String && /\w+:/.test(to)) {
      if (!options.origin?.length) {
        return true
      }
      else if (Array.isArray(options.origin)) {
        return !options.origin.some(o => to.startsWith(o))
      }
      else {
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

    const isSameLoc
      = loc.href === current.href
        && isEqual(
          { ...loc.state, __position__: null },
          { ...current.state, __position__: null },
        )

    if (!isSameLoc) {
      if (method === 'replace') {
        router.replace(to)
      }
      else {
        router.push(to)
      }
    }

    if (_onclick) {
      _onclick(e)
    }
  }
</script>

<a {href} class={_class} {onclick} {...rest}>
  {@render children()}
</a>
