import { SvelteComponent } from 'svelte';
import { StringCaster } from 'cast-string';
declare type PrimitiveTypes = string | number | boolean | null | undefined;
declare type SerializableData = string | number | boolean | null | undefined | SerializableData[] | {
    [name: string]: SerializableData;
};
declare type SerializableObject = Record<string, SerializableData>;
declare type ComponentModule = {
    default: typeof SvelteComponent;
    preload?: PreloadFn;
    beforeEnter?: GuardHook;
};
declare type SyncComponent = ComponentModule | typeof SvelteComponent;
declare type AsyncComponent = () => Promise<SyncComponent>;
declare type RouteProps = SerializableObject | ((route: Route) => SerializableObject);
declare type PropSetters = Array<(route: Route) => SerializableObject>;
declare type PreloadData = {
    data?: SerializableObject;
    children?: Record<string, PreloadData>;
};
declare type PreloadFn = (props?: SerializableObject, serverContext?: unknown) => Promise<SerializableObject>;
declare type KeyFn = (route: Route) => PrimitiveTypes;
declare type RouterViewDef = {
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
declare type RouterViewDefGroup = (RouterViewDef | RouterViewDef[])[];
declare type RouterViewResolved = {
    name: string;
    component?: SyncComponent;
    props?: SerializableObject;
    key?: PrimitiveTypes;
    children?: Record<string, RouterViewResolved>;
};
declare type Query = Record<string, PrimitiveTypes | PrimitiveTypes[]> | URLSearchParams;
declare type Location = {
    path: string;
    query?: Query;
    hash?: string;
    state?: SerializableObject;
};
declare type Route = {
    path: string;
    query: StringCaster;
    hash: string;
    state: SerializableObject;
    params: StringCaster;
    meta: SerializableObject;
    href: string;
    _routerViews: Record<string, RouterViewResolved>;
    _beforeLeaveHooks: GuardHook[];
    _metaSetters: RouteProps[];
    _propSetters: PropSetters;
    _keySetters: KeyFn[];
};
declare type GuardHookResult = void | boolean | string | Location;
declare type GuardHook = {
    (to: Route, from?: Route): GuardHookResult | Promise<GuardHookResult>;
    _beforeChangeOnce?: (to: Route, from?: Route) => GuardHookResult | Promise<GuardHookResult>;
};
declare type NormalHook = (to: Route, from?: Route) => void;
declare type UpdateHook = (route: Route) => void;
declare type Mode = 'server' | 'client';
declare type HandlerResult = {
    route: Route;
    preloadData: PreloadData | null;
} | null;
export default class Router {
    private base?;
    private pathParam?;
    private urlRouter;
    private beforeChangeHooks;
    private afterChangeHooks;
    private updateHooks;
    private onPopStateWrapper;
    private mode?;
    current?: Route;
    constructor({ routes, base, pathParam, mode }: {
        routes: RouterViewDefGroup;
        base?: string;
        pathParam?: string;
        mode?: Mode;
    });
    private flatRoutes;
    handle(location: string | Location, serverContext?: unknown): Promise<HandlerResult>;
    private locationToInternalURL;
    private internalURLtoHref;
    toHref(location: string | Location): string;
    private runGuardHooks;
    private resolveRoute;
    private resolveRouterViews;
    private updateRoute;
    private updateRouteMeta;
    private updateRouteProps;
    private updateRouteKeys;
    setState(state: SerializableObject): void;
    push(location: string | Location): void;
    replace(location: string | Location): void;
    private onPopState;
    private silentGo;
    go(delta: number, state?: SerializableObject): void;
    back(state?: SerializableObject): void;
    forward(state?: SerializableObject): void;
    on(event: 'beforeChange', handler: GuardHook, { once, beginning }?: {
        once?: boolean;
        beginning?: boolean;
    }): void;
    on(event: 'update', handler: UpdateHook): void;
    on(event: 'afterChange', handler: NormalHook): void;
    off(event: 'beforeChange', handler: GuardHook, { once }?: {
        once?: boolean;
    }): void;
    off(event: 'update', handler: UpdateHook): void;
    off(event: 'afterChange', handler: NormalHook): void;
    private emit;
}
export {};
