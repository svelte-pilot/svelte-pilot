<script>
  import { getContext, onDestroy, setContext } from "svelte";
  import { writable } from "svelte/store";
  import { CTX_CHILDREN } from "./ctxKeys";

  /**
   * @typedef {import("svelte").ComponentType} ComponentType
   * @typedef {import("svelte/store").Readable} Readable
   * @typedef {import("svelte/store").Writable} Writable
   * @typedef {import("./Router").ResolvedView} ResolvedView
   * @typedef {import("./Router").SSRState} SSRState
   * @typedef {import("./Router").RouteProps} RouteProps
   * @typedef {{ views?: ResolvedView["children"]; ssrState?: SSRState; }} Node
   */

  export let name = "default";

  /**
   * @type {ResolvedView | undefined}
   */
  let view;

  /**
   * @type {ComponentType | undefined}
   */
  let component;

  /**
   * @type {RouteProps}
   */
  let props;

  /**
   * @type {Readable<Node>}
   */
  const parentStore = getContext(CTX_CHILDREN);

  /**
   * @type {Writable<Node>}
   */
  const childrenStore = writable();

  setContext(CTX_CHILDREN, { subscribe: childrenStore.subscribe });

  const unsubscribe = parentStore.subscribe(({ views, ssrState } = {}) => {
    view = views?.[name];

    component = view?.component?.default || view?.component;

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
