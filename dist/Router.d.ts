import { SvelteComponent } from 'svelte';
import { StringCaster } from 'cast-string';
export type PrimitiveType = string | number | boolean | null | undefined;
export type ComponentModule = {
    default: typeof SvelteComponent;
    load?: LoadFn;
    beforeEnter?: GuardHook;
};
export type SyncComponent = ComponentModule | typeof SvelteComponent;
export type AsyncComponent = () => Promise<SyncComponent>;
export type RouteProps = Record<string, any> | ((route: Route) => Record<string, any>);
export type PropSetters = Array<(route: Route) => Record<string, unknown>>;
type SSRStateNode = {
    data?: Record<string, unknown>;
    children?: SSRState;
};
export type SSRState = Record<string, SSRStateNode>;
export type LoadFn = (props: any, route: Route, ssrContext?: any) => Promise<any>;
export type KeyFn = (route: Route) => PrimitiveType;
export type RouterViewDef = {
    name?: string;
    path?: string;
    component?: SyncComponent | AsyncComponent;
    props?: RouteProps;
    key?: KeyFn;
    meta?: RouteProps;
    children?: RouterViewDefGroup;
    beforeEnter?: GuardHook;
    beforeLeave?: GuardHook;
};
export type RouterViewDefGroup = Array<RouterViewDef | RouterViewDef[]>;
export type RouterViewResolved = {
    name: string;
    component?: SyncComponent;
    props?: Record<string, unknown>;
    key?: PrimitiveType;
    children?: Record<string, RouterViewResolved>;
};
export type Query = Record<string, PrimitiveType | PrimitiveType[]> | URLSearchParams;
export type Location = {
    path: string;
    params?: Record<string, string | number | boolean>;
    query?: Query;
    hash?: string;
    state?: Record<string, unknown>;
};
export type Route = {
    path: string;
    query: StringCaster;
    search: string;
    hash: string;
    state: Record<string, unknown>;
    params: StringCaster;
    meta: Record<string, unknown>;
    href: string;
    _routerViews: Record<string, RouterViewResolved>;
    _beforeLeaveHooks: GuardHook[];
    _metaSetters: RouteProps[];
    _propSetters: PropSetters;
    _keySetters: KeyFn[];
};
export type GuardHookResult = void | boolean | string | Location;
export type GuardHook = (to: Route, from?: Route) => GuardHookResult | Promise<GuardHookResult>;
export type NormalHook = (to: Route, from?: Route) => void;
export type UpdateHook = (route: Route) => void;
export type Events = 'beforeChange' | 'beforeCurrentRouteLeave' | 'update' | 'afterChange';
export type EventHooks = {
    beforeCurrentRouteLeave: GuardHook;
    beforeChange: GuardHook;
    update: UpdateHook;
    afterChange: NormalHook;
};
export type Mode = 'server' | 'client';
export type HandlerResult = {
    route: Route;
    ssrState: SSRState | null;
} | null;
export default class Router {
    private base?;
    private pathQuery?;
    private urlRouter;
    private beforeChangeHooks;
    private afterChangeHooks;
    private updateHooks;
    private onPopStateWrapper;
    private mode?;
    current?: Route;
    constructor({ routes, base, pathQuery, mode }: {
        routes: RouterViewDefGroup;
        base?: string;
        pathQuery?: string;
        mode?: Mode;
    });
    private flatRoutes;
    handle(location: string | Location, ssrContext?: unknown): Promise<HandlerResult>;
    private locationToInternalURL;
    private internalURLtoHref;
    parseLocation(location: string | Location): {
        path: string;
        query: StringCaster;
        search: string;
        hash: string;
        state: Record<string, unknown>;
        href: string;
    };
    href(location: string | Location): string;
    private runGuardHooks;
    private resolveRoute;
    private resolveRouterViews;
    private updateRoute;
    private updateRouteMeta;
    private updateRouteProps;
    private updateRouteKeys;
    setState(state: Record<string, unknown>): void;
    push(location: string | Location): void;
    replace(location: string | Location): void;
    private onPopState;
    private silentGo;
    go(delta: number, state?: Record<string, unknown>): void;
    back(state?: Record<string, unknown>): void;
    forward(state?: Record<string, unknown>): void;
    on(event: Events, handler: EventHooks[typeof event]): void;
    off(event: Events, handler: EventHooks[typeof event]): void;
    once(event: Events, handler: EventHooks[typeof event]): void;
    private emit;
}
export {};
