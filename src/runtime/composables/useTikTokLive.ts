import { ref, onMounted, onUnmounted, type Ref } from 'vue'
import { useRuntimeConfig } from '#imports'

interface TikTokEvent {
  event: string
  data: Record<string, any>
}

interface UseTikTokLiveOptions {
  /** Override the API key from module config */
  apiKey?: string
  /** Auto-connect on mount (default: true) */
  autoConnect?: boolean
  /** Events to listen for (default: all) */
  events?: string[]
}

interface UseTikTokLiveReturn {
  /** Whether the WebSocket is connected */
  connected: Ref<boolean>
  /** Current viewer count */
  viewers: Ref<number>
  /** Recent chat messages (last 100) */
  messages: Ref<TikTokEvent[]>
  /** Recent gift events (last 50) */
  gifts: Ref<TikTokEvent[]>
  /** All events (last 200) */
  allEvents: Ref<TikTokEvent[]>
  /** Total events received */
  eventCount: Ref<number>
  /** Last error */
  error: Ref<string | null>
  /** Connect to the stream */
  connect: () => void
  /** Disconnect from the stream */
  disconnect: () => void
  /** Register a custom event handler */
  on: (event: string, handler: (data: any) => void) => void
}

/**
 * Composable to connect to a TikTok LIVE stream and receive real-time events.
 *
 * @example
 * ```vue
 * <script setup>
 * const { messages, viewers, gifts, connected } = useTikTokLive('gbnews')
 * </script>
 *
 * <template>
 *   <div v-if="connected">
 *     <p>👀 {{ viewers }} viewers</p>
 *     <div v-for="msg in messages" :key="msg.data?.msgId">
 *       {{ msg.data?.user?.uniqueId }}: {{ msg.data?.comment }}
 *     </div>
 *   </div>
 * </template>
 * ```
 */
export function useTikTokLive(
  uniqueId: string,
  options: UseTikTokLiveOptions = {},
): UseTikTokLiveReturn {
  const config = useRuntimeConfig()
  const apiKey = options.apiKey || config.public.tiktool?.apiKey || ''

  const connected = ref(false)
  const viewers = ref(0)
  const messages = ref<TikTokEvent[]>([])
  const gifts = ref<TikTokEvent[]>([])
  const allEvents = ref<TikTokEvent[]>([])
  const eventCount = ref(0)
  const error = ref<string | null>(null)

  let ws: WebSocket | null = null
  const customHandlers = new Map<string, Set<(data: any) => void>>()

  function on(event: string, handler: (data: any) => void) {
    if (!customHandlers.has(event)) {
      customHandlers.set(event, new Set())
    }
    customHandlers.get(event)!.add(handler)
  }

  function emitCustom(event: string, data: any) {
    const handlers = customHandlers.get(event)
    if (handlers) {
      for (const handler of handlers) {
        try { handler(data) } catch (e) { console.error(e) }
      }
    }
  }

  function connect() {
    if (ws) return
    if (!apiKey) {
      error.value = 'No API key. Set it in nuxt.config.ts under tiktool.apiKey or via TIKTOOL_API_KEY env var.'
      console.error('[TikTool]', error.value)
      return
    }

    const cleanId = uniqueId.replace(/^@/, '')
    const url = `wss://api.tik.tools?uniqueId=${cleanId}&apiKey=${apiKey}`

    try {
      ws = new WebSocket(url)
    } catch (e: any) {
      error.value = e.message
      return
    }

    ws.onopen = () => {
      connected.value = true
      error.value = null
      emitCustom('connected', { uniqueId: cleanId })
    }

    ws.onmessage = (evt) => {
      try {
        const event: TikTokEvent = JSON.parse(evt.data)
        eventCount.value++

        const eventType = event.event || 'unknown'
        const data = event.data || event

        // Store in allEvents (cap at 200)
        allEvents.value = [event, ...allEvents.value].slice(0, 200)

        // Route to specific refs
        switch (eventType) {
          case 'chat':
            messages.value = [event, ...messages.value].slice(0, 100)
            break
          case 'gift':
            gifts.value = [event, ...gifts.value].slice(0, 50)
            break
          case 'roomUserSeq':
            viewers.value = data.viewerCount || 0
            break
        }

        // Emit to custom handlers
        emitCustom('event', event)
        emitCustom(eventType, data)
      } catch {
        // skip malformed messages
      }
    }

    ws.onclose = () => {
      connected.value = false
      ws = null
      emitCustom('disconnected', { uniqueId: cleanId })
    }

    ws.onerror = (e) => {
      error.value = 'WebSocket error'
      emitCustom('error', { error: 'WebSocket error' })
    }
  }

  function disconnect() {
    if (ws) {
      ws.close()
      ws = null
    }
    connected.value = false
  }

  const autoConnect = options.autoConnect !== false

  onMounted(() => {
    if (autoConnect) connect()
  })

  onUnmounted(() => {
    disconnect()
  })

  return {
    connected,
    viewers,
    messages,
    gifts,
    allEvents,
    eventCount,
    error,
    connect,
    disconnect,
    on,
  }
}
