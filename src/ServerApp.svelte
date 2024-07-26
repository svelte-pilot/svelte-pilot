<script lang="ts">
  import { setContext } from 'svelte'
  import type { default as Router, Route } from './Router'
  import View from './View.svelte'
  import { CTX_NODE, CTX_ROUTE, CTX_ROUTER } from './ctxKeys'

  export let router: Router
  export let route: Route

  setContext(CTX_ROUTER, router)
  setContext(CTX_ROUTE, () => route)
  setContext(CTX_NODE, () => ({
    views: route._views,
    ssrState: route.ssrState
  }))
</script>

<View />
