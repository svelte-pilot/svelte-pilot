import { SvelteComponent } from 'svelte';
import UrlRouter from 'url-router';
import { StringCaster } from 'cast-string';

export type PrimitiveType = string | number | boolean | null | undefined;

export type ComponentModule = {
  default: typeof SvelteComponent;
  load?: LoadFn;
  beforeEnter?: GuardHook;
};

export type SyncComponent = ComponentModule | typeof SvelteComponent;
export type AsyncComponent = () => Promise<SyncComponent>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RouteProps = Record<string, any> | ((route: Route) => Record<string, any>);
export type PropSetters = Array<(route: Route) => Record<string, unknown>>;

type SSRStateNode = {
  data?: Record<string, unknown>;
  children?: SSRState;
};

export type SSRState = Record<string, SSRStateNode>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LoadFn = (props: any, route: Route, ssrContext?: any) => Promise<any>;

type LoadFnWrapper = (route: Route, ssrContext?: unknown) => void;

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
type RouterViewDefStacks = RouterViewDef[][];

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

const detectedMode = typeof window !== 'undefined' && window === globalThis && window.history ? 'client' : 'server';

function appendSearchParams(searchParams: URLSearchParams, q: Query): void {
  if (q instanceof URLSearchParams) {
    q.forEach((val, key) => searchParams.append(key, val));
  } else {
    Object.entries(q).forEach(([key, val]) => {
      if (val !== null && val !== undefined) {
        if (Array.isArray(val)) {
          val.forEach(v => searchParams.append(key, String(v)));
        } else {
          searchParams.append(key, String(val));
        }
      }
    });
  }
}

class HookInterrupt extends Error {
  location?: string | Location;

  constructor(location?: string | Location) {
    super();
    this.location = location;
  }
}

export default class Router {
  private base?: string;
  private pathQuery?: string;
  private urlRouter: UrlRouter<RouterViewDefStacks>;
  private beforeChangeHooks: GuardHook[] = [];
  private afterChangeHooks: NormalHook[] = [];
  private updateHooks: UpdateHook[] = [];
  private onPopStateWrapper: () => void;
  private mode?: Mode;
  current?: Route;

  constructor({
    routes,
    base,
    pathQuery,
    mode = detectedMode,
    navigateOnStartup = true
  }: {
    routes: RouterViewDefGroup;
    base?: string;
    pathQuery?: string;
    mode: Mode;
    navigateOnStartup: boolean;
  }) {
    this.urlRouter = new UrlRouter(this.flatRoutes(routes));
    this.base = base;
    this.pathQuery = pathQuery;
    this.mode = mode;
    this.onPopStateWrapper = () => this.onPopState();

    if (this.mode === 'client') {
      window.addEventListener('popstate', this.onPopStateWrapper);

      if (!history.state?.__position__) {
        history.replaceState({ __position__: history.length }, '');
      }

      if (navigateOnStartup) {
        this.replace({
          path: location.href,
          state: history.state
        });
      }
    }
  }

  private flatRoutes(
    routerViews: RouterViewDefGroup,
    sideViews: RouterViewDef[] = [],
    stacks: RouterViewDef[][] = [],
    result: Record<string, RouterViewDef[][]> = {}
  ) {
    const sideViewsInArray = routerViews.filter((v): v is RouterViewDef => !Array.isArray(v) && !v.path);
    const sideViewNames = sideViewsInArray.map(v => v.name);

    // Router views in the same array have higher priority than outer ones.
    sideViews = sideViews.filter(v => !sideViewNames.includes(v.name)).concat(sideViewsInArray);

    for (const routerView of routerViews) {
      if (routerView instanceof Array) {
        this.flatRoutes(routerView, sideViews, stacks, result);
      } else if (routerView.path || routerView.children) {
        const _stacks = [...stacks, sideViews.filter(v => v.name !== routerView.name).concat(routerView)];

        if (routerView.path) {
          result[routerView.path] = _stacks;
        } else if (routerView.children) {
          this.flatRoutes(routerView.children, sideViews, _stacks, result);
        }
      }
    }

    return result;
  }

  handle(location: string | Location, ssrContext?: unknown): Promise<HandlerResult> {
    return Promise.resolve().then(() => {
      const loc = this.parseLocation(location);
      const matchedURLRoute = this.urlRouter.find(loc.path);

      if (!matchedURLRoute) {
        return null;
      }

      const {
        routerViews,
        metaSetters,
        propSetters,
        keySetters,
        beforeEnterHooks,
        beforeLeaveHooks,
        asyncComponentPromises,
        loadFns,
        ssrState
      } = this.resolveRoute(matchedURLRoute.handler);

      const route: Route = {
        ...loc,
        params: new StringCaster(matchedURLRoute.params),
        meta: {},
        _routerViews: routerViews,
        _beforeLeaveHooks: beforeLeaveHooks,
        _metaSetters: metaSetters,
        _propSetters: propSetters,
        _keySetters: keySetters
      };

      this.updateRouteMeta(route);

      return this.runGuardHooks(
        (this.current?._beforeLeaveHooks || []).concat(this.beforeChangeHooks, beforeEnterHooks),
        route,
        ssrContext,
        () =>
          Promise.all(asyncComponentPromises).then(modules =>
            this.runGuardHooks(
              modules.filter((m): m is ComponentModule => 'beforeEnter' in m).map(m => <GuardHook>m.beforeEnter),
              route,
              ssrContext,
              () => {
                this.updateRouteProps(route);
                this.updateRouteKeys(route);

                if (this.mode === 'client') {
                  this.current = route;
                }

                this.emit('update', route);
                this.emit('afterChange', route, this.current);

                return this.mode === 'client'
                  ? { route, ssrState: null }
                  : Promise.all(
                    loadFns.map(load => load(route, ssrContext))
                  ).then(() => ({
                    route,
                    ssrState
                  }));
              }
            )
          )
      );
    });
  }

  private locationToInternalURL(location: string | Location) {
    if (typeof location === 'string') {
      location = { path: location };
    }

    const url = new URL(location.path, 'file:');

    url.pathname = url.pathname.replace(
      /:([a-z]\w*)/ig,
      (_, w) => encodeURIComponent(<string>(<Location>location).params?.[w])
    );

    if (location.query) {
      appendSearchParams(url.searchParams, location.query);
    }

    if (location.hash) {
      url.hash = location.hash;
    }

    // `base` and `pathQuery` only has effect on absolute URL.
    // `base` and `pathQuery` are mutually exclusive.
    if (/^\w+:/.test(location.path)) {
      if (this.base && url.pathname.startsWith(this.base)) {
        url.pathname = url.pathname.slice(this.base.length);
      } else if (this.pathQuery) {
        url.pathname = url.searchParams.get(this.pathQuery) || '/';
        url.searchParams.delete(this.pathQuery);
      }
    }

    url.searchParams.sort?.();
    return url;
  }

  // If `base` is not ends with '/', and path is root ('/'), the ending slash will be trimmed.
  private internalURLtoHref(url: URL) {
    if (this.pathQuery) {
      const u = new URL(url.href);

      if (url.pathname !== '/') {
        u.searchParams.set(this.pathQuery, url.pathname);
      }

      return u.search + u.hash;
    } else {
      return (
        this.base
          ? this.base.endsWith('/')
            ? this.base + url.pathname.slice(1)
            : url.pathname === '/'
              ? this.base
              : this.base + url.pathname
          : url.pathname
      ) + url.search + url.hash;
    }
  }

  parseLocation(location: string | Location): {
    path: string;
    query: StringCaster;
    search: string;
    hash: string;
    state: Record<string, unknown>;
    href: string;
  } {
    const url = this.locationToInternalURL(location);

    return {
      path: url.pathname,
      query: new StringCaster(url.searchParams),
      search: url.search,
      hash: url.hash,
      state: typeof location === 'string' || !location.state ? {} : location.state,
      href: this.internalURLtoHref(url)
    };
  }

  href(location: string | Location): string {
    return this.internalURLtoHref(this.locationToInternalURL(location));
  }

  private runGuardHooks(
    hooks: GuardHook[],
    to: Route,
    ssrContext: unknown,
    onFulfilled: () => HandlerResult | Promise<HandlerResult>
  ) {
    let promise: Promise<HandlerResult> = Promise.resolve(null);

    for (const hook of hooks) {
      promise = promise.then(() =>
        Promise.resolve(hook(to, this.current)).then(result => {
          if (result === true || result === undefined) {
            return null;
          } else if (result === false) {
            throw new HookInterrupt();
          } else {
            throw new HookInterrupt(result);
          }
        })
      );
    }

    promise = promise.then(
      onFulfilled,
      e => {
        if (e instanceof HookInterrupt) {
          if (e.location) {
            return this.handle(e.location, ssrContext);
          } else {
            return null;
          }
        } else {
          throw e;
        }
      }
    );

    return promise;
  }

  private resolveRoute(stacks: RouterViewDef[][]) {
    const routerViews: Record<string, RouterViewResolved> = {};
    const metaSetters: RouteProps[] = [];
    const propSetters: PropSetters = [];
    const keySetters: KeyFn[] = [];
    const beforeEnterHooks: GuardHook[] = [];
    const beforeLeaveHooks: GuardHook[] = [];
    const asyncComponentPromises: Promise<SyncComponent>[] = [];
    const loadFns: LoadFnWrapper[] = [];
    const ssrState: SSRState | null = this.mode === 'server' ? {} : null;

    let children = routerViews;
    let childState = ssrState;

    for (const stack of stacks) {
      this.resolveRouterViews(
        stack,
        true,
        children,
        metaSetters,
        propSetters,
        keySetters,
        beforeEnterHooks,
        beforeLeaveHooks,
        asyncComponentPromises,
        loadFns,
        childState
      );

      const linkViewName = stack[stack.length - 1].name || 'default';
      children = children[linkViewName].children = {};

      if (childState) {
        childState = childState[linkViewName].children = {};
      }
    }

    return {
      routerViews,
      metaSetters,
      propSetters,
      keySetters,
      beforeEnterHooks,
      beforeLeaveHooks,
      asyncComponentPromises,
      loadFns,
      ssrState
    };
  }

  private resolveRouterViews(
    stack: RouterViewDef[],
    skipLastViewChildren: boolean,
    routerViews: Record<string, RouterViewResolved>,
    metaSetters: RouteProps[],
    propSetters: PropSetters,
    keySetters: KeyFn[],
    beforeEnterHooks: GuardHook[],
    beforeLeaveHooks: GuardHook[],
    asyncComponentPromises: Promise<SyncComponent>[],
    loadFns: LoadFnWrapper[],
    ssrState: SSRState | null
  ): void {
    stack.forEach(routerViewDef => {
      const { name = 'default', component, props, key, meta, beforeEnter, beforeLeave, children } = routerViewDef;
      const routerView: RouterViewResolved = routerViews[name] = { name };

      if (beforeEnter) {
        beforeEnterHooks.push(beforeEnter);
      }

      if (beforeLeave) {
        beforeLeaveHooks.push(beforeLeave);
      }

      if (meta) {
        metaSetters.push(meta);
      }

      if (props) {
        if (props instanceof Function) {
          propSetters.push(route => routerView.props = props(route));
        } else {
          routerView.props = props;
        }
      }

      if (key) {
        keySetters.push(route => routerView.key = key(route));
      }

      if (ssrState) {
        ssrState[name] = {};
      }

      if (component instanceof Function && !component.prototype) {
        const promise = (<AsyncComponent>component)();

        promise.then(component => {
          routerViewDef.component = routerView.component = <ComponentModule>component;

          if (routerView.component.load && ssrState) {
            pushLoadFn(routerView.component.load, ssrState[name]);
          }
        });

        asyncComponentPromises.push(promise);
      } else {
        routerView.component = <ComponentModule>component;

        if (routerView.component?.beforeEnter) {
          beforeEnterHooks.push(routerView.component.beforeEnter);
        }

        if (routerView.component?.load && ssrState) {
          pushLoadFn(routerView.component.load, ssrState[name]);
        }
      }

      function pushLoadFn(load: LoadFn, ssrState: SSRStateNode) {
        loadFns.push(
          (route, ctx) => load(routerView.props || {}, route, ctx).then(data => ssrState.data = data)
        );
      }

      if (children && (!skipLastViewChildren || routerViewDef !== stack[stack.length - 1])) {
        routerView.children = {};

        this.resolveRouterViews(
          children.filter((v): v is RouterViewDef => !(v instanceof Array) && !v.path),
          false,
          routerView.children,
          metaSetters,
          propSetters,
          keySetters,
          beforeEnterHooks,
          beforeLeaveHooks,
          asyncComponentPromises,
          loadFns,
          ssrState ? ssrState[name].children = {} : null
        );
      }
    });
  }

  private updateRoute(route: Route) {
    this.updateRouteMeta(route);
    this.updateRouteProps(route);
    this.updateRouteKeys(route);
  }

  private updateRouteMeta(route: Route) {
    const meta: Record<string, unknown> = route.meta = {};
    route._metaSetters.forEach(v => Object.assign(meta, v instanceof Function ? v(route) : v));
  }

  private updateRouteProps(route: Route) {
    route._propSetters.forEach(fn => fn(route));
  }

  private updateRouteKeys(route: Route) {
    route._keySetters.forEach(fn => fn(route));
  }

  setState(state: Record<string, unknown>): void {
    if (this.current) {
      Object.assign(this.current.state, state);

      if (this.mode === 'client') {
        history.replaceState({
          ...this.current.state,
          __position__: history.state.__position__
        }, '');
      }

      this.updateRoute(this.current);
      this.emit('update', this.current);
    }
  }

  push(location: string | Location): void {
    this.handle(location).then(result => {
      if (this.mode === 'client' && result) {
        history.pushState(
          {
            ...result.route.state,
            __position__: history.state.__position__ + 1
          },
          '',
          result.route.href
        );
      }
    });
  }

  replace(location: string | Location): void {
    this.handle(location).then(result => {
      if (this.mode === 'client' && result) {
        history.replaceState(
          {
            ...result.route.state,
            __position__: history.state.__position__
          },
          '',
          result.route.href
        );
      }
    });
  }

  private onPopState(state?: Record<string, unknown>): void {
    this.handle({
      path: location.href,
      state: { ...history.state, ...state }
    }).then(result => {
      if (result) {
        history.replaceState(
          {
            ...result.route.state,
            __position__: history.state?.__position__ || history.length
          },
          '',
          result.route.href
        );
      } else {
        this.silentGo(<number>(<Route> this.current).state.__position__ - history.state.__position__);
      }
    });
  }

  private silentGo(delta: number, callback?: () => void): void {
    const onPopState = () => {
      window.removeEventListener('popstate', onPopState);
      window.addEventListener('popstate', this.onPopStateWrapper);

      if (callback) {
        callback();
      }
    };

    window.removeEventListener('popstate', this.onPopStateWrapper);
    window.addEventListener('popstate', onPopState);
    history.go(delta);
  }

  go(delta: number, state?: Record<string, unknown>): void {
    if (state) {
      this.silentGo(delta, () => this.onPopState(state));
    } else {
      history.go(delta);
    }
  }

  back(state?: Record<string, unknown>): void {
    return this.go(-1, state);
  }

  forward(state?: Record<string, unknown>): void {
    return this.go(1, state);
  }

  on(event: Events, handler: EventHooks[typeof event]): void {
    if (event === 'beforeChange') {
      this.beforeChangeHooks.push(handler);
    } else if (event === 'beforeCurrentRouteLeave') {
      this.current?._beforeLeaveHooks.push(handler);
    } else if (event === 'update') {
      this.updateHooks.push(handler);
    } else if (event === 'afterChange') {
      this.afterChangeHooks.push(handler);
    }
  }

  off(event: Events, handler: EventHooks[typeof event]): void {
    if (event === 'beforeChange') {
      this.beforeChangeHooks = this.beforeChangeHooks.filter(fn => fn !== handler);
    } else if (event === 'beforeCurrentRouteLeave' && this.current) {
      this.current._beforeLeaveHooks = this.current._beforeLeaveHooks.filter(fn => fn !== handler);
    } else if (event === 'update') {
      this.updateHooks = this.updateHooks.filter(fn => fn !== handler);
    } else if (event === 'afterChange') {
      this.afterChangeHooks = this.afterChangeHooks.filter(fn => fn !== handler);
    }
  }

  once(event: Events, handler: EventHooks[typeof event]): void {
    const h: typeof handler = (...args: Parameters<typeof handler>) => {
      this.off(event, h);
      // @ts-expect-error Expected 1-2 arguments, but got 0 or more.
      handler(...args);
    };

    this.on(event, h);
  }

  private emit(event: string, to: Route, from?: Route) {
    if (event === 'update') {
      this.updateHooks.forEach(fn => fn(to));
    } else if (event === 'afterChange') {
      this.afterChangeHooks.forEach(fn => fn(to, from));
    }
  }
}
