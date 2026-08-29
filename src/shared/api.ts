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
} from './types'

/** The bridge the preload script exposes to the renderer as window.api. */
export interface WebMCPLabApi {
  navigate(url: string): void
  reload(): void
  goBack(): void
  goForward(): void
  openGuestDevTools(): void
  setBrowserBounds(rect: Rect): void
  /** Hide the guest view while renderer modals are open (it paints above the UI). */
  setGuestVisible(visible: boolean): void

  refreshTools(): Promise<WebMCPState>
  executeTool(name: string, argsJson: string): Promise<ExecResult>

  getSettings(): Promise<SettingsPublic>
  updateSettings(update: SettingsUpdate): Promise<SettingsPublic>

  chatSend(messages: OpenAIMessage[]): Promise<ChatSendResult>
  chatAbort(): void

  onWebMCPState(callback: (state: WebMCPState) => void): () => void
  onNavState(callback: (state: NavState) => void): () => void
  onChatEvent(callback: (event: ChatEvent) => void): () => void
}
