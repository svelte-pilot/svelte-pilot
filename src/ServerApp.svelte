<script lang="ts">
  import { setContext } from 'svelte'
  import { writable } from 'svelte/store'
  import Router, { Route } from './Router'
  import View from './View.svelte'
  import { CTX_CHILDREN, CTX_ROUTE, CTX_ROUTER } from './ctxKeys'

  export let router: Router
  export let route: Route

  setContext(CTX_ROUTER, router)
  setContext(CTX_ROUTE, { subscribe: writable(route).subscribe })

  setContext(CTX_CHILDREN, {
    subscribe: writable({
      views: route._views,
      ssrState: route.ssrState
    }).subscribe
  })
</script>

<View />
