<script context="module">
  /**
   * @typedef {"push" | "replace" | null} Method
   */

  /**
   * @type {Method}
   */
  let defaultMethod = "push";

  /**
   * @param {Method} method
   */
  export function setDefaultMethod(method) {
    defaultMethod = method;
  }
</script>

<script>
  import isEqual from "lodash-es/isEqual";
  import { getContext } from "svelte";
  import { CTX_ROUTE, CTX_ROUTER } from "./ctxKeys";

  let className = "";

  /**
   * @type {import("./Router").default}
   */
  const router = getContext(CTX_ROUTER);

  /**
   * @type {import("svelte/store").Writable<import("./Router").Route>}
   */
  const route = getContext(CTX_ROUTE);

  export { className as class };

  /**
   * @type {import("./Router").Location | string}
   */
  export let to;

  /**
   * @type {Method}
   */
  export let method = defaultMethod;

  $: loc = router.parseLocation(to);
  $: active = loc.path === $route.path;

  /**
   * @param {Event} e
   */
  function onClick(e) {
    if (method === null) {
      return;
    }

    e.preventDefault();
    const current = $route;

    const isSameLoc =
      loc.href === current.href &&
      isEqual(
        { ...loc.state, __position__: null },
        { ...current.state, __position__: null }
      );

    if (!isSameLoc) {
      if (method === "replace") {
        router.replace(to);
      } else {
        router.push(to);
      }
    }
  }
</script>

<a
  href={loc.href}
  class="router-link {className}"
  class:router-link-active={active}
  on:click
  on:click={onClick}
  {...$$restProps}
>
  <slot />
</a>
