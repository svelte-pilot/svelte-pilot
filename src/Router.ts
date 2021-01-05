import { SvelteComponent } from 'svelte';
import UrlRouter from 'url-router';
import { StringCaster } from 'cast-string';

type PrimitiveTypes = string | number | boolean | null | undefined;

type SerializableData = string | number | boolean | null | undefined | SerializableData[] |
  { [name: string]: SerializableData };

type SerializableObject = Record<string, SerializableData>;

type SyncComponent = SvelteComponent | {
  default: SvelteComponent,
  preload?: (props: SerializableObject) => Promise<SerializableObject>,
  beforeEnter?: Hook
};

type AsyncComponent = () => Promise<SyncComponent>;
type RouteProps = SerializableObject | ((route: Route) => SerializableObject);

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
  fullPath: string
};

type Hook = (to: Route, from: Route) => undefined | boolean | string | Location;

const IS_CLIENT = typeof window === 'object';
const IS_SERVER = !IS_CLIENT;

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

  preloadData?: SerializableObject

  routerViewRoot?: RouterViewResolved

  current: Route = {
    path: '',
    query: new StringCaster({}),
    hash: '',
    state: {},
    params: new StringCaster({}),
    meta: {},
    fullPath: ''
  }

  constructor({
    routes,
    base,
    pathParam,
    preloadData
  }: {
    routes: RouterViewDefGroup,
    base?: string,
    pathParam?: string,
    preloadData?: SerializableObject
  }) {
    this.urlRouter = new UrlRouter(this.flatRoutes(routes));
    this.base = base;
    this.pathParam = pathParam;
    this.preloadData = preloadData;
    this.onPopStateWrapper = () => this.onPopState();

    if (IS_CLIENT) {
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
    return new Promise(resolve => {
      const url = this.toURL(location);
      const path = this.pathParam ? url.searchParams.get(this.pathParam) || '/' : url.pathname;
      const found = this.urlRouter.find(path);

      if (!found) {
        return resolve(null);
      }

      const {
        routerViewRoot,
        metaParams,
        beforeEnterHooks,
        beforeLeaveHooks,
        asyncComponentPromises
      } = this.resolveRoute(found.handler);

      const to: Route = {
        path: url.pathname,
        query: new StringCaster(url.searchParams),
        hash: url.hash,
        state: typeof location === 'string' || !location.state ? {} : location.state,
        params: new StringCaster(found.params),
        meta: {},
        fullPath: url.pathname + url.search + url.hash
      };

      this.assignMeta(to, metaParams);

      this.runHooks(
        this.beforeCurrentLeaveHooks.concat(this.beforeChangeHooks, beforeEnterHooks),
        to,
        () =>
          Promise.all(asyncComponentPromises).then(modules =>
            this.runHooks(
              modules.filter(m => m.beforeEnter).map(m => m.beforeEnter),
              to,
              () => {
                this.current = to;
                this.routerViewRoot = routerViewRoot;
                this.beforeCurrentLeaveHooks = beforeLeaveHooks;

                if (IS_SERVER) {
                  this.preload();
                }
              }
            )
          )
      )
    });
  }

  private runHooks(hooks: Hook[], to: Route, then: () => Promise<boolean>): Promise<boolean> {
    let promise = Promise.resolve(true);

    for (const hook of hooks) {
      promise = promise.then(() =>
        Promise.resolve(hook(to, this.current)).then(result => {
          if (result === true || result === undefined) {
            return true;
          } else if (result === false) {
            throw new HookInterrupt();
          } else {
            throw new HookInterrupt(result);
          }
        })
      );
    }

    promise = promise.then(
      then,
      e => {
        if (e instanceof HookInterrupt) {
          if (e.location) {
            return this.handle(e.location);
          } else {
            return false;
          }
        } else {
          throw e;
        }
      }
    );

    return promise;
  }

  private toURL(location: string | Location) {
    if (typeof location === 'string') {
      return new URL(location, 'file:');
    } else {
      const loc = location as Location;
      const url = new URL(loc.path, 'file:');

      if (loc.query) {
        appendSearchParams(url.searchParams, loc.query);
      }

      if (loc.hash) {
        url.hash = loc.hash;
      }

      return url;
    }
  }

  private resolveRoute(stacks: RouterViewDef[][]) {
    const metaParams: RouteProps[] = [];
    const beforeEnterHooks: Hook[] = [];
    const beforeLeaveHooks: Hook[] = [];
    const asyncComponentPromises: Promise<SyncComponent>[] = [];
    let root: RouterViewResolved | undefined;
    let linkView: RouterViewResolved | undefined;

    for (const stack of stacks) {
      const linkViewName = stack[stack.length - 1].name || 'default';

      const routerViews = this.resolveRouterViews(
        stack,
        metaParams,
        beforeEnterHooks,
        beforeLeaveHooks,
        asyncComponentPromises
      );

      if (!root || !linkView) { // !linkView to make stupid TS happy
        root = routerViews[0];
        linkView = root;
      } else {
        linkView.children = routerViews;
        linkView = routerViews[linkViewName];
      }
    }

    return {
      routerViewRoot: root,
      metaParams,
      beforeEnterHooks,
      beforeLeaveHooks,
      asyncComponentPromises
    };
  }

  private resolveRouterViews(
    stack: RouterViewDef[],
    metaParams: RouteProps[],
    beforeEnterHooks: Hook[],
    beforeLeaveHooks: Hook[],
    asyncComponentPromises: Promise<SyncComponent>[]
  ): Record<string, RouterViewResolved> {
    const routerViews: Record<string, RouterViewResolved> = {};

    stack.forEach(({ name = 'default', component, props, meta, beforeEnter, beforeLeave, children }) => {
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
        promise.then(m => routerView.component = m);
        asyncComponentPromises.push(promise);
      } else {
        routerView.component = component;

        if (component?.beforeEnter) {
          beforeEnterHooks.push(component.beforeEnter);
        }
      }

      if (children) {
        routerView.children = this.resolveRouterViews(
          children.filter((v): v is RouterViewDef => !(v instanceof Array) && !v.path),
          metaParams,
          beforeEnterHooks,
          beforeLeaveHooks,
          asyncComponentPromises
        );
      }
    });

    return routerViews;
  }

  private assignMeta(route: Route, metaParams: RouteProps[]) {
    const meta: SerializableObject = {};
    route.meta = {};
    metaParams.forEach(v => Object.assign(meta, v instanceof Function ? v(route) : v));
    route.meta = meta;
  }

  private preload(): Promise<void> {

  }

  setState(state: SerializableObject): void {
    if (this.current) {
      Object.assign(this.current.state, state);

      if (IS_CLIENT) {
        history.replaceState(this.current.state, '');
      }
    }
  }

  push(location: string | Location): void {
    this.handle(location).then(route => {
      if (IS_CLIENT && route) {
        history.pushState({ ...route.state, __position__: history.state.__position__ + 1 }, '', route.fullPath);
      }
    });
  }

  replace(location: string | Location): void {
    this.handle(location).then(route => {
      if (IS_CLIENT && route) {
        history.replaceState({ ...route.state, __position__: history.state.__position }, '', route.fullPath);
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
