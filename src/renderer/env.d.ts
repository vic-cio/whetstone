import type { WhetstoneApi } from '../preload'

declare global {
  interface Window {
    whetstone: WhetstoneApi
  }
}

export {}
