import { StringCaster } from "cast-string";
import { ComponentType } from "svelte";
import URLRouter from "url-router";

export type PrimitiveType = string | number | boolean | null | undefined;

export type ComponentModule = {
  default: ComponentType;
  load?: LoadFunction;
  beforeEnter?: NavigationGuard;
};

export type SyncComponent = ComponentModule | ComponentType;
export type AsyncComponent = () => Promise<ComponentModule>;
export type RouteProps =
  | Record<string, unknown>
  | ((route: Route) => Record<string, unknown>);
export type PropSetters = Array<(route: Route) => Record<string, unknown>>;

type SSRStateNode = {
  data?: Record<string, unknown>;
  children?: SSRStateTree;
};

export type SSRStateTree = Record<string, SSRStateNode>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LoadFunction<Props = any, Ctx = any, Ret = any> = {
  (props: Props, route: Route, ssrContext: Ctx): Ret | Promise<Ret>;
  watch?: string[];
  callOnClient?: boolean;
};

type ServerLoadFunctionWrapper = (route: Route, ssrContext?: unknown) => void;
type ClientLoadFunctionWrapper = (route: Route) => void;

export type KeyFunction = (route: Route) => PrimitiveType;

export type ViewConfig = {
  name?: string;
  path?: string;
  component?: SyncComponent | AsyncComponent;
  props?: RouteProps;
  key?: KeyFunction;
  meta?: RouteProps;
  children?: ViewConfigGroup;
  beforeEnter?: NavigationGuard;
  beforeLeave?: NavigationGuard;
};

export type ViewConfigGroup = Array<ViewConfig | ViewConfig[]>;

export type ResolvedView = {
  name: string;
  component?: SyncComponent;
  props?: Record<string, unknown>;
  key?: PrimitiveType;
  children?: Record<string, ResolvedView>;
};

export type QueryParams =
  | Record<string, PrimitiveType | PrimitiveType[]>
  | URLSearchParams;

export type Location = {
  path: string;
  params?: Record<string, string | number | boolean>;
  query?: QueryParams;
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
  ssrState: SSRStateTree;
  _ssrStateMap: Map<LoadFunction, Record<string, Record<string, unknown>>>;
  _views: Record<string, ResolvedView>;
  _beforeLeaveHandlers: NavigationGuard[];
  _metaSetters: RouteProps[];
  _propSetters: PropSetters;
  _keySetters: KeyFunction[];
};

export type NavigationGuardResult = void | boolean | string | Location;

export type NavigationGuard = (
  to: Route,
  from?: Route
) => NavigationGuardResult | Promise<NavigationGuardResult>;

export type SimpleHandler = (to: Route, from?: Route) => void;
export type UpdateHandler = (route: Route) => void;

export type Events =
  | "beforeChange"
  | "beforeCurrentRouteLeave"
  | "update"
  | "afterChange";

export type EventHandlers = {
  beforeCurrentRouteLeave: NavigationGuard;
  beforeChange: NavigationGuard;
  update: UpdateHandler;
  afterChange: SimpleHandler;
};

export type Mode = "server" | "client";

const detectedMode =
  typeof window !== "undefined" && window === globalThis && window.history
    ? "client"
    : "server";

function appendSearchParams(
  searchParams: URLSearchParams,
  q: QueryParams
): void {
  if (q instanceof URLSearchParams) {
    q.forEach((val, key) => searchParams.append(key, val));
  } else {
    Object.entries(q).forEach(([key, val]) => {
      if (val !== null && val !== undefined) {
        if (Array.isArray(val)) {
          val.forEach((v) => searchParams.append(key, String(v)));
        } else {
          searchParams.append(key, String(val));
        }
      }
    });
  }
}

export default class Router {
  mode: Mode;
  base: string;
  pathQuery: string;
  mockedSSRContext?: unknown;
  callLoadOnClient: boolean;
  ssrState?: SSRStateTree;
  current?: Route;
  private urlRouter: URLRouter<ViewConfig[][]>;
  private beforeChangeHandlers: NavigationGuard[] = [];
  private afterChangeHandlers: SimpleHandler[] = [];
  private updateHandlers: UpdateHandler[] = [];
  private onPopStateWrapper: () => void;

  constructor({
    routes,
    base = "",
    pathQuery = "",
    mode = detectedMode,
    handleInitialURL = true,
    mockedSSRContext,
    callLoadOnClient = Boolean(mockedSSRContext),
    ssrState,
  }: {
    routes: ViewConfigGroup;
    base?: string;
    pathQuery?: string;
    mode?: Mode;
    handleInitialURL?: boolean;
    mockedSSRContext?: unknown;
    callLoadOnClient?: boolean;
    ssrState?: SSRStateTree;
  }) {
    this.urlRouter = new URLRouter(this.toViewConfigLayers(routes));
    this.base = base;
    this.pathQuery = pathQuery;
    this.mode = mode;
    this.onPopStateWrapper = () => this.onPopState();
    this.mockedSSRContext = mockedSSRContext;
    this.callLoadOnClient = callLoadOnClient;
    this.ssrState = ssrState;

    if (this.mode === "client") {
      window.addEventListener("popstate", this.onPopStateWrapper);

      if (!history.state?.__position__) {
        history.replaceState({ __position__: history.length }, "");
      }

      if (handleInitialURL) {
        this.replace({
          path: location.href,
          state: history.state,
        });
      }
    }
  }

  private toViewConfigLayers(
    viewConfigGroup: ViewConfigGroup,
    sideViewConfigArray: ViewConfig[] = [],
    layers: ViewConfig[][] = [],
    result: Record<string, ViewConfig[][]> = {}
  ) {
    // Views within the same array have higher priority than those outside it.
    const sideViewsWithinGroup = viewConfigGroup.filter(
      (v): v is ViewConfig => !Array.isArray(v) && !v.path
    );

    const sideViewNames = sideViewsWithinGroup.map((v) => v.name);

    sideViewConfigArray = sideViewConfigArray
      .filter((v) => !sideViewNames.includes(v.name))
      .concat(sideViewsWithinGroup);

    for (const viewConfig of viewConfigGroup) {
      if (viewConfig instanceof Array) {
        this.toViewConfigLayers(
          viewConfig,
          sideViewConfigArray,
          layers,
          result
        );
      } else if (viewConfig.path || viewConfig.children) {
        const _layers = [
          ...layers,
          sideViewConfigArray
            .filter((v) => v.name !== viewConfig.name)
            .concat(viewConfig),
        ];

        if (viewConfig.path) {
          result[viewConfig.path] = _layers;
        } else if (viewConfig.children) {
          this.toViewConfigLayers(
            viewConfig.children,
            sideViewConfigArray,
            _layers,
            result
          );
        }
      }
    }

    return result;
  }

  async handle(
    location: string | Location,
    ssrContext?: unknown
  ): Promise<Route | null | false> {
    const loc = this.parseLocation(location);
    const matchedURLRoute = this.urlRouter.find(loc.path);

    if (!matchedURLRoute) {
      return null;
    }

    const {
      views,
      metaSetters,
      propSetters,
      keySetters,
      beforeEnterHandlers,
      beforeLeaveHandlers,
      asyncComponentPromises,
      serverLoadFunctions,
      clientLoadFunctions,
      ssrState,
    } = this.resolveViewConfigLayers(matchedURLRoute.handler);

    const route: Route = {
      ...loc,
      params: new StringCaster(matchedURLRoute.params),
      meta: {},
      ssrState,
      _ssrStateMap: new Map(),
      _views: views,
      _beforeLeaveHandlers: beforeLeaveHandlers,
      _metaSetters: metaSetters,
      _propSetters: propSetters,
      _keySetters: keySetters,
    };

    this.updateRoute(route);

    if (this.mode === "client") {
      const ret = await this.callNavigationGuards(
        (this.current?._beforeLeaveHandlers || []).concat(
          this.beforeChangeHandlers,
          beforeEnterHandlers
        ),
        route,
        ssrContext
      );

      if (ret !== true) {
        return ret;
      }
    }

    const modules = await Promise.all(asyncComponentPromises);

    if (this.mode === "client") {
      const ret = await this.callNavigationGuards(
        modules
          .filter((m): m is ComponentModule => "beforeEnter" in m)
          .map((m) => <NavigationGuard>m.beforeEnter),
        route,
        ssrContext
      );

      if (ret !== true) {
        return ret;
      }
    }

    if (this.mode === "server") {
      await Promise.all(serverLoadFunctions.map((fn) => fn(route, ssrContext)));
      return route;
    }

    if (this.ssrState) {
      const restore = (
        ssrState: SSRStateTree,
        views: Record<string, ResolvedView>
      ) => {
        Object.entries(ssrState).forEach(([name, ssrStateNode]) => {
          const view = views[name];

          if (ssrStateNode.data) {
            const load = (view.component as ComponentModule)
              .load as LoadFunction;
            const records = route._ssrStateMap.get(load) || {};
            let key = "";
            const { props } = view;

            if (props) {
              if (load.watch) {
                key = JSON.stringify(load.watch.map((k) => props[k]));
              } else {
                key = JSON.stringify(Object.values(props));
              }
            }

            records[key] = ssrStateNode.data;
          }

          if (ssrStateNode.children && view.children) {
            restore(ssrStateNode.children, view.children);
          }
        });
      };

      route.ssrState = this.ssrState;
      this.ssrState = undefined;
      restore(route.ssrState, route._views);
    } else {
      await Promise.all(clientLoadFunctions.map((fn) => fn(route)));
    }

    const from = this.current;
    this.current = route;
    this.emit("update", route);
    this.emit("afterChange", route, from);
    return route;
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
      state:
        typeof location === "string" || !location.state ? {} : location.state,
      href: this.toExternalUrl(url),
    };
  }

  private locationToInternalURL(location: string | Location) {
    if (typeof location === "string") {
      location = { path: location };
    }

    const url = new URL(location.path, "file:");

    url.pathname = url.pathname.replace(/:([a-z]\w*)/gi, (_, w) =>
      encodeURIComponent(<string>(<Location>location).params?.[w])
    );

    if (location.query) {
      appendSearchParams(url.searchParams, location.query);
    }

    if (location.hash) {
      url.hash = location.hash;
    }

    // `base` and `pathQuery` only have an effect on absolute URLs.
    // Additionally, `base` and `pathQuery` are mutually exclusive.
    if (/^\w+:/.test(location.path)) {
      if (this.base && url.pathname.startsWith(this.base)) {
        url.pathname = url.pathname.slice(this.base.length);
      } else if (this.pathQuery) {
        url.pathname = url.searchParams.get(this.pathQuery) || "/";
        url.searchParams.delete(this.pathQuery);
      }
    }

    url.searchParams.sort?.();
    return url;
  }

  private toExternalUrl(url: URL) {
    if (this.pathQuery) {
      const u = new URL(url.href);

      if (url.pathname !== "/") {
        u.searchParams.set(this.pathQuery, url.pathname);
      }

      return u.search + u.hash;
    } else {
      // If `base` does not end with '/', and the path is the root ('/'), the ending slash will be trimmed.
      return (
        (this.base
          ? this.base.endsWith("/")
            ? this.base + url.pathname.slice(1)
            : url.pathname === "/"
            ? this.base
            : this.base + url.pathname
          : url.pathname) +
        url.search +
        url.hash
      );
    }
  }

  href(location: string | Location): string {
    return this.toExternalUrl(this.locationToInternalURL(location));
  }

  private resolveViewConfigLayers(layers: ViewConfig[][]) {
    const views: Record<string, ResolvedView> = {};
    const metaSetters: RouteProps[] = [];
    const propSetters: PropSetters = [];
    const keySetters: KeyFunction[] = [];
    const beforeEnterHandlers: NavigationGuard[] = [];
    const beforeLeaveHandlers: NavigationGuard[] = [];
    const asyncComponentPromises: Promise<SyncComponent>[] = [];
    const serverLoadFunctions: ServerLoadFunctionWrapper[] = [];
    const clientLoadFunctions: ClientLoadFunctionWrapper[] = [];
    const ssrState: SSRStateTree = {};

    let children = views;
    let childState = ssrState;

    for (const layer of layers) {
      this.resolveViewConfigLayer(
        layer,
        true,
        children,
        metaSetters,
        propSetters,
        keySetters,
        beforeEnterHandlers,
        beforeLeaveHandlers,
        asyncComponentPromises,
        serverLoadFunctions,
        clientLoadFunctions,
        childState
      );

      const linkViewName = layer[layer.length - 1].name || "default";
      children = children[linkViewName].children = {};

      if (childState) {
        childState = childState[linkViewName].children = {};
      }
    }

    return {
      views,
      metaSetters,
      propSetters,
      keySetters,
      beforeEnterHandlers,
      beforeLeaveHandlers,
      asyncComponentPromises,
      serverLoadFunctions,
      clientLoadFunctions,
      ssrState,
    };
  }

  private resolveViewConfigLayer(
    layer: ViewConfig[],
    skipLastViewChildren: boolean,
    views: Record<string, ResolvedView>,
    metaSetters: RouteProps[],
    propSetters: PropSetters,
    keySetters: KeyFunction[],
    beforeEnterHandlers: NavigationGuard[],
    beforeLeaveHandlers: NavigationGuard[],
    asyncComponentPromises: Promise<SyncComponent>[],
    serverLoadFunctions: ServerLoadFunctionWrapper[],
    clientLoadFunctions: ClientLoadFunctionWrapper[],
    ssrState: SSRStateTree
  ): void {
    layer.forEach((ViewConfig) => {
      const {
        name = "default",
        component,
        props,
        key,
        meta,
        beforeEnter,
        beforeLeave,
        children,
      } = ViewConfig;
      const view: ResolvedView = (views[name] = { name });

      if (beforeEnter) {
        beforeEnterHandlers.push(beforeEnter);
      }

      if (beforeLeave) {
        beforeLeaveHandlers.push(beforeLeave);
      }

      if (meta) {
        metaSetters.push(meta);
      }

      if (props) {
        if (props instanceof Function) {
          propSetters.push((route) => (view.props = props(route)));
        } else {
          view.props = props;
        }
      }

      if (key) {
        keySetters.push((route) => (view.key = key(route)));
      }

      ssrState[name] = {};

      if (component) {
        const pushLoadFn = (load: LoadFunction, ssrState: SSRStateNode) => {
          if (this.mode === "client") {
            if (
              load.callOnClient ||
              (load.callOnClient === undefined && this.callLoadOnClient)
            ) {
              clientLoadFunctions.push(async (route) => {
                let key = "";
                const props = view.props;

                if (props) {
                  key = JSON.stringify(
                    load.watch?.map((k) => props[k]) || Object.values(props)
                  );
                }

                const setState = (data: Record<string, unknown>) => {
                  let mapItem = route._ssrStateMap.get(load);

                  if (!mapItem) {
                    mapItem = {};
                    route._ssrStateMap.set(load, mapItem);
                  }

                  mapItem[key] = ssrState.data = data;
                };

                const cache = this.current?._ssrStateMap.get(load);

                if (cache?.[key]) {
                  setState(cache[key]);
                } else {
                  setState(
                    await load(view.props || {}, route, this.mockedSSRContext)
                  );
                }
              });
            }
          } else {
            serverLoadFunctions.push(
              async (route, ctx) =>
                (ssrState.data = await load(view.props || {}, route, ctx))
            );
          }
        };

        if (component instanceof Function && !component.prototype) {
          asyncComponentPromises.push(
            (<AsyncComponent>component)().then((component) => {
              ViewConfig.component = view.component = component;

              if (component.load && ssrState) {
                pushLoadFn(component.load, ssrState[name]);
              }

              return component;
            })
          );
        } else {
          view.component = <ComponentModule>component;

          if (view.component.beforeEnter) {
            beforeEnterHandlers.push(view.component.beforeEnter);
          }

          if (view.component.load) {
            pushLoadFn(view.component.load, ssrState[name]);
          }
        }
      }

      if (
        children &&
        (!skipLastViewChildren || ViewConfig !== layer[layer.length - 1])
      ) {
        view.children = {};

        this.resolveViewConfigLayer(
          children.filter(
            (v): v is ViewConfig => !(v instanceof Array) && !v.path
          ),
          false,
          view.children,
          metaSetters,
          propSetters,
          keySetters,
          beforeEnterHandlers,
          beforeLeaveHandlers,
          asyncComponentPromises,
          serverLoadFunctions,
          clientLoadFunctions,
          (ssrState[name].children = {})
        );
      }
    });
  }

  private async callNavigationGuards(
    handlers: NavigationGuard[],
    to: Route,
    ssrContext: unknown
  ) {
    for (const handler of handlers) {
      const ret = await handler(to, this.current);

      if (ret === true || ret === undefined) {
        continue;
      } else if (ret === false) {
        return false;
      } else if (ret) {
        return this.handle(ret, ssrContext);
      }
    }

    return true;
  }

  private updateRoute(route: Route) {
    this.updateRouteMeta(route);
    this.updateRouteProps(route);
    this.updateRouteKeys(route);
  }

  private updateRouteMeta(route: Route) {
    const meta: Record<string, unknown> = (route.meta = {});
    route._metaSetters.forEach((v) =>
      Object.assign(meta, v instanceof Function ? v(route) : v)
    );
  }

  private updateRouteProps(route: Route) {
    route._propSetters.forEach((fn) => fn(route));
  }

  private updateRouteKeys(route: Route) {
    route._keySetters.forEach((fn) => fn(route));
  }

  setState(state: Record<string, unknown>): void {
    if (this.current) {
      Object.assign(this.current.state, state);

      if (this.mode === "client") {
        history.replaceState(
          {
            ...this.current.state,
            __position__: history.state.__position__,
          },
          ""
        );
      }

      this.updateRoute(this.current);
      this.emit("update", this.current);
    }
  }

  async push(location: string | Location): Promise<void> {
    const route = await this.handle(location);

    if (this.mode === "client" && route) {
      history.pushState(
        {
          ...route.state,
          __position__: history.state.__position__ + 1,
        },
        "",
        route.href
      );
    }
  }

  async replace(location: string | Location): Promise<void> {
    const route = await this.handle(location);

    if (this.mode === "client" && route) {
      history.replaceState(
        {
          ...route.state,
          __position__: history.state.__position__,
        },
        "",
        route.href
      );
    }
  }

  private async onPopState(state?: Record<string, unknown>): Promise<void> {
    const route = await this.handle({
      path: location.href,
      state: { ...history.state, ...state },
    });

    if (route) {
      history.replaceState(
        {
          ...route.state,
          __position__: history.state?.__position__ || history.length,
        },
        "",
        route.href
      );
    } else {
      this.silentGo(
        <number>(<Route>this.current).state.__position__ -
          history.state.__position__
      );
    }
  }

  private silentGo(delta: number, callback?: () => void): void {
    const onPopState = () => {
      window.removeEventListener("popstate", onPopState);
      window.addEventListener("popstate", this.onPopStateWrapper);

      if (callback) {
        callback();
      }
    };

    window.removeEventListener("popstate", this.onPopStateWrapper);
    window.addEventListener("popstate", onPopState);
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

  on(event: Events, handler: EventHandlers[typeof event]): void {
    if (event === "beforeChange") {
      this.beforeChangeHandlers.push(handler);
    } else if (event === "beforeCurrentRouteLeave") {
      this.current?._beforeLeaveHandlers.push(handler);
    } else if (event === "update") {
      this.updateHandlers.push(handler);
    } else if (event === "afterChange") {
      this.afterChangeHandlers.push(handler);
    }
  }

  off(event: Events, handler: EventHandlers[typeof event]): void {
    if (event === "beforeChange") {
      this.beforeChangeHandlers = this.beforeChangeHandlers.filter(
        (fn) => fn !== handler
      );
    } else if (event === "beforeCurrentRouteLeave" && this.current) {
      this.current._beforeLeaveHandlers =
        this.current._beforeLeaveHandlers.filter((fn) => fn !== handler);
    } else if (event === "update") {
      this.updateHandlers = this.updateHandlers.filter((fn) => fn !== handler);
    } else if (event === "afterChange") {
      this.afterChangeHandlers = this.afterChangeHandlers.filter(
        (fn) => fn !== handler
      );
    }
  }

  once(event: Events, handler: EventHandlers[typeof event]): void {
    const h: typeof handler = (...args: Parameters<typeof handler>) => {
      this.off(event, h);
      // @ts-expect-error A spread argument must either have a tuple type or be passed to a rest parameter. ts(2556)
      handler(...args);
    };

    this.on(event, h);
  }

  private emit(event: string, to: Route, from?: Route) {
    if (event === "update") {
      this.updateHandlers.forEach((fn) => fn(to));
    } else if (event === "afterChange") {
      this.afterChangeHandlers.forEach((fn) => fn(to, from));
    }
  }
}
