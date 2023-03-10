# svelte-pilot
A Svelte router that supports Server-Side Rendering (SSR).

- [Install](#install)
- [Usage](#usage)
  - [Client-Side Rendering](#client-side-rendering)
  - [Server-Side Rendering](#server-side-rendering)
- [Constructor](#constructor)
  - [routes](#routes)
    - [Simple Routes](#simple-routes)
    - [Dynamic Import Svelte Component](#dynamic-import-svelte-component)
    - [Pass Props to Svelte Component](#pass-props-to-svelte-component)
    - [Props from Query String](#props-from-query-string)
    - [Props from Path](#props-from-path)
    - [Catch-all Route](#catch-all-route)
    - [Nested Routes](#nested-routes)
    - [Multiple `RouterView`s](#multiple-routerviews)
    - [Override `RouterView`s](#override-routerviews)
    - [Share Meta Data between `RouterView`s](#share-meta-data-between-routerviews)
    - [Force Re-rendering](#force-re-rendering)
    - [`beforeEnter` Guard Hook](#beforeenter-guard-hook)
    - [`beforeLeave` Guard Hook](#beforeleave-guard-hook)
  - [base](#base)
  - [pathQuery](#pathquery)
  - [mode](#mode)
- [Route Object](#route-object)
  - [path](#path)
  - [params](#params-1)
  - [search](#search)
  - [query](#query)
  - [hash](#hash)
  - [href](#href)
  - [state](#state)
  - [meta](#meta)
- [Location Object](#location-object)
  - [path](#path-1)
  - [params](#params-2)
  - [query](#query-1)
  - [hash](#hash-1)
  - [state](#state-1)
- [\<RouterLink\>](#routerlink)
  - [Props](#props)
- [Properties](#properties)
  - [router.current](#routercurrent)
- [Methods](#methods)
  - [router.handle()](#routerhandle)
  - [router.parseLocation()](#routerparselocation)
  - [router.href()](#routerhref)
  - [router.push()](#routerpush)
  - [router.replace()](#routerreplace)
  - [router.setState()](#routersetstate)
  - [router.go()](#routergo)
  - [router.back()](#routerback)
  - [router.forward()](#routerforward)
  - [router.on()](#routeron)
    - [Order of Hook Execution](#order-of-hook-execution)
  - [router.off()](#routeroff)
  - [router.once()](#routeronce)
- [Get the Current Route and Router Instance in Components](#get-the-current-route-and-router-instance-in-components)
- [License](#license)

## Install
```
npm install svelte-pilot
```

## Usage

Check out the [svelte-vite-ssr](https://github.com/jiangfengming/svelte-vite-ssr) template.

### Client-Side Rendering

```ts
import { Router, ClientApp } from 'svelte-pilot';

const router = new Router({
  // routes definitions
});

new ClientApp({
  target: document.body,

  props: {
    router
  }
});
```

### Server-Side Rendering
Check out [server-render.ts](https://github.com/jiangfengming/svelte-vite-ssr/blob/main/src/server-render.ts).

#### Fetch Data on the Server-Side
A Svelte component can export a load function to fetch data on the server-side.

The `load` function takes the following arguments:
* `props`: The `props` defined in the RouterView configuration.
* `route`: The current [Route](#route-object) object.
* `ssrContext`: Anything passed to `router.handle()`.

The returned state object is passed to the component props.
When navigation is triggered on the client-side through the [router.push()](#routerpush) or
[router.replace()](#routerreplace) methods, or the `popstate` event, the state object is purged.

```html
<script context="module">
  import Child, { load as loadChild } from './Child.svelte';

  export async function load(props, route, ssrCtx) {
    // Mock http request
    const ssrState = await fetchData(props.page, token: ssrCtx.cookies.token);
    
    // Load child component data
    const childState = await loadChild({ foo: ssrState.foo }, route, ssrCtx);

    // Returned data will be passed to component props
    return {
      ssrState,
      childState
    };
  }
</script>

<script>
  export let page;
  export let ssrState;
  export let childState;

  // Initialize data from SSR state.
  let data = ssrState;

  $: onPageChange(page);

  async function onPageChange(page) {
    // SSR state will be set to undefined when router.push() or router.replace() is called, or popstate event is fired.
    if (!ssrState) {
      data = await fetchData(page, getCookie('token'));
    }
  }
</script>

{#if data}
  <div>{data.content}</div>
  <Child foo={data.foo} {...childState} />
{/if}
```

## Constructor

```ts
import { Router } from 'svelte-pilot';

const router = new Router({
  routes,
  base,
  pathQuery,
  mode
});
```

### routes
`RouterViewDefGroup`. Required. The route definitions.

#### Simple Routes

```ts
import Foo from './views/Foo.svelte';
import Bar from './views/Bar.svelte';

const routes = [
  {
    path: '/foo',
    component: Foo
  },

  {
    path: '/bar',
    component: Bar
  }
];
```

#### Dynamic Import Svelte Component

```ts
const routes = [
  {
    path: '/foo',
    component: () => import('./views/Foo.svelte')
  }
];
```

#### Pass Props to Svelte Component
  
```ts
const routes = [
  {
    path: '/foo',
    component: () => import('./views/Foo.svelte'),
    props: { page: 1 }
  }
];
```

#### Props from Query String

`props` can be a function that returns a plain object. Its parameter is a [Route](#route-object) object.
 
```ts
const routes = [
  {
    path: '/foo',
    component: () => import('./views/Foo.svelte'),
    props: route => ({ page: route.query.int('page') })
  }
];
```

#### Props from Path
  
```ts
const routes = [
  {
    path: '/people/:username/:year(\\d+)-:month(\\d+)/:articleId(\\d+)',
    component: () => import('./views/User.svelte'),

    props: route => ({
      username: route.params.string('username'),
      year: route.params.int('year'),
      month: route.params.int('month'),
      articleId: route.params.int('articleId')
    })
  }
];
```

If regex is omitted, it defaults to `[^/]+`.

#### Catch-all Route

```ts
const routes = [
  {
    path: '(.*)', // param name can be omitted
    component: () => import('./views/NotFound.svelte')
  }
];
```

#### Nested Routes

```ts
const routes = [
  {
    component: () => import('./views/Root.svelte'),

    children: [
      {
        path: '/foo',
        component: () => import('./views/Foo.svelte')
      },

      {
        component: () => import('./views/LayoutA.svelte'),

        // children can also have children.
        // '/bar` page will be rendered as:
        // <Root>
        //   <LayoutA>
        //     <Bar>
        //   </LayoutA>
        // </Root>
        children: [
          {
            path: '/bar',
            component() => import('./views/Bar.svelte')
          }
        ]
      }
    ]
  }
]
```

`Root.svelte`:

```html
<script>
import { RouterView } from 'svelte-pilot';
</script>

<nav>Navigation</nav>

<main>
  <!-- Nested route component will be injected here -->
  <RouterView />
</main>

<footer>Footer</footer>
```

#### Multiple `RouterView`s

```ts
const routes = [
  {
    component: () => import('./views/Root.svelte')，

    children: [
      {
        name: 'aside', // <---- paired with <RouterView name="aside" />
        component: () => import('./views/Aside.svelte')
      },

      {
        path: '/foo',
        component: () => import('./views/Foo.svelte')
      }
    ]
  }
]
```

`Root.svelte`:

```html
<script>
  import { RouterView } from 'svelte-pilot';
</script>

<aside>
  <RouterView name="aside" />
</aside>

<main>
  <RouterView />
</main>
```

#### Override `RouterView`s

```ts
const routes = [
  {
    component: () => import('./views/Root.svelte'),

    children: [
      {
        name: 'aside',
        component: () => import('./views/AsideA.svelte')
      },

      {
        path: '/foo',
        component: () => import('./views/Foo.svelte')
      },

      // Use array to group AsideB.svelte and Bar.svelte,
      // then when rendering '/bar' page, AsideB.svelte will be used.
      [
        {
          name: 'aside',
          component: () => import('./views/AsideB.svelte')
        },

        {
          path: '/bar'
          component: () => import('./views/Bar.svelte')
        }
      ]
    ]
  }
]
```

#### Share Meta Data between `RouterView`s

```ts
const routes = [
  {
    component: () => import('./views/Root.svelte'),
    props: route => ({ active: route.meta.active }),
    meta: { theme: 'dark' },

    children: [
      {
        path: '/foo',
        component: () => import('./views/Foo.svelte'),
        meta: { active: 'foo' }
      },

      {
        path: '/bar',
        component: () => import('./views/Bar.svelte'),
        props: route => ({ theme: route.meta.theme }),
        meta: route => ({ active: route.query.string('active') })
      }
    ]
  }
]
```

`meta` can be a plain object, or a function that receives a [Route](#route-object) object as argument and returns a
plain object.

All meta objects will be merged together.
If objects have a property with the same name, the nested RouterView's meta property will overwrite the outer ones.

#### Force Re-rendering
By default, when component is the same when route changes, the component will not be re-rendered.
You can force it to re-render by setting a `key` generator.

```ts
const routes = [
  {
    path: '/articles/:id',
    component: () => import('./views/Article.svelte'),
    key: route => route.query.string('id')
  }
];
```

#### `beforeEnter` Guard Hook

```ts
const routes = [
  {
    path: '/foo',

    beforeEnter: (to, from) => {
      return hasLoggedIn ? true : '/login';
    }
  }
];
```

The `beforeEnter` hook is used to define a function that will be executed before a route transition occurs. When the
navigation is triggered, the `beforeEnter` hook function in the incoming RouterView configurations will be triggered.
##### Params:
* `to`: The [Route](#route-object) object that will be changed to.
* `from`: The current [Route](#route-object) object.

##### Returns:
* `undefined` or `true`: Allow the navigation to proceed.
* `false`: Abort the navigation and rollback to the previous route.
* A path string or [Location](#location-object) object: Redirect to the specified `path` or `location`.

#### `beforeLeave` Guard Hook

```ts
const routes = [
  {
    path: '/foo',

    beforeLeave: (to, from) => {
      // ...
    }
  }
]
```

the `beforeLeave` hook is used to define a function that will be executed before a route transition occurs. When the
route is going to be changed, the `beforeLeave` hook function in the current RouterView configurations will be
triggered.

The parameters and return value for the `beforeLeave` hook are the same as the `beforeEnter` hook.

### base
`string`. Optional. The base path of the app. Defaults to `/`.

If your application is hosted in a subdirectory of your domain, such as `https://www.example.com/app/`. In this case,
the base path would be `/app/`. If you want the root path to not end with a slash, you can set the base without the
ending slash, like `/app`.

Note that when using `router.push()`, `router.replace()`, or `router.handle()`, If you pass an absolute URL starting
with a protocol (e.g. `https://www.example.com/app/my-route`), the base part of the URL will be trimmed when matching
the route.

```js
const router = new Router({
  base: '/app',
  
  routes: [
    {
      path: '/bar',
      component: () => import('./Bar.svelte')
    }
  ]
});

// works
router.handle('http://127.0.0.1/app/bar');

// works
router.handle('/bar');

// won't work
router.handler('/app/bar');
```

### pathQuery
`string`. Optional. Uses the query name as the router path. This can be useful when serving the application under the
`file:` protocol.

e.g.
```ts
// file:///path/to/index.html?__path__=/home
const router = new Router({
  pathQuery: '__path__'
});
```

### mode
`'server'` | `'client'`. Optional. Defines the running mode.
If not set, it will auto detect by `typeof window !== 'undefined' && window === globalThis ? 'client' : 'server'`.

## Route Object
A route object contains these information of the matched route:

```ts
{
  path,
  params,
  search,
  query,
  hash,
  href,
  state,
  meta
}
```

### path
`string`. A string that starts with `/` and is followed by the path of the URL, but does not include the query string
or hash.

### params
`StringCaster`. A [StringCaster](https://github.com/jiangfengming/cast-string#stringcaster) object that wraps the path
parameters.

### search
`string`. A string that starts with `?` and is followed by the query string of the URL.

### query
`StringCaster`. A [StringCaster](https://github.com/jiangfengming/cast-string#stringcaster) object that wraps the
`URLSearchParams` object.

### hash
`string`. A string that starts with `#` and is followed by the fragment identifier of the URL.

### href
`string`. The relative URL of the route.

### state
`object`. [history.state](https://developer.mozilla.org/en-US/docs/Web/API/History/state) object.
### meta
`object`. A plain object that is used to share information between RouterView configurations.


## Location Object
A Location object is used to describe the destination of a navigation. It is made up of the following properties:

```ts
{
  path,
  params,
  query,
  hash,
  state
}
```

### path
`string`. A string that starts with `/` and is followed by the path of the URL. It can include the query string and
hash, but it is not recommended because it requires manual handling of non-ASCII characters.

### params
`object`. A key-value object used to fill in the parameter placeholders of the `path`. For example,
`{ path: '/articles/:id', params: { id: 123 } }` is equal to `{ path: '/articles/123 }`. It is safer to use `params`
instead of concatenating strings manually, because `encodeURIComponent()` is automatically applied to the parameter
values.

### query
`object` | `URLSearchParams`.
If a plain object is provided, its format is the same as the return value of the
[querystring](https://nodejs.org/api/querystring.html) module's
[parse()](https://nodejs.org/api/querystring.html#querystring_querystring_parse_str_sep_eq_options) method:

```ts
{
  foo: 'bar',
  abc: ['xyz', '123']
}
```

### hash
`string`. A string that starts with `#` and is followed by the fragment identifier of the URL.

### state
`object`. The state object associated with the location.

## \<RouterLink>
`<RouterLink>` is a navigation component that renders an `<a>` element.

```html
<script>
  import { RouterLink } from 'svelte-pilot';
</script>

<RouterLink to={loaction} replace={true}>Link</RouterLink>
```

### Props
* `to`: [Location](#location-object) | `string`. The destination location of the link.
* `replace`: `Boolean`. Defaults to `false`. If true, the navigation will be handled by `history.replaceState()`.
  
Other props will be passed to the `<a>` element as is.
 
The `<RouterLink>` component always has the `router-link` class. If the `to` location matches the current route's path,
the `router-link-active` class is added to the component.

## Properties

### router.current
The current [Route](#route-object). It is only available in `client` mode.

## Methods
### router.handle()

```ts
router.handle(location, ssrContext)
```

Manually handles the route. Used in `server` mode. See [Server-Side Rendering](#server-side-rendering) for usage.

#### Params
* location: [Locaton](#location-object) object or path string.
* ssrContext: `any`. It will be passed to the `load` function.

#### Returns
An object containing:

```ts
{
  route,
  ssrState
}
```

* `route`: [Route](#route-object) object.
* `ssrState`: A serializable object. It is used to inject into the html for hydration by the client-side.

### router.parseLocation()

```ts
router.parseLocation(location: Location | string)
```

Parse the [Location](#location-object) object or path string, and returns a subset of [Route](#route-object) object:

```ts
{
  path,
  query,
  search,
  hash,
  state,
  href
}
```

### router.href()

```ts
router.href(location: Location | string)
```

Returns the href of [Location](#location-object) object or path string. It can be used as the `href` attribute of an
`<a>` tag.

### router.push()

```ts
router.push(location: Location | string)
```

Changes the route by calling `history.pushState()`.

### router.replace()

```ts
router.replace(location: Location | string)
```

Replaces the current route by calling `history.replaceState()`.

### router.setState()

```ts
router.setState(state)
```

Merges the state into the current route's state.

### router.go()

```ts
router.go(position, state)
```

Works like `history.go()`, but has an additional `state` parameter.
If `State` is set, it will be merged into the state object of the destination location.

### router.back()

```ts
router.back(state)
```

Alias of `router.go(-1, state)`

### router.forward()

```ts
router.forward(state)
```

Alias of `router.go(1, state)`


### router.on()
Adds a hook function that will be called when the specified event fires.

```ts
router.on('beforeChange', hook: GuardHook)
router.on('beforeCurrentRouteLeave', hook: GuardHook)
router.on('update', hook: UpdateHook)
router.on('afterChange', hook: NormalHook)
```

```ts
type GuardHook = (to: Route, from?: Route) => GuardHookResult | Promise<GuardHookResult>;
type GuardHookResult = void | boolean | string | Location;
type UpdateHook = (route: Route) => void;
type NormalHook = (to: Route, from?: Route) => void;
```

#### Order of Hook Execution
1. Navigation is triggered.
2. `beforeLeave` hooks in the outgoing `RouterView` configurations are called.
3. `beforeCurrentRouteLeave` hooks registered via `router.on('beforeCurrentRouteLeave', hook)` are called.
4. `beforeChange` hooks registered via `router.on('beforeChange', hook)` are called.
5. `beforeEnter` hooks in the incoming `RouterView` configurations and `beforeEnter` hooks exported from the context
    module (`<script context="module">`) of an aync Svelte component are called.
6. `beforeEnter` hooks exported from the context module of an async Svelte component are called.
7. `update` hooks registered via `router.on('update', hook)` are called.
8. `afterChange` hooks registered via `router.on('afterChange', hook)` are called.

### router.off()

```ts
router.off(event, hook)
```

Removes the specified event hook.

### router.once()

Runs a hook function once.

## Get the Current Route and Router Instance in Components

```html
<script>
  import { getContext } from 'svelte';

  const router = getContext('__SVELTE_PILOT_ROUTER__');
  router.push('/foo');

  const routeStore = getContext('__SVELTE_PILOT_ROUTE__');
  console.log($routeStore.path);
</script>
```

## License
This project is licensed under the [MIT](LICENSE) License.
