<script lang="ts">
  import { getContext, setContext, onDestroy } from 'svelte';
  import { SvelteComponent } from 'svelte';
  import { writable } from 'svelte/store';
  import type { Writable, Readable } from 'svelte/store';
  import { CTX_CHILDREN } from './ctxKeys';
  import type { RouterViewResolved, ComponentModule, RouteProps, SSRState } from './Router';

  export let name = 'default';

  type Node = {
    routerViews?: RouterViewResolved['children'],
    ssrState?: SSRState
  };

  let view: RouterViewResolved | undefined;
  let component: typeof SvelteComponent | undefined;
  let props: RouteProps;
  const parentStore: Readable<Node> = getContext(CTX_CHILDREN);
  const childrenStore: Writable<Node> = writable();
  setContext(CTX_CHILDREN, { subscribe: childrenStore.subscribe });

  const unsubscribe = parentStore.subscribe(({ routerViews, ssrState } = {}) => {
    view = routerViews?.[name];

    component = (view?.component as ComponentModule | undefined)?.default ||
      view?.component as typeof SvelteComponent | undefined;

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

{#if view && component}
  {#key view.key}
    <svelte:component this={component} {...props} />
  {/key}
{/if}
