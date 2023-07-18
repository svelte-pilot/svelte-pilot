<script lang="ts">
  import { setContext } from "svelte";
  import { writable } from "svelte/store";
  import { Route, default as Router, SSRState } from "./Router";
  import RouterView from "./RouterView.svelte";
  import { CTX_CHILDREN, CTX_ROUTE, CTX_ROUTER } from "./ctxKeys";

  export let router: Router;
  export let ssrState: SSRState | null | undefined = null;

  const childrenStore = writable();
  const routeStore = writable();
  setContext(CTX_ROUTER, router);
  setContext(CTX_ROUTE, { subscribe: routeStore.subscribe });
  setContext(CTX_CHILDREN, { subscribe: childrenStore.subscribe });

  let removeSSRState = false;
  router.on("update", update);

  if (router.current) {
    update(router.current);
  }

  function update(route: Route) {
    if (ssrState) {
      if (removeSSRState) {
        Object.keys(ssrState).forEach((k) => delete (ssrState as SSRState)[k]);
        ssrState = null;
      } else {
        removeSSRState = true;
      }
    }

    childrenStore.set({
      routerViews: route._routerViews,
      ssrState,
    });

    routeStore.set(route);
  }
</script>

<RouterView />
