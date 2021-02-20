declare type ServerSideComponent = {
    render: (props?: {}) => {
        html: string;
        head: string;
        css: string;
    };
};
export { default as Router } from './Router';
export { default as ClientApp } from './ClientApp.svelte';
export { default as RouterView } from './RouterView.svelte';
export { CTX_ROUTER, CTX_ROUTE } from './ctxKeys';
export declare const ServerApp: ServerSideComponent;
