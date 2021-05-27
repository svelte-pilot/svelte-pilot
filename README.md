# svelte-pilot
A svelte router with SSR (Server-Side Rendering) support.

- [svelte-pilot](#svelte-pilot)
  - [Install](#install)
  - [Usage](#usage)
    - [Client-Side Rendering](#client-side-rendering)
    - [Server-Side Rendering](#server-side-rendering)
      - [Server entry](#server-entry)
      - [Client entry](#client-entry)
  - [Constructor](#constructor)
    - [routes](#routes)
      - [Simple routes](#simple-routes)
      - [Dynamic import Svelte component](#dynamic-import-svelte-component)
      - [Pass props to Svelte component](#pass-props-to-svelte-component)
      - [Props from query string](#props-from-query-string)
      - [Props from path params](#props-from-path-params)
      - [Catch-all route](#catch-all-route)
      - [Nested routes](#nested-routes)
      - [Multiple `RouterView`s](#multiple-routerviews)
      - [Override `RouterView`s](#override-routerviews)
      - [Share meta data between `RouterView`s](#share-meta-data-between-routerviews)
      - [Force re-rendering](#force-re-rendering)
      - [`beforeEnter` guard hook](#beforeenter-guard-hook)
        - [Params:](#params)
        - [Returns:](#returns)
      - [`beforeLeave` guard hook](#beforeleave-guard-hook)
    - [base](#base)
    - [pathQuery](#pathquery)
    - [mode](#mode)
  - [Route object](#route-object)
    - [path](#path)
    - [params](#params-1)
    - [search](#search)
    - [query](#query)
    - [hash](#hash)
    - [href](#href)
    - [state](#state)
    - [meta](#meta)
  - [Location object](#location-object)
    - [path](#path-1)
    - [params](#params-2)
    - [query](#query-1)
    - [hash](#hash-1)
    - [state](#state-1)
  - [\<RouterLink>](#routerlink)
    - [Props](#props)
  - [Properties](#properties)
    - [router.current](#routercurrent)
  - [Methods](#methods)
    - [router.handle()](#routerhandle)
      - [Params](#params-3)
      - [Returns](#returns-1)
    - [router.parseLocation()](#routerparselocation)
    - [router.href()](#routerhref)
    - [router.push()](#routerpush)
    - [router.replace()](#routerreplace)
    - [router.setState()](#routersetstate)
    - [router.go()](#routergo)
    - [router.back()](#routerback)
    - [router.forward()](#routerforward)
    - [router.on()](#routeron)
      - [Hooks running order](#hooks-running-order)
    - [router.off()](#routeroff)
    - [router.once()](#routeronce)
  - [Get current route and router instance in components](#get-current-route-and-router-instance-in-components)
  - [License](#license)

## Install
```
npm install svelte-pilot
```

## Usage

Checkout [svelte-vite-ssr](https://github.com/jiangfengming/svelte-vite-ssr) template.

### Client-Side Rendering

```ts
import { Router, ClientApp } from 'svelte-pilot';

const router = new Router({
  // options
});

new ClientApp({
  target: document.body,

  props: {
    router
  }
});
```

### Server-Side Rendering

#### Client entry

`client.ts`:

```ts
import { ClientApp, SSRState } from 'svelte-pilot';
import router from './router';

declare global {
  interface Window {
    __SSR_STATE__: SSRState
  }
}

// wait unitl async components loaded
// prevent screen flash
router.once('update', () =>
  new ClientApp({
    target: document.body,
    hydrate: true,

    props: {
      router,
      ssrState: window.__SSR_STATE__
    }
  })
);
```

#### Server entry

`server-render.ts`:

```ts
import { ServerApp } from 'svelte-pilot';
import router from './router';

type RenderParams = {
  url: string,
  ctx?: unknown,
  template: string,
};

type RenderResult = {
  error?: Error,
  status: number,
  headers?: Record<string, string>,
  body?: string
};

export default async function(args: RenderParams): Promise<RenderResult> {
  try {
    return await render(args);
  } catch (e) {
    return {
      error: e,
      status: 500,

      headers: {
        'Content-Type': 'text/html',
        'Cache-Control': 'no-store'
      },

      body: args.template // Fallback to CSR
    };
  }
}

async function render({ url, ctx, template }: RenderParams): Promise<RenderResult> {
  const matchedRoute = await router.handle('http://127.0.0.1' + url, ctx);

  if (!matchedRoute) {
    console.error('No route found for url:', url);

    if (new URL(url, 'http://127.0.0.1').pathname === '/') {
      return {
        status: 404,
        body: 'Page Not Found',
        headers: { 'content-type': 'text/plain' }
      };
    } else {
      return {
        status: 301,

        headers: {
          location: '/',
          'Cache-Control': 'no-store'
        }
      };
    }
  }

  const { route, ssrState } = matchedRoute;

  const res = route.meta.response as { status?: number, headers?: Record<string, string> } | null;

  if (res?.headers?.location) {
    return {
      status: res.status || 301,
      headers: res.headers
    };
  } else {
    const body = ServerApp.render({ router, route, ssrState });
    body.html += `<script>__SSR_STATE__ = ${serialize(ssrState)}</script>`;

    return {
      status: res?.status || 200,

      headers: {
        'Content-Type': 'text/html',
        ...res?.headers
      },

      body: template
        .replace('</head>', body.head + '<style>' + body.css.code + '</style></head>')
        .replace('<body>', '<body>' + body.html)
    };
  }
}

function serialize(data: unknown) {
  return JSON.stringify(data).replace(/</g, '\\u003C').replace(/>/g, '\\u003E');
}
```

`server.ts`

```ts
import http from 'http';
import path from 'path';
import serveStatic from 'serve-static';
import render from './server-render';
// @ts-expect-error handle by rollup-plugin-string
import template from './index.html';

const PORT = Number(process.env.PORT) || 3000;

const serve = serveStatic(path.resolve(__dirname, '../client'));

http.createServer(async(req, res) => {
  const url = req.url as string;
  console.log(url);

  if (url.startsWith('/_assets/')) {
    serve(req, res, () => {
      res.statusCode = 404;
      res.end('Not Found');
    });
  } else {
    const { error, status, headers, body } = await render(
      {
        url,
        template,

        ctx: {
          cookies: req.headers.cookie
            ? Object.fromEntries(
              new URLSearchParams(req.headers.cookie.replace(/;\s*/g, '&'))
                // @ts-expect-error Property 'entries' does not exist on type 'URLSearchParams'.ts(2339)
                .entries()
            )
            : {},

          headers: req.headers
        }
      }
    );

    if (error) {
      console.error(error);
    }

    res.writeHead(status, headers);
    res.end(body);
  }
}).listen(PORT);
```

#### Fetch data on server side
Svelte component can export a `load` function to fetch the data on server side.

`load` function arguments:
* `props`: `props` defined in the RouterView config.
* `route`: The current [Route](#route-object) object.
* `ssrContext`: anything you passed to `router.handle()`.

The returned state object will be passed to component props.
On the client side, when a navigation is triggered through `history.pushState` / `history.replaceState` / `popstate` event,
the state object will be purged.

```html
<script context="module">
  import Child, { load as loadChild } from './Child.svelte';

  export async function load(props, route, ssrCtx) {
    // Mock http request
    const ssrState = await fetchData(props.page, token: ssrCtx.cookies.token);
    
    // load child component
    const childState = await loadChild({ foo: ssrState.foo }, route, ssrCtx);

    // Set response headers. Optional
    route.meta.response = {
      status: 200,

      headers: {
        'X-Foo': 'Bar'
      }
    };

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
    // SSR state will be set to undefined when history.pushState / history.replaceState / popstate event is called.
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
`RouterViewDefGroup`. Required. Define the routes.

TypeScript definitions:

```ts
import { SvelteComponent } from 'svelte';

type RouterViewDefGroup = Array<RouterViewDef | RouterViewDef[]>;

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

type SyncComponent = ComponentModule | typeof SvelteComponent;
type AsyncComponent = () => Promise<SyncComponent>;
type RouteProps = SerializableObject | ((route: Route) => SerializableObject);
type KeyFn = (route: Route) => PrimitiveType;
type GuardHook = (to: Route, from?: Route) => GuardHookResult | Promise<GuardHookResult>;

type ComponentModule = {
  default: typeof SvelteComponent,
  load?: LoadFn,
  beforeEnter?: GuardHook
};

type LoadFn = (props: Record<string, any>, route: Route, ssrContext?: unknown) => Promise<SerializableObject>;
type GuardHookResult = void | boolean | string | Location;

type Location = {
  path: string,
  params?: Record<string, string | number | boolean>,
  query?: Query,
  hash?: string,
  state?: SerializableObject
};

type Query = Record<string, PrimitiveType | PrimitiveType[]> | URLSearchParams;
type PrimitiveType = string | number | boolean | null | undefined;
type SerializableObject = { [name: string]: PrimitiveType | PrimitiveType[] | { [name: string]: SerializableObject } };
```

#### Simple routes

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

#### Dynamic import Svelte component

```ts
const routes = [
  {
    path: '/foo',
    component: () => import('./views/Foo.svelte')
  }
];
```

#### Pass props to Svelte component
  
```ts
const routes = [
  {
    path: '/foo',
    component: () => import('./views/Foo.svelte'),
    props: { page: 1 }
  }
];
```

#### Props from query string

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

#### Props from path params
  
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

#### Catch-all route

```ts
const routes = [
  {
    path: '(.*)', // param name can be omitted
    component: () => import('./views/NotFound.svelte')
  }
];
```

#### Nested routes

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

        // children alse can have children.
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

<nav>My beautiful navigation bar</nav>

<main>
  <!-- Nested route component will be injected here -->
  <RouterView />
</main>

<footer>My footer</footer>
```

#### Multiple `RouterView`s

```ts
const routes = [
  {
    component: () => import('./views/Root.svelte')，

    children: [
      {
        name: 'aside', // <---- pairs with <RouterView name="aside" />
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

      // use array to group AsideB and Bar,
      // then when rendering '/bar' page, AsideB will be used.
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

#### Share meta data between `RouterView`s

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

`meta` can be a plain object, or a function that receives a [Route](#route-object) object as argument and returns a plain object.

All meta objects will be merged together.
If objects have a property with the same name, the nested RouterView's meta property will overwrite the outer ones.

#### Force re-rendering
By default, when component is the same when route changes, the component will not re-rendered.
You can force it to re-render by setting a `key` generator:

```ts
const routes = [
  {
    path: '/articles/:id',
    component: () => import('./views/Article.svelte'),
    key: route => route.query.string('id')
  }
];
```

#### `beforeEnter` guard hook

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

When the navigation is triggered,
the `beforeEnter` hook functions in the incoming RouterView configs will be triggered.

##### Params:
* `to`: The [Route](#route-object) object will be changed to.
* `from`: The current [Route](#route-object) object.

##### Returns:
* `undefined` or `true`: Allow the navigation.
* `false`: Abort the navigation and rollback.
* path string or [Location](#location-object) object: redirect to it.

#### `beforeLeave` guard hook

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

When the route is going to be changed,
the `beforeLeave` hook functions in the current RouterView configs will be triggered.

The params and return value is the same as `beforeEnter` hook.

### base
`string`. Optional. The base path of the app.
If your application is serving under `https://www.example.com/app/`, then the `base` is `/app/`.
If you want the root path not end with slash, you can set the base without ending slash, like `/app`.
Defaults to `/`.

Note, when using `router.push()`, `router.replace()` and `router.handle()`, Only if you pass an absolute URL (starting with protocol),
The base part will be trimmed when matching the route.

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

// won't work
router.handler('/app/bar');
```

### pathQuery
`string`. Optional. Uses the query name as router path.
It is useful when serving the application under `file:` protocol.

e.g.
```ts
const router = new Router({
  pathQuery: '__path__'
});
```

`file:///path/to/index.html?__path__=/home` will route to `/home`.

### mode
`'server'` | `'client'`. Optional. Defines the running mode.
If not set, it will auto detect by `typeof window === 'object' ? 'client' : 'server'`.

## Route object
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
`string`. A string containing an initial `'/'` followed by the path of the URL not including the query string or fragment.

### params
`StringCaster`. A [StringCaster](https://github.com/jiangfengming/cast-string#stringcaster) object that wraps the path params.

### search
`string`. A string containing a `'?'` followed by the parameters of the URL.

### query
`StringCaster`. A [StringCaster](https://github.com/jiangfengming/cast-string#stringcaster) object that wraps the `URLSearchParams` object.

### hash
`string`. A string containing a `'#'` followed by the fragment identifier of the URL.

### href
`string`. The relative URL of the route.

### state
`object`. [history.state](https://developer.mozilla.org/en-US/docs/Web/API/History/state).
### meta
`object`. A plain object used to share information between RouterView configs.


## Location object
A Location object is used to describe the destination of a navigation. It is made up by the following properties:

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
`string`. A string containing an initial `'/'` followed by the path of the URL.
It can include query string and hash but not recommended, because you need to handle non-ASCII chars manually.

### params
`object`. A key-value object to fill into the param placeholder of `path`.
For example,  `{ path: '/articles/:id', params: { id: 123 } }` is equal to `{ path: '/articles/123 }`.
It is safer to use params instead of concatting strings by hand,
because `encodeURIComponent()` is applied on the param value for you.

### query
`object` | `URLSearchParams`.
If a plain object is provided,
its format is the same as the return value of the [querystring](https://nodejs.org/api/querystring.html)
module's [parse()](https://nodejs.org/api/querystring.html#querystring_querystring_parse_str_sep_eq_options) method:

```ts
{
  foo: 'bar',
  abc: ['xyz', '123']
}
```

### hash
`string`. A string containing a `'#'` followed by the fragment identifier of the URL.

### state
`object`. The state object of the location.

## \<RouterLink>
A navigation component. It renders an `<a>` element.

```html
<script>
  import { RouterLink } from 'svelte-pilot';
</script>

<RouterLink to={loaction} replace={true} style="color: red;" class="cls-name">Link</RouterLink>
```

### Props
* `to`: [Location](#location-object) | `string`.
* `replace`: `Boolean`. Defaults to `false`. If true, the navigation will be handled by `history.replaceState()`.
* `style`: `string`. Set the `style` attribute of `<a>` tag.
* `class`: `string`. Set the `class` attribute of `<a>` tag.
 
`<RouterLink>` always has `router-link` class.
If the location equals to the current route's path, `router-link-active` class will be on.

## Properties

### router.current
The current [Route](#route-object). It is only available in `client` mode.

## Methods
### router.handle()

```ts
router.handle(location, ssrContext)
```

Manually handle the route. Used in `server` mode. See [Server-Side Rendering](#server-side-rendering) for usage.

#### Params
* location: [Locaton](#location-object) or path string.
* ssrContext: `any`. I will be passed to the `load` function.

#### Returns
An object contains:

```ts
{
  route,
  ssrState
}
```

* `route`: [Route](#route-object) object.
* `ssrState`: A serializable object. It is used to inject into the html for hydration by the client side.

### router.parseLocation()

```ts
router.parseLocation(location: Location | string)
```

Parse the [Location](#location-object) object or path string, and return a subset of [Route](#route-object) object:

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

Returns the href of [Location](#location-object) object of path string. It can be used as `href` attribute of `<a>` tag.

### router.push()

```ts
router.push(location: Location | string)
```

Change the route by calling `history.pushState()`.

### router.replace()

```ts
router.replace(location: Location | string)
```

Replace the current route by calling `history.replaceState()`.

### router.setState()

```ts
router.setState(state)
```

Merge the state into the current route's state.

### router.go()

```ts
router.go(position, state)
```

Works like `history.go()`, but has an additional `state` parameter.
If `State` is set, It will be merged into the state object of the destination location.

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
Add a hook function that will be called when the specified event fires.

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

#### Hooks running order
1. Navigation triggered.
2. Call `beforeLeave` hooks in the outgoing `RouterView` configs.
3. Call `beforeCurrentRouteLeave` hooks registered via `router.on('beforeCurrentRouteLeave', hook)`.
4. Call `beforeChange` hooks registered via `router.on('beforeChange', hook)`.
5. Call `beforeEnter` hooks in the incoming `RouterView` configs and
   `beforeEnter` hooks exported from context module (`<script context="module">`) of aync Svelte component.
6. Call `beforeEnter` hooks exported from context module of async Svelte component.
7. Call `update` hooks registered via `router.on('update', hook)`.
8. Call `afterChange` hooks registered via `router.on('afterChange', hook)`.

### router.off()

```ts
router.off(event, hook)
```

Removes the specified event hook.

### router.once()

Run a hook function once.

## Get current route and router instance in components

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
[MIT](LICENSE)
