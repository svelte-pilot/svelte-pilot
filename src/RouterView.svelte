<script lang="ts">
  import { SvelteComponent, getContext, onDestroy, setContext } from "svelte";
  import { Readable, Writable, writable } from "svelte/store";
  import {
    ComponentModule,
    RouteProps,
    ResolvedView,
    SSRStateTree,
  } from "./Router";
  import { CTX_CHILDREN } from "./ctxKeys";

  export let name = "default";

  type Node = {
    views?: ResolvedView["children"];
    ssrState?: SSRStateTree;
  };

  let view: ResolvedView | undefined;
  let component: typeof SvelteComponent | undefined;
  let props: RouteProps;
  const parentStore: Readable<Node> = getContext(CTX_CHILDREN);
  const childrenStore: Writable<Node> = writable();
  setContext(CTX_CHILDREN, { subscribe: childrenStore.subscribe });

  const unsubscribe = parentStore.subscribe(({ views, ssrState } = {}) => {
    view = views?.[name];

    component =
      (view?.component as ComponentModule | undefined)?.default ||
      (view?.component as typeof SvelteComponent | undefined);

    props = {
      ...view?.props,
      ...ssrState?.[name].data,
    };

    childrenStore.set({
      views: view?.children,
      ssrState: ssrState?.[name].children,
    });
  });

  onDestroy(unsubscribe);
</script>

{#if view && component}
  {#key view.key}
    <svelte:component this={component} {...props} />
  {/key}
{/if}
