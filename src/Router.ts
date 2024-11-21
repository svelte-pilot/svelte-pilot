import type { Component } from 'svelte'

import { StringCaster } from 'cast-string'
import URLRouter from 'url-router'

export type PrimitiveType = boolean | null | number | string | undefined

export interface ComponentModule {
  beforeEnter?: NavigationGuard
  default: Component<any>
  load?: LoadFunction
}

export type SyncComponent = Component<any> | ComponentModule
export type AsyncComponent = () => Promise<ComponentModule>
export type RouteProps =
  | ((route: Route) => Record<string, unknown>)
  | Record<string, unknown>
export type PropSetters = Array<(route: Route) => Record<string, unknown>>

interface SSRStateNode {
  children?: SSRState
  data?: Record<string, unknown>
}

export type SSRState = Record<string, SSRStateNode>

export interface LoadFunction<Props = any, Ctx = any, Ret = any> {
  (props: Props, route: Route, loadFunctionContext: Ctx): Promise<Ret> | Ret
  cacheKey?: string[]
  callOnClient?: boolean
}

type ServerLoadFunctionWrapper = (
  route: Route,
  loadFunctionContext?: unknown
) => void
type ClientLoadFunctionWrapper = (route: Route) => void

export type KeyFunction = (route: Route) => PrimitiveType

export interface ViewConfig {
  beforeEnter?: NavigationGuard
  beforeLeave?: NavigationGuard
  children?: ViewConfigGroup
  component?: AsyncComponent | SyncComponent
  key?: KeyFunction
  meta?: RouteProps
  name?: string
  path?: string
  props?: RouteProps
}

export type ViewConfigGroup = Array<ViewConfig | ViewConfig[]>

export interface ResolvedView {
  children?: Record<string, ResolvedView>
  component?: SyncComponent
  key?: PrimitiveType
  name: string
  props?: Record<string, unknown>
}

export type QueryParams =
  | Record<string, PrimitiveType | PrimitiveType[]>
  | URLSearchParams

export interface Location {
  hash?: string
  params?: Record<string, boolean | number | string>
  path: string
  query?: QueryParams
  state?: Record<string, unknown>
}

export type ParsedLocation = Pick<
  Route,
  'hash' | 'href' | 'path' | 'query' | 'search' | 'state'
>

export interface Route {
  _beforeLeaveHandlers: NavigationGuard[]
  _keySetters: KeyFunction[]
  _metaSetters: RouteProps[]
  _propSetters: PropSetters
  _ssrStateMap: Map<LoadFunction, Record<string, Record<string, unknown>>>
  _views: Record<string, ResolvedView>
  hash: string
  href: string
  meta: Record<string, unknown>
  params: StringCaster
  path: string
  query: StringCaster
  search: string
  ssrState: SSRState
  state: Record<string, unknown>
}

export type NavigationGuardResult = boolean | Location | string | void

export type NavigationGuard = (
  to: Route,
  from?: Route
) => NavigationGuardResult | Promise<NavigationGuardResult>

export type AfterChangeHandler = (to: Route, from?: Route) => void
export type UpdateHandler = (route: Route) => void
export type Errorhandler = (error: unknown) => void

export type Event =
  | 'afterChange'
  | 'beforeChange'
  | 'beforeCurrentRouteLeave'
  | 'error'
  | 'update'

export type EventHandler =
  | AfterChangeHandler
  | Errorhandler
  | NavigationGuard
  | UpdateHandler

function appendSearchParams(
  searchParams: URLSearchParams,
  q: QueryParams,
): void {
  if (q instanceof URLSearchParams) {
    q.forEach((val, key) => searchParams.append(key, val))
  }
  else {
    Object.entries(q).forEach(([key, val]) => {
      if (val !== null && val !== undefined) {
        if (Array.isArray(val)) {
          val.forEach(v => searchParams.append(key, String(v)))
        }
        else {
          searchParams.append(key, String(val))
        }
      }
    })
  }
}

export class Router {
  private afterChangeHandlers: AfterChangeHandler[] = []
  private beforeChangeHandlers: NavigationGuard[] = []
  private errorHandlers: Errorhandler[] = []
  private onPopStateWrapper: () => void
  private updateHandlers: UpdateHandler[] = []
  private urlRouter: URLRouter<ViewConfig[][]>
  base: string
  callLoadOnClient: boolean
  clientContext?: unknown
  current?: Route
  pathQuery: string

  constructor({
    base = '',
    callLoadOnClient = false,
    clientContext,
    pathQuery = '',
    routes,
  }: {
    base?: string
    callLoadOnClient?: boolean
    clientContext?: unknown
    pathQuery?: string
    routes: ViewConfigGroup
  }) {
    this.urlRouter = new URLRouter(this.toViewConfigLayers(routes))
    this.base = base
    this.pathQuery = pathQuery
    this.onPopStateWrapper = () => this.onPopState()
    this.clientContext = clientContext
    this.callLoadOnClient = callLoadOnClient
  }

  private async callNavigationGuards(handlers: NavigationGuard[], to: Route) {
    for (const handler of handlers) {
      const ret = await handler(to, this.current)

      if (ret === true || ret === undefined) {
        continue
      }
      else if (ret === false) {
        return false
      }
      else if (ret) {
        return this.handleClient(ret)
      }
    }

    return true
  }

  private emit(event: string, ...args: unknown[]) {
    if (event === 'update') {
      this.updateHandlers.forEach(fn => fn(...(<[Route]>args)))
    }
    else if (event === 'afterChange') {
      this.afterChangeHandlers.forEach(fn => fn(...(<[Route, Route]>args)))
    }
    else if (event === 'error') {
      this.errorHandlers.forEach(fn => fn(...(<[unknown]>args)))
    }
  }

  private locationToInternalURL(location: Location | string) {
    if (typeof location === 'string') {
      location = { path: location }
    }

    const url = new URL(location.path, 'file:')

    url.pathname = url.pathname.replace(/:([a-z]\w*)/gi, (_, w) =>
      encodeURIComponent(<string>(<Location>location).params?.[w]))

    if (location.query) {
      appendSearchParams(url.searchParams, location.query)
    }

    if (location.hash) {
      url.hash = location.hash
    }

    // `base` and `pathQuery` only have an effect on absolute URLs.
    // Additionally, `base` and `pathQuery` are mutually exclusive.
    if (/^\w+:/.test(location.path)) {
      if (this.base) {
        const base = this.base.endsWith('/')
          ? this.base.slice(0, -1)
          : this.base

        if (
          url.pathname.startsWith(base)
          && ['/', undefined].includes(url.pathname[base.length])
        ) {
          url.pathname = url.pathname.slice(this.base.length) || '/'
        }
        else {
          throw new Error(
            `The base path "${this.base}" does not match the path "${location.path}".`,
          )
        }
      }
      else if (this.pathQuery) {
        url.pathname = url.searchParams.get(this.pathQuery) || '/'
        url.searchParams.delete(this.pathQuery)
      }
    }

    url.searchParams.sort?.()
    return url
  }

  private async onPopState(state?: Record<string, unknown>): Promise<void> {
    const route = await this.handleClient({
      path: location.href,
      state: { ...history.state, ...state },
    })

    if (route) {
      history.replaceState(
        {
          ...route.state,
          __position__: history.state?.__position__ || history.length,
        },
        '',
        route.href,
      )
    }
    else {
      this.silentGo(
        <number>(<Route> this.current).state.__position__
        - history.state.__position__,
      )
    }
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
    ssrState: SSRState,
    serverLoadFunctions?: ServerLoadFunctionWrapper[],
    clientLoadFunctions?: ClientLoadFunctionWrapper[],
  ): void {
    layer.forEach((ViewConfig) => {
      const {
        beforeEnter,
        beforeLeave,
        children,
        component,
        key,
        meta,
        name = 'default',
        props,
      } = ViewConfig
      const view: ResolvedView = (views[name] = { name })

      if (beforeEnter) {
        beforeEnterHandlers.push(beforeEnter)
      }

      if (beforeLeave) {
        beforeLeaveHandlers.push(beforeLeave)
      }

      if (meta) {
        metaSetters.push(meta)
      }

      if (props) {
        if (props instanceof Function) {
          propSetters.push(route => (view.props = props(route)))
        }
        else {
          view.props = props
        }
      }

      if (key) {
        keySetters.push(route => (view.key = key(route)))
      }

      ssrState[name] = {}

      if (component) {
        const pushLoadFn = (load: LoadFunction, ssrState: SSRStateNode) => {
          if (serverLoadFunctions) {
            serverLoadFunctions.push(
              async (route, ctx) =>
                (ssrState.data = await load(view.props || {}, route, ctx)),
            )
          }
          else if (clientLoadFunctions) {
            if (
              load.callOnClient
              || (load.callOnClient === undefined && this.callLoadOnClient)
            ) {
              clientLoadFunctions.push(async (route) => {
                let key = ''
                const props = view.props

                if (props) {
                  key = JSON.stringify(
                    load.cacheKey?.map(k => props[k]) || Object.values(props),
                  )
                }

                const setState = (data: Record<string, unknown>) => {
                  let mapItem = route._ssrStateMap.get(load)

                  if (!mapItem) {
                    mapItem = {}
                    route._ssrStateMap.set(load, mapItem)
                  }

                  mapItem[key] = ssrState.data = data
                }

                const cache = this.current?._ssrStateMap.get(load)

                if (cache?.[key]) {
                  setState(cache[key])
                }
                else {
                  setState(
                    await load(view.props || {}, route, this.clientContext),
                  )
                }
              })
            }
          }
        }

        if (component instanceof Function && !component.length) {
          asyncComponentPromises.push(
            (<AsyncComponent>component)().then((component) => {
              ViewConfig.component = view.component = component

              if (component.load && ssrState) {
                pushLoadFn(component.load, ssrState[name])
              }

              return component
            }),
          )
        }
        else {
          view.component = <ComponentModule>component

          if (view.component.beforeEnter) {
            beforeEnterHandlers.push(view.component.beforeEnter)
          }

          if (view.component.load) {
            pushLoadFn(view.component.load, ssrState[name])
          }
        }
      }

      if (
        children
        && (!skipLastViewChildren || ViewConfig !== layer[layer.length - 1])
      ) {
        this.resolveViewConfigLayer(
          children.filter(
            (v): v is ViewConfig => !(Array.isArray(v)) && !v.path,
          ),
          false,
          (view.children = {}),
          metaSetters,
          propSetters,
          keySetters,
          beforeEnterHandlers,
          beforeLeaveHandlers,
          asyncComponentPromises,
          (ssrState[name].children = {}),
          serverLoadFunctions,
          clientLoadFunctions,
        )
      }
    })
  }

  private resolveViewConfigLayers(
    layers: ViewConfig[][],
    {
      clientLoadFunctions,
      serverLoadFunctions,
    }: {
      clientLoadFunctions?: ClientLoadFunctionWrapper[]
      serverLoadFunctions?: ServerLoadFunctionWrapper[]
    },
  ) {
    const views: Record<string, ResolvedView> = {}
    const metaSetters: RouteProps[] = []
    const propSetters: PropSetters = []
    const keySetters: KeyFunction[] = []
    const beforeEnterHandlers: NavigationGuard[] = []
    const beforeLeaveHandlers: NavigationGuard[] = []
    const asyncComponentPromises: Promise<SyncComponent>[] = []
    const ssrState: SSRState = {}

    let children = views
    let childState = ssrState

    layers.forEach((layer, i) => {
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
        childState,
        serverLoadFunctions,
        clientLoadFunctions,
      )

      if (i !== layers.length - 1) {
        const linkViewName = layer[layer.length - 1].name || 'default'
        children = children[linkViewName].children = {}

        if (childState) {
          childState = childState[linkViewName].children = {}
        }
      }
    })

    return {
      asyncComponentPromises,
      beforeEnterHandlers,
      beforeLeaveHandlers,
      clientLoadFunctions,
      keySetters,
      metaSetters,
      propSetters,
      serverLoadFunctions,
      ssrState,
      views,
    }
  }

  private silentGo(delta: number, callback?: () => void): void {
    const onPopState = () => {
      window.removeEventListener('popstate', onPopState)
      window.addEventListener('popstate', this.onPopStateWrapper)

      if (callback) {
        callback()
      }
    }

    window.removeEventListener('popstate', this.onPopStateWrapper)
    window.addEventListener('popstate', onPopState)
    history.go(delta)
  }

  private toExternalUrl(url: URL) {
    if (this.pathQuery) {
      const u = new URL(url.href)

      if (url.pathname !== '/') {
        u.searchParams.set(this.pathQuery, url.pathname)
      }

      return u.search + u.hash
    }
    else {
      // If `base` does not end with '/', and the path is the root ('/'), the ending slash will be trimmed.
      return (
        (this.base
          ? this.base.endsWith('/')
            ? this.base + url.pathname.slice(1)
            : url.pathname === '/'
              ? this.base
              : this.base + url.pathname
          : url.pathname)
        + url.search
        + url.hash
      )
    }
  }

  private toViewConfigLayers(
    viewConfigGroup: ViewConfigGroup,
    sideViewConfigArray: ViewConfig[] = [],
    layers: ViewConfig[][] = [],
    result: Record<string, ViewConfig[][]> = {},
  ) {
    // Views within the same array have higher priority than those outside it.
    const sideViewsWithinGroup = viewConfigGroup.filter(
      (v): v is ViewConfig => !Array.isArray(v) && !v.path,
    )

    const sideViewNames = sideViewsWithinGroup.map(v => v.name)

    sideViewConfigArray = sideViewConfigArray
      .filter(v => !sideViewNames.includes(v.name))
      .concat(sideViewsWithinGroup)

    for (const viewConfig of viewConfigGroup) {
      if (Array.isArray(viewConfig)) {
        this.toViewConfigLayers(viewConfig, sideViewConfigArray, layers, result)
      }
      else if (viewConfig.path || viewConfig.children) {
        const _layers = [
          ...layers,
          sideViewConfigArray
            .filter(v => v.name !== viewConfig.name)
            .concat(viewConfig),
        ]

        if (viewConfig.path) {
          result[viewConfig.path] = _layers
        }
        else if (viewConfig.children) {
          this.toViewConfigLayers(
            viewConfig.children,
            sideViewConfigArray,
            _layers,
            result,
          )
        }
      }
    }

    return result
  }

  private updateRoute(route: Route) {
    this.updateRouteMeta(route)
    this.updateRouteProps(route)
    this.updateRouteKeys(route)
  }

  private updateRouteKeys(route: Route) {
    route._keySetters.forEach(fn => fn(route))
  }

  private updateRouteMeta(route: Route) {
    const meta: Record<string, unknown> = (route.meta = {})
    route._metaSetters.forEach(v =>
      Object.assign(meta, v instanceof Function ? v(route) : v),
    )
  }

  private updateRouteProps(route: Route) {
    route._propSetters.forEach(fn => fn(route))
  }

  back(state?: Record<string, unknown>): void {
    return this.go(-1, state)
  }

  findRoute(
    location: Location | string,
    {
      clientLoadFunctions,
      serverLoadFunctions,
    }: {
      clientLoadFunctions?: ClientLoadFunctionWrapper[]
      serverLoadFunctions?: ServerLoadFunctionWrapper[]
    },
  ) {
    const loc = this.parseLocation(location)
    const matchedURLRoute = this.urlRouter.find(loc.path)

    if (!matchedURLRoute) {
      return
    }

    const {
      asyncComponentPromises,
      beforeEnterHandlers,
      beforeLeaveHandlers,
      keySetters,
      metaSetters,
      propSetters,
      ssrState,
      views,
    } = this.resolveViewConfigLayers(matchedURLRoute.handler, {
      clientLoadFunctions,
      serverLoadFunctions,
    })

    const route: Route = {
      ...loc,
      _beforeLeaveHandlers: beforeLeaveHandlers,
      _keySetters: keySetters,
      _metaSetters: metaSetters,
      _propSetters: propSetters,
      _ssrStateMap: new Map(),
      _views: views,
      meta: {},
      params: new StringCaster(matchedURLRoute.params),
      ssrState,
    }

    this.updateRoute(route)

    return {
      asyncComponentPromises,
      beforeEnterHandlers,
      clientLoadFunctions,
      route,
      serverLoadFunctions,
    }
  }

  forward(state?: Record<string, unknown>): void {
    return this.go(1, state)
  }

  go(delta: number, state?: Record<string, unknown>): void {
    if (state) {
      this.silentGo(delta, () => this.onPopState(state))
    }
    else {
      history.go(delta)
    }
  }

  async handleClient(
    location: Location | string,
    ssrState?: SSRState,
  ): Promise<false | Route | undefined> {
    try {
      const clientLoadFunctions: ClientLoadFunctionWrapper[] = []
      const _route = this.findRoute(location, { clientLoadFunctions })

      if (!_route) {
        return
      }

      const { asyncComponentPromises, beforeEnterHandlers, route } = _route

      let ret = await this.callNavigationGuards(
        (this.current?._beforeLeaveHandlers || []).concat(
          this.beforeChangeHandlers,
          beforeEnterHandlers,
        ),
        route,
      )

      if (ret !== true) {
        return ret
      }

      const modules = await Promise.all(asyncComponentPromises)

      ret = await this.callNavigationGuards(
        modules
          .filter((m): m is ComponentModule => 'beforeEnter' in m)
          .map(m => <NavigationGuard>m.beforeEnter),
        route,
      )

      if (ret !== true) {
        return ret
      }

      if (!ssrState) {
        await Promise.all(clientLoadFunctions.map(fn => fn(route)))
      }
      else {
        const restore = (
          ssrState: SSRState,
          views: Record<string, ResolvedView>,
        ) => {
          Object.entries(ssrState).forEach(([name, ssrStateNode]) => {
            const view = views[name]

            if (ssrStateNode.data) {
              const load = (view.component as ComponentModule)
                .load as LoadFunction

              const records: Record<string, Record<string, unknown>> = {}
              route._ssrStateMap.set(load, records)
              let key = ''
              const { props } = view

              if (props) {
                if (load.cacheKey) {
                  key = JSON.stringify(load.cacheKey.map(k => props[k]))
                }
                else {
                  key = JSON.stringify(Object.values(props))
                }
              }

              records[key] = ssrStateNode.data
            }

            if (ssrStateNode.children && view.children) {
              restore(ssrStateNode.children, view.children)
            }
          })
        }

        route.ssrState = ssrState
        restore(route.ssrState, route._views)
      }

      const from = this.current
      this.current = route
      this.emit('update', route)
      setTimeout(() => this.emit('afterChange', route, from))
      return route
    }
    catch (e) {
      if (e instanceof Error) {
        this.emit('error', e)
        throw e
      }
    }
  }

  async handleServer(
    location: Location | string,
    loadFunctionContext?: unknown,
  ): Promise<Route | undefined> {
    const serverLoadFunctions: ServerLoadFunctionWrapper[] = []
    const _route = this.findRoute(location, { serverLoadFunctions })

    if (!_route) {
      return
    }

    const { asyncComponentPromises, route } = _route
    await Promise.all(asyncComponentPromises)

    await Promise.all(
      serverLoadFunctions.map(fn => fn(route, loadFunctionContext)),
    )

    return route
  }

  href(location: Location | string): string {
    return this.toExternalUrl(this.locationToInternalURL(location))
  }

  off(event: Event, handler: EventHandler): void {
    if (event === 'beforeChange') {
      this.beforeChangeHandlers = this.beforeChangeHandlers.filter(
        fn => fn !== handler,
      )
    }
    else if (event === 'beforeCurrentRouteLeave' && this.current) {
      this.current._beforeLeaveHandlers
        = this.current._beforeLeaveHandlers.filter(fn => fn !== handler)
    }
    else if (event === 'update') {
      this.updateHandlers = this.updateHandlers.filter(fn => fn !== handler)
    }
    else if (event === 'afterChange') {
      this.afterChangeHandlers = this.afterChangeHandlers.filter(
        fn => fn !== handler,
      )
    }
    else if (event === 'error') {
      this.errorHandlers = this.errorHandlers.filter(fn => fn !== handler)
    }
  }

  on(event: 'beforeChange', handler: NavigationGuard): void
  on(event: 'beforeCurrentRouteLeave', handler: NavigationGuard): void
  on(event: 'update', handler: UpdateHandler): void
  on(event: 'afterChange', handler: AfterChangeHandler): void
  on(event: 'error', handler: Errorhandler): void
  on(event: Event, handler: EventHandler): void
  on(event: Event, handler: EventHandler): void {
    if (event === 'beforeChange') {
      this.beforeChangeHandlers.push(handler)
    }
    else if (event === 'beforeCurrentRouteLeave') {
      this.current?._beforeLeaveHandlers.push(handler)
    }
    else if (event === 'update') {
      this.updateHandlers.push(handler)
    }
    else if (event === 'afterChange') {
      this.afterChangeHandlers.push(handler)
    }
    else if (event === 'error') {
      this.errorHandlers.push(handler as Errorhandler)
    }
  }

  once(event: 'beforeChange', handler: NavigationGuard): void
  once(event: 'beforeCurrentRouteLeave', handler: NavigationGuard): void
  once(event: 'update', handler: UpdateHandler): void
  once(event: 'afterChange', handler: AfterChangeHandler): void
  once(event: 'error', handler: Errorhandler): void
  once(
    event: Event,
    handler: AfterChangeHandler | NavigationGuard | UpdateHandler,
  ): void {
    const h = (...args: unknown[]) => {
      this.off(event, h)
      // @ts-expect-error A spread argument must either have a tuple type or be passed to a rest parameter. ts(2556)
      handler(...args)
    }

    this.on(event, h)
  }

  parseLocation(location: Location | string): ParsedLocation {
    const url = this.locationToInternalURL(location)

    return {
      hash: url.hash,
      href: this.toExternalUrl(url),
      path: url.pathname,
      query: new StringCaster(url.searchParams),
      search: url.search,
      state:
        typeof location === 'string' || !location.state ? {} : location.state,
    }
  }

  async push(location: Location | string): Promise<void> {
    const route = await this.handleClient(location)

    if (route) {
      history.pushState(
        {
          ...route.state,
          __position__: history.state.__position__ + 1,
        },
        '',
        route.href,
      )

      window.scrollTo(0, 0)
    }
  }

  async replace(location: Location | string): Promise<void> {
    const route = await this.handleClient(location)

    if (route) {
      history.replaceState(
        {
          ...route.state,
          __position__: history.state.__position__,
        },
        '',
        route.href,
      )

      window.scrollTo(0, 0)
    }
  }

  setState(state: Record<string, unknown>): void {
    if (this.current) {
      Object.assign(this.current.state, state)

      history.replaceState(
        {
          ...this.current.state,
          __position__: history.state.__position__,
        },
        '',
      )

      this.updateRoute(this.current)
      this.emit('update', this.current)
    }
  }

  start(
    onReady: () => void,
    {
      clientContext,
      path,
      ssrState,
    }: {
      clientContext?: unknown
      path?: Location | string
      ssrState?: SSRState
    } = {},
  ) {
    this.clientContext = clientContext
    window.addEventListener('popstate', this.onPopStateWrapper)

    if (!history.state?.__position__) {
      history.replaceState({ __position__: history.length }, '')
    }

    if (ssrState) {
      this.handleClient(
        path || { path: location.href, state: history.state },
        ssrState,
      )
      this.once('update', onReady)
    }
    else {
      if (path) {
        this.handleClient(path)
      }
      else {
        this.replace({
          path: location.href,
          state: history.state,
        })
      }

      onReady()
    }
  }

  test(location: Location | string): boolean {
    return Boolean(this.urlRouter.find(this.parseLocation(location).path))
  }
}

export default Router
