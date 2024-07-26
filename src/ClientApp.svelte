<script lang="ts">
  import type {
    default as Router,
    Route,
    ResolvedView,
    SSRState
  } from './Router'
  import { setContext } from 'svelte'
  import View from './View.svelte'
  import { CTX_NODE, CTX_ROUTE, CTX_ROUTER } from './ctxKeys'

  type Node = { views?: ResolvedView['children']; ssrState?: SSRState }

  let { router }: { router: Router } = $props()

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
      views: route._views,
      ssrState: route.ssrState
    }

    routeState = route
  }
</script>

<View />
