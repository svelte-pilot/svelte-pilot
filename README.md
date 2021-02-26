# svelte-pilot
A svelte router with SSR (Server-Side Rendering) support.

## Install
```
npm install svelte-pilot
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
  preload?: PreloadFn,
  beforeEnter?: GuardHook
};

type PreloadFn = (props: Record<string, any>, route: Route, ssrContext?: unknown) => Promise<SerializableObject>;
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

```js
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

```js
const routes = [
  {
    path: '/foo',
    component: () => import('./views/Foo.svelte')
  }
];
```

#### Pass props to Svelte component
  
```js
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
 
```js
const routes = [
  {
    path: '/foo',
    component: () => import('./views/Foo.svelte'),
    props: route => ({ page: route.query.int('page') })
  }
];
```

#### Props from path params
  
```js
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

```js
const routes = [
  {
    path: '(.*)', // param name can be omitted
    component: () => import('./views/NotFound.svelte')
  }
];
```

#### Nested routes

```js
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

```svelte
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

```js
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

```svelte
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

#### Override `RouterView`

```js
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

```js
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

```js
const routes = [
  {
    path: '/articles/:id',
    component: () => import('./views/Article.svelte'),
    key: route => route.query.string('id')
  }
];
```

#### `beforeEnter` guard hook

```js
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

```js
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

### pathQuery
`string`. Optional. Uses the query name as router path.
It is useful when serving the application under `file:` protocol.

e.g.
```js
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

```js
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

```js
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

```js
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

```svelte
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

```js
router.handle(location, ssrContext)
```

Manually handle the route. Used in `server` mode. See [Server-Side Rendering](#server-side-rendering) for usage.

#### Params
* location: [Locaton](#location-object) or path string.
* ssrContext: `any`. I will be passed to the `preload` function.

#### Returns
An object contains:

```js
{
  route,
  preloadData
}
```

* `route`: [Route](#route-object) object.
* `preloadData`: A serializable object. It is used to inject into the html for hydration by the client side.

### router.parseLocation()

```js
router.parseLocation(location: Location | string)
```

Parse the [Location](#location-object) object or path string, and return a subset of [Route](#route-object) object:

```js
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

```js
router.href(location: Location | string)
```

Returns the href of [Location](#location-object) object of path string. It can be used as `href` attribute of `<a>` tag.

### router.push()

```js
router.push(location: Location | string)
```

Change the route by calling `history.pushState()`.

### router.replace()

```js
router.replace(location: Location | string)
```

Replace the current route by calling `history.replaceState()`.

### router.setState()

```js
router.setState(state)
```

Merge the state into the current route's state.

### router.go()

```js
router.go(position, state)
```

Works like `history.go()`, but has an additional `state` parameter.
If `State` is set, It will be merged into the state object of the destination location.

### router.back()

```js
router.back(state)
```

Alias of `router.go(-1, state)`

### router.forward()

```js
router.forward(state)
```

Alias of `router.go(1, state)`


### router.on()
Add a hook function that will be called when the specified event fires.

```js
router.on('beforeChange', hook)
```

```js
router.on('beforeCurrentRouteLeave', hook)
```

```js
router.on('update', hook)
```

```js
router.on('afterChange', hook)
```

#### The full navigation resolution flow
1. Navigation triggered.
2. Call `beforeLeave` guards

### router.off()

```js
router.off(event, hook)
```

Removes the specified event hook.

## License
[MIT](LICENSE)
