<script lang="ts">
  import { getContext, setContext, type Component } from 'svelte'
  import type { ResolvedView, SSRState } from './Router'
  import { CTX_NODE } from './ctxKeys'

  type Node = { views?: ResolvedView['children']; ssrState?: SSRState }

  let { name = 'default' } = $props()

  const parent = getContext<() => Node | undefined>(CTX_NODE)

  let { view, component, _props, node } = $derived.by(() => {
    const { views, ssrState } = parent() || {}
    const view = views?.[name]

    if (!view) {
      return {}
    }

    return {
      view,
      component:
        (view.component as { default?: Component })?.default ||
        (view.component as Component),
      _props: {
        ...view.props,
        ...ssrState?.[name].data
      },
      node: {
        views: view.children,
        ssrState: ssrState?.[name].children
      }
    }
  })

  setContext(CTX_NODE, () => node)
</script>

{#if view && component}
  {#key view.key}
    <svelte:component this={component} {..._props} />
  {/key}
{/if}
