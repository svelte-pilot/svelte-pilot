import { SvelteComponent } from 'svelte';
import UrlRouter from 'url-router';
import { StringCaster } from 'cast-string';

type PrimitiveTypes = string | number | boolean | null | undefined;

type SerializableData = string | number | boolean | null | undefined | SerializableData[] |
  { [name: string]: SerializableData };

type SerializableObject = Record<string, SerializableData>;

type SyncComponent = SvelteComponent | {
  default: SvelteComponent,
  preload?: PreloadFn,
  beforeEnter?: Hook
};

type AsyncComponent = () => Promise<SyncComponent>;
type RouteProps = SerializableObject | ((route: Route) => SerializableObject);

type PreloadData = {
  data?: SerializableObject,
  children?: Record<string, PreloadData>
};

type PreloadFn = (props: SerializableObject) => Promise<SerializableObject>;
type PreloadFnWrapper = (route: Route) => Promise<SerializableObject>;

type RouterViewDef = {
  name?: string,
  path?: string,
  component?: SyncComponent | AsyncComponent,
  props?: RouteProps,
  meta?: RouteProps,
  children?: RouterViewDefGroup,
  beforeEnter?: Hook,
  beforeLeave?: Hook
};

type RouterViewDefGroup = (RouterViewDef | RouterViewDef[])[];
type RouterViewDefStacks = RouterViewDef[][];

type RouterViewResolved = {
  name: string,
  component?: SyncComponent,
  props?: RouteProps,
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
  href: string
};

type Hook = (to: Route, from: Route) => undefined | boolean | string | Location;

type Mode = 'server' | 'client';

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

function computeProps(route: Route, props?: RouteProps) {
  if (!props) {
    return {};
  } else if (props instanceof Function) {
    return props(route);
  } else {
    return props;
  }
}

export class HookInterrupt extends Error {
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

  private beforeChangeHooks: Hook[] = []

  private beforeCurrentLeaveHooks: Hook[] = []

  private onPopStateWrapper: () => void

  mode?: Mode

  preloadData?: SerializableObject

  routerViewRoot?: RouterViewResolved

  current: Route = {
    path: '',
    query: new StringCaster({}),
    hash: '',
    state: {},
    params: new StringCaster({}),
    meta: {},
    href: ''
  }

  constructor({
    routes,
    base,
    pathParam,
    mode = detectedMode,
    preloadData
  }: {
    routes: RouterViewDefGroup,
    base?: string,
    pathParam?: string,
    mode: Mode,
    preloadData?: SerializableObject
  }) {
    this.urlRouter = new UrlRouter(this.flatRoutes(routes));
    this.base = base;
    this.pathParam = pathParam;
    this.mode = mode;
    this.preloadData = preloadData;
    this.onPopStateWrapper = () => this.onPopState();

    if (this.mode === 'client') {
      window.addEventListener('popstate', this.onPopStateWrapper);

      if (!history.state?.__position__) {
        history.replaceState({ __position__: history.length }, '');
      }

      this.handle({
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

  handle(location: string | Location): Promise<Route | null> {
    return Promise.resolve().then(() => {
      const url = this.locationToInternalURL(location);
      const matchedURLRoute = this.urlRouter.find(url.pathname);

      if (!matchedURLRoute) {
        return null;
      }

      const {
        routerViewRoot,
        metaParams,
        beforeEnterHooks,
        beforeLeaveHooks,
        asyncComponentPromises,
        preloadFns,
        preloadData
      } = this.resolveRoute(matchedURLRoute.handler);

      const to: Route = {
        path: url.pathname,
        query: new StringCaster(url.searchParams),
        hash: url.hash,
        state: typeof location === 'string' || !location.state ? {} : location.state,
        params: new StringCaster(matchedURLRoute.params),
        meta: {},
        href: this.internalURLtoHref(url)
      };

      this.assignMeta(to, metaParams);

      return this.runHooks(
        this.beforeCurrentLeaveHooks.concat(this.beforeChangeHooks, beforeEnterHooks),
        to,
        () =>
          Promise.all(asyncComponentPromises).then(modules =>
            this.runHooks(
              modules.filter(m => m.beforeEnter).map(m => m.beforeEnter),
              to,
              () => {
                if (this.mode === 'server') {
                  return Promise.all(
                    preloadFns.map(preload => preload(to))
                  ).then(() => ({
                    route: to,
                    routerViewRoot,
                    preloadData
                  }));
                } else {
                  this.current = to;
                  this.routerViewRoot = routerViewRoot;
                  this.beforeCurrentLeaveHooks = beforeLeaveHooks;

                  return {
                    route: to,
                    routerViewRoot,
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

  toHref(location: string | Location) {
    return this.internalURLtoHref(this.locationToInternalURL(location));
  }

  private runHooks(hooks: Hook[], to: Route, onFulfilled: () => Route | null | Promise<Route | null>) {
    let promise: Promise<Route | null> = Promise.resolve(null);

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
    const rootWrapper: Record<string, RouterViewResolved> = {};
    const metaParams: RouteProps[] = [];
    const beforeEnterHooks: Hook[] = [];
    const beforeLeaveHooks: Hook[] = [];
    const asyncComponentPromises: Promise<SyncComponent>[] = [];
    const preloadFns: PreloadFnWrapper[] = [];
    const preloadData: PreloadData = {};
    let children = rootWrapper;

    for (const stack of stacks) {
      this.resolveRouterViews(
        stack,
        true,
        children,
        metaParams,
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
      routerViewRoot: rootWrapper.default,
      metaParams,
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
    metaParams: RouteProps[],
    beforeEnterHooks: Hook[],
    beforeLeaveHooks: Hook[],
    asyncComponentPromises: Promise<SyncComponent>[],
    preloadFns: PreloadFnWrapper[],
    preloadData: PreloadData
  ): void {
    stack.forEach(routerViewDef => {
      const { name = 'default', component, props, meta, beforeEnter, beforeLeave, children } = routerViewDef;
      const routerView: RouterViewResolved = routerViews[name] = { name, props };

      if (beforeEnter) {
        beforeEnterHooks.push(beforeEnter);
      }

      if (beforeLeave) {
        beforeLeaveHooks.push(beforeLeave);
      }

      if (meta) {
        metaParams.push(meta);
      }

      if (component instanceof Function) {
        const promise = component();

        promise.then(component => {
          routerViewDef.component = routerView.component = component;

          if (component.preload && this.mode === 'server') {
            pushPreloadFn(component.preload);
          }
        });

        asyncComponentPromises.push(promise);
      } else {
        routerView.component = component;

        if (component?.beforeEnter) {
          beforeEnterHooks.push(component.beforeEnter);
        }

        if (component?.preload && this.mode === 'server') {
          pushPreloadFn(component.preload);
        }
      }

      function pushPreloadFn(preload: PreloadFn) {
        preloadFns.push(
          route => preload(computeProps(route, props)).then(data => preloadData.data = data)
        );
      }

      if (children && (!skipLastViewChildren || routerViewDef !== stack[stack.length - 1])) {
        routerView.children = {};

        this.resolveRouterViews(
          children.filter((v): v is RouterViewDef => !(v instanceof Array) && !v.path),
          false,
          routerView.children,
          metaParams,
          beforeEnterHooks,
          beforeLeaveHooks,
          asyncComponentPromises,
          preloadFns,
          this.mode === 'server' ? preloadData.children = {} : {}
        );
      }
    });
  }

  private assignMeta(route: Route, metaParams: RouteProps[]) {
    const meta: SerializableObject = {};
    route.meta = {};
    metaParams.forEach(v => Object.assign(meta, v instanceof Function ? v(route) : v));
    route.meta = meta;
  }

  setState(state: SerializableObject): void {
    if (this.current) {
      Object.assign(this.current.state, state);

      if (this.mode === 'client') {
        history.replaceState(this.current.state, '');
      }
    }
  }

  push(location: string | Location): void {
    this.handle(location).then(route => {
      if (this.mode === 'client' && route) {
        history.pushState({ ...route.state, __position__: history.state.__position__ + 1 }, '', route.href);
      }
    });
  }

  replace(location: string | Location): void {
    this.handle(location).then(route => {
      if (this.mode === 'client' && route) {
        history.replaceState({ ...route.state, __position__: history.state.__position }, '', route.href);
      }
    });
  }

  private onPopState(state?: SerializableObject): void {
    this.handle({
      path: location.href,
      state: { ...history.state, ...state }
    }).then(route => {
      if (route) {
        if (state) {
          history.replaceState(route.state, '');
        }
      } else {
        this.silentGo(<number> this.current.state.__position__ - history.state.__position__);
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
}
