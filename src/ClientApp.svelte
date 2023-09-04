<script lang="ts">
  import { setContext } from "svelte";
  import { writable } from "svelte/store";
  import { Route, default as Router } from "./Router";
  import RouterView from "./RouterView.svelte";
  import { CTX_CHILDREN, CTX_ROUTE, CTX_ROUTER } from "./ctxKeys";

  export let router: Router;

  const childrenStore = writable();
  const routeStore = writable();
  setContext(CTX_ROUTER, router);
  setContext(CTX_ROUTE, { subscribe: routeStore.subscribe });
  setContext(CTX_CHILDREN, { subscribe: childrenStore.subscribe });

  router.on("update", update);

  if (router.current) {
    update(router.current);
  }

  function update(route: Route) {
    childrenStore.set({
      routerViews: route._routerViews,
      ssrState: route.ssrState,
    });

    routeStore.set(route);
  }
</script>

<RouterView />
