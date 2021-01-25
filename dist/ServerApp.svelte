<script>
  import { setContext } from 'svelte';
  import { writable } from 'svelte/store';
  import CTX_KEY from './CTX_KEY';
  import RouterView from './RouterView.svelte';

  export let route;
  export let preloadData = null;

  setContext(CTX_KEY, writable({
    routerViews: route._routerViews,
    preloadData
  }));
</script>

<RouterView />
