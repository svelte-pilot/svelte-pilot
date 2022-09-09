import { create_ssr_component } from 'svelte/internal';
import _ServerApp from './ServerApp.svelte';

type ServerSideComponent = ReturnType<typeof create_ssr_component>;

export * from './Router';
export { default as Router } from './Router';
export { default as ClientApp } from './ClientApp.svelte';
export { default as RouterView } from './RouterView.svelte';
export { default as RouterLink } from './RouterLink.svelte';
export const ServerApp = <unknown>_ServerApp as ServerSideComponent;
