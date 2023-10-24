import _ServerApp from './ServerApp.svelte'

type ServerSideComponent = {
  render: (
    props?: Record<string, unknown>,
    { context }?: { context?: Map<unknown, unknown> }
  ) => {
    html: string
    css: { code: string; map: string }
    head: string
  }
}

export { default as ClientApp } from './ClientApp.svelte'
export {
  default as Link,
  options as linkOptions,
  setOptions as setLinkOptions
} from './Link.svelte'
export * from './Router'
export { default as Router } from './Router'
export { default as View } from './View.svelte'
export * from './ctxKeys'
export const ServerApp = (<unknown>_ServerApp) as ServerSideComponent
