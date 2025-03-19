<script lang='ts'>
  import type { Component } from 'svelte'

  import { getContext, setContext } from 'svelte'

  import type { ResolvedView, SSRState } from './Router'

  import { CTX_NODE } from './ctxKeys'

  type Node = { ssrState?: SSRState, views?: ResolvedView['children'] }

  let { name = 'default' } = $props()
  const parent = getContext<() => Node | undefined>(CTX_NODE)

  let { _props, Com, node, view } = $derived.by(() => {
    const { ssrState, views } = parent() || {}
    const view = views?.[name]

    if (!view) {
      return {}
    }

    return {
      _props: {
        ...view.props,
        ...ssrState?.[name].data,
      },
      Com:
        (view.component as { default?: Component })?.default
          || (view.component as Component),
      node: {
        ssrState: ssrState?.[name].children,
        views: view.children,
      },
      view,
    }
  })

  setContext(CTX_NODE, () => node)
</script>

{#if view && Com}
  {#key view.key}
    <Com {..._props}></Com>
  {/key}
{/if}
