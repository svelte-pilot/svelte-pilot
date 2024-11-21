<script lang='ts'>
  import { setContext } from 'svelte'

  import type {
    ResolvedView,
    Route,
    Router,
    SSRState,
  } from './Router'

  import { CTX_NODE, CTX_ROUTE, CTX_ROUTER } from './ctxKeys'
  import View from './View.svelte'

  type Node = { ssrState?: SSRState, views?: ResolvedView['children'] }

  const { router }: { router: Router } = $props()

  let node = $state<Node>()
  let routeState = $state<Route>()
  setContext(CTX_ROUTER, router)
  setContext(CTX_ROUTE, () => routeState)
  setContext(CTX_NODE, () => node)
  router.on('update', update)

  if (router.current) {
    update(router.current)
  }

  function update(route: Route) {
    node = {
      ssrState: route.ssrState,
      views: route._views,
    }

    routeState = route
  }
</script>

<View />
