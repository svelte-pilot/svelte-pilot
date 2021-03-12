<script>
  import { setContext } from 'svelte';
  import { writable } from 'svelte/store';
  import RouterView from './RouterView.svelte';
  import { CTX_CHILDREN, CTX_ROUTER, CTX_ROUTE } from './ctxKeys';

  export let router;
  export let ssrState = null;

  const childrenStore = writable();
  const routeStore = writable();
  setContext(CTX_ROUTER, router);
  setContext(CTX_ROUTE, { subscribe: routeStore.subscribe });
  setContext(CTX_CHILDREN, { subscribe: childrenStore.subscribe });
  router.on('update', update);

  if (router.current) {
    update(router.current);
  }

  let updateCount = 0;

  function update(route) {
    updateCount++;

    if (ssrState && updateCount === 2) {
      Object.keys(ssrState).forEach(k => delete ssrState[k]);
      ssrState = null;
    }

    childrenStore.set({
      routerViews: route._routerViews,
      ssrState
    });

    routeStore.set(route);
  }
</script>

<RouterView />
