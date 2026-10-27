import { defineNuxtModule, addImportsDir, addServerHandler, createResolver } from '@nuxt/kit'

export interface ModuleOptions {
  /**
   * Your TikTool API key from https://tik.tools. Can also be set via the
   * TIKTOOL_API_KEY environment variable. It is kept server-side only.
   */
  apiKey?: string
  /**
   * Creators the site may connect to. The token route refuses any other
   * uniqueId so visitors cannot spend your quota on arbitrary creators.
   */
  creators?: string[]
  /** Skip the creators check and allow any creator. Off by default. */
  allowAnyCreator?: boolean
  /** Read the visitor IP from proxy headers. Enable when behind a proxy or CDN. */
  trustProxy?: boolean
  /** Tokens each visitor IP may request per minute. */
  tokensPerMinute?: number
}

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: 'tiktok-live-nuxt',
    configKey: 'tiktool',
    compatibility: {
      nuxt: '>=3.0.0',
    },
  },
  defaults: {
    apiKey: '',
    creators: [],
    allowAnyCreator: false,
    trustProxy: false,
    tokensPerMinute: 10,
  },
  setup(options, nuxt) {
    const resolver = createResolver(import.meta.url)

    // Private runtime config only: the browser gets short-lived tokens from
    // the token route, never the key itself.
    const apiKey = options.apiKey || process.env.TIKTOOL_API_KEY || ''
    nuxt.options.runtimeConfig.tiktool = {
      apiKey,
      creators: options.creators ?? [],
      allowAnyCreator: options.allowAnyCreator ?? false,
      trustProxy: options.trustProxy ?? false,
      tokensPerMinute: options.tokensPerMinute ?? 10,
    }

    addServerHandler({
      route: '/api/_tiktool/token',
      method: 'get',
      handler: resolver.resolve('runtime/server/token.get'),
    })

    addImportsDir(resolver.resolve('runtime/composables'))
  },
})
