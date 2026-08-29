import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { WebMCPLabApi } from '../shared/api'
import type {
  ChatEvent,
  ChatSendResult,
  ExecResult,
  NavState,
  OpenAIMessage,
  Rect,
  SettingsPublic,
  SettingsUpdate,
  WebMCPState
} from '../shared/types'

function subscribe<T>(channel: string, callback: (payload: T) => void): () => void {
  const listener = (_event: IpcRendererEvent, payload: T): void => callback(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: WebMCPLabApi = {
  navigate: (url: string): void => ipcRenderer.send('guest:navigate', url),
  reload: (): void => ipcRenderer.send('guest:reload'),
  goBack: (): void => ipcRenderer.send('guest:back'),
  goForward: (): void => ipcRenderer.send('guest:forward'),
  openGuestDevTools: (): void => ipcRenderer.send('guest:devtools'),
  setBrowserBounds: (rect: Rect): void => ipcRenderer.send('guest:set-bounds', rect),
  setGuestVisible: (visible: boolean): void => ipcRenderer.send('guest:set-visible', visible),

  refreshTools: (): Promise<WebMCPState> => ipcRenderer.invoke('webmcp:refresh'),
  executeTool: (name: string, argsJson: string): Promise<ExecResult> =>
    ipcRenderer.invoke('webmcp:execute', name, argsJson),

  getSettings: (): Promise<SettingsPublic> => ipcRenderer.invoke('settings:get'),
  updateSettings: (update: SettingsUpdate): Promise<SettingsPublic> =>
    ipcRenderer.invoke('settings:update', update),

  chatSend: (messages: OpenAIMessage[]): Promise<ChatSendResult> =>
    ipcRenderer.invoke('chat:send', messages),
  chatAbort: (): void => ipcRenderer.send('chat:abort'),

  onWebMCPState: (callback: (state: WebMCPState) => void): (() => void) =>
    subscribe('webmcp:state', callback),
  onNavState: (callback: (state: NavState) => void): (() => void) =>
    subscribe('guest:nav', callback),
  onChatEvent: (callback: (event: ChatEvent) => void): (() => void) =>
    subscribe('chat:event', callback)
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.api = api
}
