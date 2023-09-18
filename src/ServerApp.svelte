<script>
  import { setContext } from "svelte";
  import { writable } from "svelte/store";
  import View from "./View.svelte";
  import { CTX_CHILDREN, CTX_ROUTE, CTX_ROUTER } from "./ctxKeys";

  /**
   * @type {import("./Router").default)}
   */
  export let router;

  /**
   * @type {import("./Router").Route}
   */
  export let route;

  setContext(CTX_ROUTER, router);
  setContext(CTX_ROUTE, { subscribe: writable(route).subscribe });

  setContext(CTX_CHILDREN, {
    subscribe: writable({
      views: route._views,
      ssrState: route.ssrState,
    }).subscribe,
  });
</script>

<View />
