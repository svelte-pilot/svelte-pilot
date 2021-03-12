<script>
  import { getContext } from 'svelte';
  import isEqual from 'lodash-es/isEqual';
  import { CTX_ROUTER, CTX_ROUTE } from './ctxKeys';

  let className = '';
  export { className as class };
  export let style = '';
  export let to;
  export let replace = false;

  const router = getContext(CTX_ROUTER);
  const route = getContext(CTX_ROUTE);

  $: loc = router.parseLocation(to);
  $: active = loc.path === $route.path;

  function onClick(e) {
    e.preventDefault();
    const current = $route;

    const isSameLoc = loc.href === current.href &&
      isEqual({ ...loc.state, __position__: null }, { ...current.state, __position__: null });

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
  on:click={onClick}
  class="router-link {className}"
  class:router-link-active={active}
  {style}
  on:click
>
  <slot />
</a>
