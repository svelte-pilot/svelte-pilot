<script lang='ts'>
  import { setContext } from 'svelte'

  import type { Route, Router } from './Router'

  import { CTX_NODE, CTX_ROUTE, CTX_ROUTER } from './ctxKeys'
  import View from './View.svelte'

  export let router: Router
  export let route: Route

  setContext(CTX_ROUTER, router)
  setContext(CTX_ROUTE, () => route)
  setContext(CTX_NODE, () => ({
    ssrState: route.ssrState,
    views: route._views,
  }))
</script>

<View />
