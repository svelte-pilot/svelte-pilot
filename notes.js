// server-entry.js (bundle entry)
// returns: html string

import { Router, ServerApp } from 'svelte-pilot';

const router = new Router();

async function handleRequest(url) {
  const { route, routerViewRoot, preloadData } = await router.handle(url);

  if ([].includes(route.meta.status)) {

  }
  const { head, css, html } = ServerApp.render({
    route,
    routerViewRoot,
    preloadData
  });

  return {
    header: {

    },

    body: formatHTML({ head, css, html, preloadData })
  }
}

export default handleRequest;

// server.js (nodejs)
const handleRequest = require('/path/to/server-bundle.js');




// ------------------------------------

// client-entry.js
import { Router, ClientApp } from 'svelte-pilot';

const router = new Router({
  preloadData: window.preloadData
});

window.preloadData = null;

new ClientApp({
  props: {
    router
  }
});
