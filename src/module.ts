import { defineNuxtModule, addImportsDir, createResolver } from '@nuxt/kit'

export interface ModuleOptions {
  /**
   * Your TikTool API key. Get one free at https://tik.tools
   * Can also be set via TIKTOOL_API_KEY environment variable.
   */
  apiKey?: string
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
  },
  setup(options, nuxt) {
    const resolver = createResolver(import.meta.url)

    // Make API key available at runtime via runtimeConfig
    const apiKey = options.apiKey || process.env.TIKTOOL_API_KEY || ''

    nuxt.options.runtimeConfig.public.tiktool = {
      apiKey,
    }

    // Auto-import composables
    addImportsDir(resolver.resolve('runtime/composables'))
  },
})
