type ServerSideComponent = {
  render: (props?: {}) => {
    html: string,
    head: string,
    css: {
      code: string,
      map: any
    }
  }
};

export * from './Router';
export { default as Router } from './Router';
export { default as ClientApp } from './ClientApp.svelte';
export { default as RouterView } from './RouterView.svelte';
export { default as RouterLink } from './RouterLink.svelte';

import _ServerApp from './ServerApp.svelte';
export const ServerApp =  <unknown>_ServerApp as ServerSideComponent;
