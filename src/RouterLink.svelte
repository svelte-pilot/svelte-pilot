<script lang="ts">
  import isEqual from "lodash-es/isEqual";
  import { getContext } from "svelte";
  import { Writable } from "svelte/store";
  import { Location, Route, default as Router } from "./Router";
  import { CTX_ROUTE, CTX_ROUTER } from "./ctxKeys";

  let className = "";

  export { className as class };
  export let to: string | Location;
  export let replace = false;

  const router = getContext(CTX_ROUTER) as Router;
  const route = getContext(CTX_ROUTE) as Writable<Route>;

  $: loc = router.parseLocation(to);
  $: active = loc.path === $route.path;

  function onClick(e: Event) {
    e.preventDefault();
    const current = $route;

    const isSameLoc =
      loc.href === current.href &&
      isEqual(
        { ...loc.state, __position__: null },
        { ...current.state, __position__: null }
      );

    if (!isSameLoc) {
      if (replace) {
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
