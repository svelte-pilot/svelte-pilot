import UrlRouter from 'url-router'
import { StringCaster } from 'cast-string'

export default class Router {
  constructor({ origin, routes }) {
    const locationOrigin = typeof window === 'object' && window.location && window.location.origin
    this.origin = [].concat(locationOrigin || [], origin || [])
    this._routes = this._parseRoutes(routes)
    this._urlRouter = new UrlRouter(this._routes)
    this._beforeChangeHooks = []
    this._afterChangeHooks = []

    this.current = {
      path: null,
      fullPath: null,
      url: null,
      query: null,
      hash: null,
      state: null,
      params: null,
      meta: null,
      routerViews: null, // make <router-view> reactive
      _meta: [],
      _beforeEnter: [],
      _beforeLeave: []
    }
  }

  _parseRoutes(routerViews, siblings = [], layers = [], parsed = []) {
    const sib = routerViews.filter(v => !(v instanceof Array) && !v.path)
    const names = sib.map(v => v.name)

    // router views in same array has higher priority than outer ones
    siblings = siblings.filter(v => !names.includes(v.name)).concat(sib)

    routerViews.forEach(routerView => {
      if (routerView instanceof Array) {
        this._parseRoutes(routerView, siblings, layers, parsed)
      } else {
        const layer = siblings.filter(v => v.name !== routerView.name).concat(routerView)
        const _layers = layers.concat([layer])

        if (routerView.children) {
          this._parseRoutes(routerView.children, siblings, _layers, parsed)
        } else if (routerView.path) {
          parsed.push([routerView.path, _layers])
        }
      }
    })

    return parsed
  }

  setState(state) {
    this._history.setState(state)

    // Vue can not react if add new props into an existing object
    // so we replace it with a new state object
    this.current.state = Object.assign({}, this._history.current.state)

    // meta factory function may use state object to generate meta object
    // so we need to re-generate a new meta
    this._generateMeta(this.current)
  }

  beforeChange(hook) {
    this._beforeChangeHooks.push(hook.bind(this))
  }

  _beforeChange(to, from, action) {
    const route = to.route = {
      path: to.path,
      fullPath: to.fullPath,
      url: to.url,
      query: to.query,
      hash: to.hash,
      state: to.state,
      meta: {},
      params: null,
      routerViews: null,
      _meta: [],
      _beforeEnter: [],
      _beforeLeave: []
    }

    const _route = this._urlRouter.find(to.path)

    if (_route) {
      this._resolveRoute(route, _route)
    }

    const hooks = this.current._beforeLeave.concat(to.route._beforeEnter, this._beforeChangeHooks)

    if (!hooks.length) {
      return true
    }

    let promise = Promise.resolve(true)

    hooks.forEach(hook =>
      promise = promise.then(() =>
        Promise.resolve(hook(route, this.current, action, this)).then(result => {
          // if the hook abort or redirect the navigation, cancel the promise chain.
          if (result !== undefined && result !== true) {
            throw result
          }
        })
      )
    )

    return promise.catch(e => {
      if (e instanceof Error) {
        // encountered unexpected error
        throw e
      } else {
        // abort or redirect
        return e
      }
    })
  }

  _resolveRoute(to, _route) {
    to.params = new StringCaster(_route.params)

    const root = {}
    let routerView = root

    _route.handler.forEach(layer => {
      const last = Object.assign({}, layer[layer.length - 1])
      delete last.children
      const _layer = layer.slice(0, -1).concat(last)
      routerView.children = this._resolveRouterViews(_layer, to)
      routerView = routerView.children[last.name || 'default']
    })

    to.routerViews = root.children
    this._generateMeta(to)
  }

  _resolveRouterViews(routerViews, route) {
    const _routerViews = {}

    routerViews.forEach(({ name = 'default', path, component, props, meta, beforeEnter, children }) => {
      const com = _routerViews[name] = { component, props }

      if (path) {
        com.path = path

        if (beforeEnter) {
          Array.prototype.push.apply(route._beforeEnter, [].concat(beforeEnter).map(f => f.bind(this)))
        }
      }

      if (meta) {
        route._meta.push(meta)
      }

      if (children) {
        children = children.filter(v => !(v instanceof Array) && !v.path)
        com.children = this._resolveRouterViews(children, route)
      }
    })

    return _routerViews
  }

  _generateMeta(route) {
    route.meta = {}

    if (route._meta.length) {
      route._meta.forEach(m => Object.assign(route.meta, m instanceof Function ? m(route) : m))
    }
  }

  afterChange(hook) {
    this._afterChangeHooks.push(hook.bind(this))
  }

  _afterChange(to, from, action) {
    let promise = Promise.resolve(true)

    this._afterChangeHooks.forEach(hook =>
      promise = promise.then(() =>
        Promise.resolve(hook(to.route, this.current, action, this)).then(result => {
          if (result === false) {
            throw result
          }
        })
      )
    )

    promise.catch(e => {
      if (e instanceof Error) {
        // encountered unexpected error
        throw e
      } else {
        // abort or redirect
        return e
      }
    }).then(v => {
      if (v !== false) {
        Object.assign(this.current, to.route)
      }
    })
  }

  start(loc) {
    return this._history.start(loc)
  }

  normalize(loc) {
    return this._history.normalize(loc)
  }

  url(loc) {
    return this._history.url(loc)
  }

  dispatch(loc) {
    return this._history.dispatch(loc)
  }

  push(loc) {
    return this._history.push(loc)
  }

  replace(loc) {
    return this._history.replace(loc)
  }

  go(n, opts) {
    return this._history.go(n, opts)
  }

  back(opts) {
    return this._history.back(opts)
  }

  forward(opts) {
    return this._history.forward(opts)
  }

  captureLinkClickEvent(e) {
    return this._history.captureLinkClickEvent(e)
  }
}
