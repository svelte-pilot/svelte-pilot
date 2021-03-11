<script>
  import { getContext, setContext, onDestroy } from 'svelte';
  import { writable } from 'svelte/store';
  import { CTX_CHILDREN } from './ctxKeys';

  export let name = 'default';

  let view, props;
  const parentStore = getContext(CTX_CHILDREN);
  const childrenStore = writable();
  setContext(CTX_CHILDREN, { subscribe: childrenStore.subscribe });

  const unsubscribe = parentStore.subscribe(({ routerViews, ssrState } = {}) => {
    view = routerViews?.[name];

    props = {
      ...view?.props,
      ...ssrState?.[name].data
    };

    childrenStore.set({
      routerViews: view?.children,
      ssrState: ssrState?.[name].children
    });
  });

  onDestroy(unsubscribe);
</script>

{#if view}
  {#key view.key}
    <svelte:component this={view.component.default || view.component} {...props} />
  {/key}
{/if}
