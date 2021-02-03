// server-entry.js (bundle entry)
// returns: html string

import { Router, ServerApp } from 'svelte-pilot';

const router = new Router();

async function handleRequest(url, serverContext) {
  const { route, preloadData } = await router.handle(url, serverContext);
  const res = route.meta.response;

  if (res?.headers?.location) {
    if (!res.status) {
      res.status = 301;
    }

    return res;
  } else {
    res.body = ServerApp.render({ router, route, preloadData });

    if (!res.status) {
      res.status = 200;
    }

    return res;
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
