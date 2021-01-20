<script>
  import { setContext } from 'svelte';
  import { writable } from 'svelte/store';
  import RouterView from './RouterView.svelte';
  import CTX_KEY from './CTX_KEY';

  export let router;
  export let preloadData;

  const store = writable();
  setContext(CTX_KEY, store);
  router.on('update', update);

  if (router.current) {
    update(router.current);
  }

  let updateCount = 0;

  function update(route) {
    store.set({
      routerViews: route._routerViewRoot,
      preloadData
    });

    updateCount++;

    if (preloadData && updateCount === 2) {
      Object.keys(preloadData).forEach(k => delete preloadData[k]);
      preloadData = null;
    }
  }
</script>

<RouterView />
