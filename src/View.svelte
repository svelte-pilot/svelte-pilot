<script lang="ts">
  import { getContext, onDestroy, setContext, ComponentType } from "svelte";
  import { writable, Readable, Writable } from "svelte/store";
  import { ResolvedView, SSRState, RouteProps } from "./Router";
  import { CTX_CHILDREN } from "./ctxKeys";

  type Node = { views?: ResolvedView["children"]; ssrState?: SSRState };

  export let name = "default";

  let view: ResolvedView | undefined;
  let component: ComponentType | undefined;
  let props: RouteProps;
  const parentStore: Readable<Node> = getContext(CTX_CHILDREN);
  const childrenStore: Writable<Node> = writable();

  setContext(CTX_CHILDREN, { subscribe: childrenStore.subscribe });

  const unsubscribe = parentStore.subscribe(({ views, ssrState } = {}) => {
    view = views?.[name];

    component =
      view?.component && "default" in view.component
        ? view.component.default
        : (view?.component as ComponentType);

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
