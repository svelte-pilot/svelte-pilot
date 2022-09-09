export * from './Router';
export { default as Router } from './Router';
export { default as ClientApp } from './ClientApp.svelte';
export { default as RouterView } from './RouterView.svelte';
export { default as RouterLink } from './RouterLink.svelte';
export declare const ServerApp: {
    render: (props?: {} | undefined, { $$slots, context }?: {
        $$slots?: {} | undefined;
        context?: Map<any, any> | undefined;
    } | undefined) => {
        html: any;
        css: {
            code: string;
            map: any;
        };
        head: string;
    };
    $$render: (result: any, props: any, bindings: any, slots: any, context: any) => any;
};
