import UrlRouter from 'url-router';
import { StringCaster } from 'cast-string';
const detectedMode = typeof window === 'object' && window.history ? 'client' : 'server';
function appendSearchParams(searchParams, q) {
    if (q instanceof URLSearchParams) {
        q.forEach((val, key) => searchParams.append(key, val));
    }
    else {
        Object.entries(q).forEach(([key, val]) => {
            if (val !== null && val !== undefined) {
                if (Array.isArray(val)) {
                    val.forEach(v => searchParams.append(key, String(v)));
                }
                else {
                    searchParams.append(key, String(val));
                }
            }
        });
    }
}
class HookInterrupt extends Error {
    constructor(location) {
        super();
        this.location = location;
    }
}
export default class Router {
    constructor({ routes, base, pathQuery, mode = detectedMode }) {
        this.beforeChangeHooks = [];
        this.afterChangeHooks = [];
        this.updateHooks = [];
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
            this.replace({
                path: location.href,
                state: history.state
            });
        }
    }
    flatRoutes(routerViews, sideViews = [], stacks = [], result = {}) {
        const sideViewsInArray = routerViews.filter((v) => !Array.isArray(v) && !v.path);
        const sideViewNames = sideViewsInArray.map(v => v.name);
        // Router views in the same array have higher priority than outer ones.
        sideViews = sideViews.filter(v => !sideViewNames.includes(v.name)).concat(sideViewsInArray);
        for (const routerView of routerViews) {
            if (routerView instanceof Array) {
                this.flatRoutes(routerView, sideViews, stacks, result);
            }
            else if (routerView.path || routerView.children) {
                stacks = [...stacks, sideViews.filter(v => v.name !== routerView.name).concat(routerView)];
                if (routerView.path) {
                    result[routerView.path] = stacks;
                }
                else if (routerView.children) {
                    this.flatRoutes(routerView.children, sideViews, stacks, result);
                }
            }
        }
        return result;
    }
    handle(location, ssrContext) {
        return Promise.resolve().then(() => {
            const loc = this.parseLocation(location);
            const matchedURLRoute = this.urlRouter.find(loc.path);
            if (!matchedURLRoute) {
                return null;
            }
            const { routerViews, metaSetters, propSetters, keySetters, beforeEnterHooks, beforeLeaveHooks, asyncComponentPromises, loadFns, ssrState } = this.resolveRoute(matchedURLRoute.handler);
            const route = {
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
            return this.runGuardHooks((this.current?._beforeLeaveHooks || []).concat(this.beforeChangeHooks, beforeEnterHooks), route, () => Promise.all(asyncComponentPromises).then(modules => this.runGuardHooks(modules.filter((m) => 'beforeEnter' in m).map(m => m.beforeEnter), route, () => {
                this.updateRouteProps(route);
                this.updateRouteKeys(route);
                this.emit('update', route);
                this.emit('afterChange', route, this.current);
                if (this.mode === 'server') {
                    return Promise.all(loadFns.map(load => load(route, ssrContext))).then(() => ({
                        route,
                        ssrState
                    }));
                }
                else {
                    this.current = route;
                    return {
                        route,
                        ssrState: null
                    };
                }
            })));
        });
    }
    locationToInternalURL(location) {
        if (typeof location === 'string') {
            location = { path: location };
        }
        const url = new URL(location.path.replace(/:([a-z]\w*)/ig, (_, w) => encodeURIComponent(location.params?.[w])), 'file:');
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
            }
            else if (this.pathQuery) {
                url.pathname = url.searchParams.get(this.pathQuery) || '/';
                url.searchParams.delete(this.pathQuery);
            }
        }
        url.searchParams.sort?.();
        return url;
    }
    // If `base` is not ends with '/', and path is root ('/'), the ending slash will be trimmed.
    internalURLtoHref(url) {
        if (this.pathQuery) {
            const u = new URL(url.href);
            if (url.pathname !== '/') {
                u.searchParams.set(this.pathQuery, url.pathname);
            }
            return u.search + u.hash;
        }
        else {
            return (this.base
                ? this.base.endsWith('/')
                    ? this.base + url.pathname.slice(1)
                    : url.pathname === '/'
                        ? this.base
                        : this.base + url.pathname
                : url.pathname) + url.search + url.hash;
        }
    }
    parseLocation(location) {
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
    href(location) {
        return this.internalURLtoHref(this.locationToInternalURL(location));
    }
    runGuardHooks(hooks, to, onFulfilled) {
        let promise = Promise.resolve(null);
        for (const hook of hooks) {
            promise = promise.then(() => Promise.resolve(hook(to, this.current)).then(result => {
                if (result === true || result === undefined) {
                    return null;
                }
                else if (result === false) {
                    throw new HookInterrupt();
                }
                else {
                    throw new HookInterrupt(result);
                }
            }));
        }
        promise = promise.then(onFulfilled, e => {
            if (e instanceof HookInterrupt) {
                if (e.location) {
                    return this.handle(e.location);
                }
                else {
                    return null;
                }
            }
            else {
                throw e;
            }
        });
        return promise;
    }
    resolveRoute(stacks) {
        const routerViews = {};
        const metaSetters = [];
        const propSetters = [];
        const keySetters = [];
        const beforeEnterHooks = [];
        const beforeLeaveHooks = [];
        const asyncComponentPromises = [];
        const loadFns = [];
        const ssrState = this.mode === 'server' ? {} : null;
        let children = routerViews;
        let childState = ssrState;
        for (const stack of stacks) {
            this.resolveRouterViews(stack, true, children, metaSetters, propSetters, keySetters, beforeEnterHooks, beforeLeaveHooks, asyncComponentPromises, loadFns, childState);
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
    resolveRouterViews(stack, skipLastViewChildren, routerViews, metaSetters, propSetters, keySetters, beforeEnterHooks, beforeLeaveHooks, asyncComponentPromises, loadFns, ssrState) {
        stack.forEach(routerViewDef => {
            const { name = 'default', component, props, key, meta, beforeEnter, beforeLeave, children } = routerViewDef;
            const routerView = routerViews[name] = { name };
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
                }
                else {
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
                const promise = component();
                promise.then(component => {
                    routerViewDef.component = routerView.component = component;
                    if (routerView.component.load && ssrState) {
                        pushLoadFn(routerView.component.load, ssrState[name]);
                    }
                });
                asyncComponentPromises.push(promise);
            }
            else {
                routerView.component = component;
                if (routerView.component?.beforeEnter) {
                    beforeEnterHooks.push(routerView.component.beforeEnter);
                }
                if (routerView.component?.load && ssrState) {
                    pushLoadFn(routerView.component.load, ssrState[name]);
                }
            }
            function pushLoadFn(load, ssrState) {
                loadFns.push((route, ctx) => load(routerView.props || {}, route, ctx).then(data => ssrState.data = data));
            }
            if (children && (!skipLastViewChildren || routerViewDef !== stack[stack.length - 1])) {
                routerView.children = {};
                this.resolveRouterViews(children.filter((v) => !(v instanceof Array) && !v.path), false, routerView.children, metaSetters, propSetters, keySetters, beforeEnterHooks, beforeLeaveHooks, asyncComponentPromises, loadFns, ssrState ? ssrState[name].children = {} : null);
            }
        });
    }
    updateRoute(route) {
        this.updateRouteMeta(route);
        this.updateRouteProps(route);
        this.updateRouteKeys(route);
    }
    updateRouteMeta(route) {
        const meta = route.meta = {};
        route._metaSetters.forEach(v => Object.assign(meta, v instanceof Function ? v(route) : v));
    }
    updateRouteProps(route) {
        route._propSetters.forEach(fn => fn(route));
    }
    updateRouteKeys(route) {
        route._keySetters.forEach(fn => fn(route));
    }
    setState(state) {
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
    push(location) {
        this.handle(location).then(result => {
            if (this.mode === 'client' && result) {
                history.pushState({
                    ...result.route.state,
                    __position__: history.state.__position__ + 1
                }, '', result.route.href);
            }
        });
    }
    replace(location) {
        this.handle(location).then(result => {
            if (this.mode === 'client' && result) {
                history.replaceState({
                    ...result.route.state,
                    __position__: history.state.__position__
                }, '', result.route.href);
            }
        });
    }
    onPopState(state) {
        this.handle({
            path: location.href,
            state: { ...history.state, ...state }
        }).then(result => {
            if (result) {
                history.replaceState({
                    ...result.route.state,
                    __position__: history.state.__position__
                }, '', result.route.href);
            }
            else {
                this.silentGo(this.current.state.__position__ - history.state.__position__);
            }
        });
    }
    silentGo(delta, callback) {
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
    go(delta, state) {
        if (state) {
            this.silentGo(delta, () => this.onPopState(state));
        }
        else {
            history.go(delta);
        }
    }
    back(state) {
        return this.go(-1, state);
    }
    forward(state) {
        return this.go(1, state);
    }
    on(event, handler) {
        if (event === 'beforeChange') {
            this.beforeChangeHooks.push(handler);
        }
        else if (event === 'beforeCurrentRouteLeave') {
            this.current?._beforeLeaveHooks.push(handler);
        }
        else if (event === 'update') {
            this.updateHooks.push(handler);
        }
        else if (event === 'afterChange') {
            this.afterChangeHooks.push(handler);
        }
    }
    off(event, handler) {
        if (event === 'beforeChange') {
            this.beforeChangeHooks = this.beforeChangeHooks.filter(fn => fn !== handler);
        }
        else if (event === 'beforeCurrentRouteLeave' && this.current) {
            this.current._beforeLeaveHooks = this.current._beforeLeaveHooks.filter(fn => fn !== handler);
        }
        else if (event === 'update') {
            this.updateHooks = this.updateHooks.filter(fn => fn !== handler);
        }
        else if (event === 'afterChange') {
            this.afterChangeHooks = this.afterChangeHooks.filter(fn => fn !== handler);
        }
    }
    emit(event, to, from) {
        if (event === 'update') {
            this.updateHooks.forEach(fn => fn(to));
        }
        else if (event === 'afterChange') {
            this.afterChangeHooks.forEach(fn => fn(to, from));
        }
    }
}
