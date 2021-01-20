// server-entry.js (bundle entry)
// returns: html string

import { Router, ServerApp } from 'svelte-pilot';

const router = new Router();

async function handleRequest(url, serverContext) {
  const { route, preloadData } = await router.handle(url, serverContext);

  if ([].includes(route.meta.status)) {

  }
  const { head, css, html } = ServerApp.render({
    route,
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

const router = new Router();

new ClientApp({
  target: document.body,
  hydrate: true,
  props: {
    router,
    preloadData: window.preloadData
  }
});
