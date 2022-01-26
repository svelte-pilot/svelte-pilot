<script lang="ts">
  import { setContext } from 'svelte';
  import { writable } from 'svelte/store';
  import { CTX_CHILDREN, CTX_ROUTER, CTX_ROUTE } from './ctxKeys';
  import RouterView from './RouterView.svelte';
  import type { default as Router, Route, SSRState } from './Router';

  export let router: Router;
  export let route: Route;
  export let ssrState: SSRState | null = null;

  setContext(CTX_ROUTER, router);
  setContext(CTX_ROUTE, { subscribe: writable(route).subscribe });

  setContext(CTX_CHILDREN, {
    subscribe: writable({
      routerViews: route._routerViews,
      ssrState
    }).subscribe
  });
</script>

<RouterView />
