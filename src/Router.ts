import { SvelteComponent } from 'svelte';
import UrlRouter from 'url-router';
import { StringCaster } from 'cast-string';

type PrimitiveTypes = string | number | boolean | null | undefined;

type SerializableData = string | number | boolean | null | undefined | SerializableData[] |
  { [name: string]: SerializableData };

type SerializableObject = Record<string, SerializableData>;

type ComponentModule = {
  default: typeof SvelteComponent,
  preload?: PreloadFn,
  beforeEnter?: GuardHook
};

type SyncComponent = ComponentModule | typeof SvelteComponent;

type AsyncComponent = () => Promise<SyncComponent>;
type RouteProps = SerializableObject | ((route: Route) => SerializableObject);
type PropSetters = Array<(route: Route) => SerializableObject>;

type PreloadData = {
  data?: SerializableObject,
  children?: Record<string, PreloadData>
};

type PreloadFn = (props?: SerializableObject, serverContext?: unknown) => Promise<SerializableObject>;
type PreloadFnWrapper = (serverContext?: unknown) => Promise<SerializableObject>;
type KeyFn = (route: Route) => PrimitiveTypes;

type RouterViewDef = {
  name?: string,
  path?: string,
  component?: SyncComponent | AsyncComponent,
  props?: RouteProps,
  key?: KeyFn,
  meta?: RouteProps,
  children?: RouterViewDefGroup,
  beforeEnter?: GuardHook,
  beforeLeave?: GuardHook
};

type RouterViewDefGroup = (RouterViewDef | RouterViewDef[])[];
type RouterViewDefStacks = RouterViewDef[][];

type RouterViewResolved = {
  name: string,
  component?: SyncComponent,
  props?: SerializableObject,
  key?: PrimitiveTypes,
  children?: Record<string, RouterViewResolved>
};

type Query = Record<string, PrimitiveTypes | PrimitiveTypes[]> | URLSearchParams;

type Location = {
  path: string,
  query?: Query,
  hash?: string,
  state?: SerializableObject
};

type Route = {
  path: string,
  query: StringCaster,
  hash: string,
  state: SerializableObject,
  params: StringCaster,
  meta: SerializableObject,
  href: string,
  _routerViews: Record<string, RouterViewResolved>
  _beforeLeaveHooks: GuardHook[],
  _metaSetters: RouteProps[],
  _propSetters: PropSetters,
  _keySetters: KeyFn[]
};

type GuardHookResult = void | boolean | string | Location;

type GuardHook = {
  (to: Route, from?: Route): GuardHookResult | Promise<GuardHookResult>,
  _beforeChangeOnce?: (to: Route, from?: Route) => GuardHookResult | Promise<GuardHookResult>
};

type NormalHook = (to: Route, from?: Route) => void;
type UpdateHook = (route: Route) => void;

type Mode = 'server' | 'client';

type HandlerResult = {
  route: Route,
  preloadData: PreloadData | null
} | null;

const detectedMode = typeof window === 'object' ? 'client' : 'server';

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
  location?: string | Location

  constructor(location?: string | Location) {
    super();
    this.location = location;
  }
}

export default class Router {
  private base?: string

  private pathParam?: string

  private urlRouter: UrlRouter<RouterViewDefStacks>

  private beforeChangeHooks: GuardHook[] = []

  private afterChangeHooks: NormalHook[] = []

  private updateHooks: UpdateHook[] = []

  private onPopStateWrapper: () => void

  private mode?: Mode

  current?: Route

  constructor({
    routes,
    base,
    pathParam,
    mode = detectedMode
  }: {
    routes: RouterViewDefGroup,
    base?: string,
    pathParam?: string,
    mode?: Mode
  }) {
    this.urlRouter = new UrlRouter(this.flatRoutes(routes));
    this.base = base;
    this.pathParam = pathParam;
    this.mode = mode;
    this.onPopStateWrapper = () => this.onPopState();

    if (this.mode === 'client') {
      window.addEventListener('popstate', this.onPopStateWrapper);

      if (!history.state?.__position__) {
        history.replaceState({ __position__: history.length }, '');
      }

      this.replace({
        path: location.href,
        state: history.state
      });
    }
  }

  private flatRoutes(
    routerViews: RouterViewDefGroup,
    sideViews: RouterViewDef[] = [],
    stacks: RouterViewDef[][] = [],
    result: [string, RouterViewDef[][]][] = []
  ) {
    const sideViewsInArray = routerViews.filter((v): v is RouterViewDef => !Array.isArray(v) && !v.path);
    const sideViewNames = sideViewsInArray.map(v => v.name);

    // Router views in the same array have higher priority than outer ones.
    sideViews = sideViews.filter(v => !sideViewNames.includes(v.name)).concat(sideViewsInArray);

    for (const routerView of routerViews) {
      if (routerView instanceof Array) {
        this.flatRoutes(routerView, sideViews, stacks, result);
      } else if (routerView.path || routerView.children) {
        stacks = [...stacks, sideViews.filter(v => v.name !== routerView.name).concat(routerView)];

        if (routerView.path) {
          result.push([routerView.path, stacks]);
        } else if (routerView.children) {
          this.flatRoutes(routerView.children, sideViews, stacks, result);
        }
      }
    }

    return result;
  }

  handle(location: string | Location, serverContext?: unknown): Promise<HandlerResult> {
    return Promise.resolve().then(() => {
      const url = this.locationToInternalURL(location);
      const matchedURLRoute = this.urlRouter.find(url.pathname);

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
        preloadFns,
        preloadData
      } = this.resolveRoute(matchedURLRoute.handler);

      const route: Route = {
        path: url.pathname,
        query: new StringCaster(url.searchParams),
        hash: url.hash,
        state: typeof location === 'string' || !location.state ? {} : location.state,
        params: new StringCaster(matchedURLRoute.params),
        meta: {},
        href: this.internalURLtoHref(url),
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
        () =>
          Promise.all(asyncComponentPromises).then(modules =>
            this.runGuardHooks(
              modules.filter((m): m is ComponentModule => 'beforeEnter' in m).map(m => <GuardHook>m.beforeEnter),
              route,
              () => {
                this.updateRouteProps(route);
                this.updateRouteKeys(route);
                this.emit('update', route);
                this.emit('afterChange', route, this.current);

                if (this.mode === 'server') {
                  return Promise.all(
                    preloadFns.map(preload => preload(serverContext))
                  ).then(() => ({
                    route,
                    preloadData
                  }));
                } else {
                  this.current = route;

                  return {
                    route,
                    preloadData: null
                  };
                }
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

    if (location.query) {
      appendSearchParams(url.searchParams, location.query);
    }

    if (location.hash) {
      url.hash = location.hash;
    }

    // `base` and `pathParam` only has effect on absolute URL.
    // `base` and `pathParam` are mutually exclusive.
    if (/^\w+:/.test(location.path)) {
      if (this.base && url.pathname.startsWith(this.base)) {
        url.pathname = url.pathname.slice(this.base.length);
      } else if (this.pathParam) {
        url.pathname = url.searchParams.get(this.pathParam) || '/';
      }
    }

    return url;
  }

  // If `base` is not ends with '/', and path is root ('/'), the ending slash will be trimmed.
  private internalURLtoHref(url: URL) {
    if (this.pathParam) {
      return url.search + url.hash;
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

  toHref(location: string | Location): string {
    return this.internalURLtoHref(this.locationToInternalURL(location));
  }

  private runGuardHooks(hooks: GuardHook[], to: Route, onFulfilled: () => HandlerResult | Promise<HandlerResult>) {
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
            return this.handle(e.location);
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
    const preloadFns: PreloadFnWrapper[] = [];
    const preloadData: PreloadData | null = this.mode === 'server' ? {} : null;
    let children = routerViews;

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
        preloadFns,
        preloadData
      );

      const linkViewName = stack[stack.length - 1].name || 'default';
      children = children[linkViewName].children = {};
    }

    return {
      routerViews,
      metaSetters,
      propSetters,
      keySetters,
      beforeEnterHooks,
      beforeLeaveHooks,
      asyncComponentPromises,
      preloadFns,
      preloadData
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
    preloadFns: PreloadFnWrapper[],
    preloadData: PreloadData | null
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

      if (component instanceof Function) {
        const promise = (<AsyncComponent>component)();

        promise.then(component => {
          routerViewDef.component = routerView.component = component;

          if ((<ComponentModule>component).preload && preloadData) {
            pushPreloadFn(<PreloadFn>(<ComponentModule>component).preload, preloadData);
          }
        });

        asyncComponentPromises.push(promise);
      } else {
        routerView.component = component;

        if (component?.beforeEnter) {
          beforeEnterHooks.push(component.beforeEnter);
        }

        if (component?.preload && preloadData) {
          pushPreloadFn(component.preload, preloadData);
        }
      }

      function pushPreloadFn(preload: PreloadFn, preloadData: PreloadData) {
        preloadFns.push(
          ctx => preload(routerView.props, ctx).then(data => preloadData.data = data)
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
          preloadFns,
          preloadData ? preloadData.children = {} : null
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
    const meta: SerializableObject = route.meta = {};
    route._metaSetters.forEach(v => Object.assign(meta, v instanceof Function ? v(route) : v));
  }

  private updateRouteProps(route: Route) {
    route._propSetters.forEach(fn => fn(route));
  }

  private updateRouteKeys(route: Route) {
    route._keySetters.forEach(fn => fn(route));
  }

  setState(state: SerializableObject): void {
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

  private onPopState(state?: SerializableObject): void {
    this.handle({
      path: location.href,
      state: { ...history.state, ...state }
    }).then(result => {
      if (result) {
        history.replaceState(
          {
            ...result.route.state,
            __position__: history.state.__position__
          },
          '',
          result.route.href
        );
      } else {
        this.silentGo(<number> this.current?.state.__position__ - history.state.__position__);
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

  go(delta: number, state?: SerializableObject): void {
    if (state) {
      this.silentGo(delta, () => this.onPopState(state));
    } else {
      history.go(delta);
    }
  }

  back(state?: SerializableObject): void {
    return this.go(-1, state);
  }

  forward(state?: SerializableObject): void {
    return this.go(1, state);
  }

  on(event: 'beforeChange', handler: GuardHook, { once, beginning }?: { once?: boolean, beginning?: boolean}): void;

  on(event: 'update', handler: UpdateHook): void;

  on(event: 'afterChange', handler: NormalHook): void;

  on(event: string, handler: GuardHook | UpdateHook | NormalHook, { once = false, beginning = false } = {}): void {
    if (event === 'beforeChange') {
      if (once) {
        handler = (<GuardHook>handler)._beforeChangeOnce = (to: Route, from?: Route) => {
          this.beforeChangeHooks = this.beforeChangeHooks.filter(fn => fn !== handler);
          return handler(to, from);
        };
      }

      if (beginning) {
        this.beforeChangeHooks.unshift(handler);
      } else {
        this.beforeChangeHooks.push(handler);
      }
    } else if (event === 'update') {
      this.updateHooks.push(<UpdateHook>handler);
    } else if (event === 'afterChange') {
      this.afterChangeHooks.push(<NormalHook>handler);
    }
  }

  off(event: 'beforeChange', handler: GuardHook, { once }?: { once?: boolean }): void;

  off(event: 'update', handler: UpdateHook): void;

  off(event: 'afterChange', handler: NormalHook): void;

  off(event: string, handler: GuardHook | UpdateHook | NormalHook, { once = false } = {}): void {
    if (event === 'beforeChange') {
      if (once) {
        handler = <GuardHook>(<GuardHook>handler)._beforeChangeOnce;
      }

      this.beforeChangeHooks = this.beforeChangeHooks.filter(fn => fn !== handler);
    } else if (event === 'update') {
      this.updateHooks = this.updateHooks.filter(fn => fn !== handler);
    } else if (event === 'afterChange') {
      this.afterChangeHooks = this.afterChangeHooks.filter(fn => fn !== handler);
    }
  }

  private emit(event: string, to: Route, from?: Route) {
    if (event === 'update') {
      this.updateHooks.forEach(fn => fn(to));
    } else if (event === 'afterChange') {
      this.afterChangeHooks.forEach(fn => fn(to, from));
    }
  }
}
