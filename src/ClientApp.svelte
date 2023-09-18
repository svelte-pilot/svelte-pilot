<script>
  import { setContext } from "svelte";
  import { writable } from "svelte/store";
  import View from "./View.svelte";
  import { CTX_CHILDREN, CTX_ROUTE, CTX_ROUTER } from "./ctxKeys";

  /**
   * @type {import("./Router").default}
   */
  export let router;

  const childrenStore = writable();
  const routeStore = writable();
  setContext(CTX_ROUTER, router);
  setContext(CTX_ROUTE, { subscribe: routeStore.subscribe });
  setContext(CTX_CHILDREN, { subscribe: childrenStore.subscribe });

  router.on("update", update);

  if (router.current) {
    update(router.current);
  }

  /**
   * @param {import("./Router").Route} route
   */
  function update(route) {
    childrenStore.set({
      views: route._views,
      ssrState: route.ssrState,
    });

    routeStore.set(route);
  }
</script>

<View />
