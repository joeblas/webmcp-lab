/// <reference types="vite/client" />

import type { WebMCPLabApi } from '../../shared/api'

declare global {
  interface Window {
    api: WebMCPLabApi
  }
}

export {}
