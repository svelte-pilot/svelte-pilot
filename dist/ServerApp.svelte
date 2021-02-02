<script>
  import { setContext } from 'svelte';
  import { writable } from 'svelte/store';
  import { CTX_CHILDREN, CTX_ROUTER, CTX_ROUTE } from './ctxKeys';
  import RouterView from './RouterView.svelte';

  export let router;
  export let route;
  export let preloadData = null;

  setContext(CTX_ROUTER, router);
  setContext(CTX_ROUTE, { subscribe: writable(route).subscribe });

  setContext(CTX_CHILDREN, {
    subscribe: writable({
      routerViews: route._routerViews,
      preloadData
    }).subscribe
  });
</script>

<RouterView />
