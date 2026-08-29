import { app, safeStorage } from 'electron'
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { SettingsPublic, SettingsUpdate } from '../shared/types'

interface StoredSettings {
  baseUrl: string
  model: string
  /** base64 of safeStorage.encryptString(apiKey) when OS encryption is available. */
  apiKeyEncrypted?: string
  /** Fallback when safeStorage has no backend (e.g. Linux without a keyring). */
  apiKeyPlain?: string
}

const EMPTY: StoredSettings = { baseUrl: '', model: '' }

/**
 * BYOK settings persisted in the app's userData dir (never in the repo).
 * The API key is encrypted at rest via the OS keychain when available and the
 * file is chmod 600. The key is never sent back to the renderer.
 */
export class SettingsStore {
  private data: StoredSettings

  constructor() {
    this.data = this.read()
  }

  private get file(): string {
    return join(app.getPath('userData'), 'webmcp-lab-settings.json')
  }

  private read(): StoredSettings {
    try {
      return { ...EMPTY, ...JSON.parse(readFileSync(this.file, 'utf8')) }
    } catch {
      return { ...EMPTY }
    }
  }

  private write(): void {
    mkdirSync(app.getPath('userData'), { recursive: true })
    writeFileSync(this.file, JSON.stringify(this.data, null, 2), 'utf8')
    try {
      chmodSync(this.file, 0o600)
    } catch {
      // Windows has no POSIX modes; userData is already per-user.
    }
  }

  getPublic(): SettingsPublic {
    return {
      baseUrl: this.data.baseUrl,
      model: this.data.model,
      hasApiKey: Boolean(this.data.apiKeyEncrypted || this.data.apiKeyPlain),
      encryptionAvailable: safeStorage.isEncryptionAvailable()
    }
  }

  getApiKey(): string | null {
    if (this.data.apiKeyEncrypted) {
      try {
        return safeStorage.decryptString(Buffer.from(this.data.apiKeyEncrypted, 'base64'))
      } catch {
        return null
      }
    }
    return this.data.apiKeyPlain ?? null
  }

  getBaseUrl(): string {
    return this.data.baseUrl
  }

  getModel(): string {
    return this.data.model
  }

  update(update: SettingsUpdate): SettingsPublic {
    if (update.baseUrl !== undefined) this.data.baseUrl = update.baseUrl.trim()
    if (update.model !== undefined) this.data.model = update.model.trim()
    if (update.apiKey !== undefined) {
      delete this.data.apiKeyEncrypted
      delete this.data.apiKeyPlain
      const key = update.apiKey?.trim()
      if (key) {
        if (safeStorage.isEncryptionAvailable()) {
          this.data.apiKeyEncrypted = safeStorage.encryptString(key).toString('base64')
        } else {
          this.data.apiKeyPlain = key
        }
      }
    }
    this.write()
    return this.getPublic()
  }
}
