import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { GuestTab } from './guest'
import { SettingsStore } from './settings'
import { ChatEngine } from './chat'
import type {
  ChatEvent,
  OpenAIMessage,
  Rect,
  SettingsUpdate
} from '../shared/types'

// MUST run before app.ready — this is what turns document.modelContext on in
// every renderer (verified against Electron 44.0.0 / Chromium 152.0.7977.54).
app.commandLine.appendSwitch('enable-features', 'WebMCP')

const settings = new SettingsStore()

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    title: 'WebMCP Lab',
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })
  const tab = new GuestTab({
    onWebMCPState: (state) => win.webContents.send('webmcp:state', state),
    onNavState: (state) => win.webContents.send('guest:nav', state)
  })
  tab.attach(win)

  const chat = new ChatEngine({
    getCredentials: () => ({
      baseUrl: settings.getBaseUrl(),
      apiKey: settings.getApiKey(),
      model: settings.getModel()
    }),
    getTools: () => tab.state.tools,
    getPageInfo: () => ({
      url: tab.webContents.getURL(),
      title: tab.webContents.getTitle()
    }),
    executeTool: (name, argsJson) => tab.executeTool(name, argsJson)
  })

  ipcMain.on('guest:navigate', (_event, url: string) => tab.navigate(url))
  ipcMain.on('guest:reload', () => tab.webContents.reload())
  ipcMain.on('guest:back', () => tab.webContents.navigationHistory.goBack())
  ipcMain.on('guest:forward', () => tab.webContents.navigationHistory.goForward())
  ipcMain.on('guest:devtools', () => tab.openDevTools())
  ipcMain.on('guest:set-bounds', (_event, rect: Rect) => tab.setBounds(rect))
  ipcMain.on('guest:set-visible', (_event, visible: boolean) => tab.setVisible(visible))

  ipcMain.handle('webmcp:refresh', () => tab.probe())
  ipcMain.handle('webmcp:execute', (_event, name: string, argsJson: string) =>
    tab.executeTool(name, argsJson)
  )

  ipcMain.handle('settings:get', () => settings.getPublic())
  ipcMain.handle('settings:update', (_event, update: SettingsUpdate) => settings.update(update))

  ipcMain.handle('chat:send', (_event, messages: OpenAIMessage[]) =>
    chat.run(messages, (event: ChatEvent) => win.webContents.send('chat:event', event))
  )
  ipcMain.on('chat:abort', () => chat.abort())

  win.on('ready-to-show', () => win.show())

  win.on('closed', () => {
    ipcMain.removeAllListeners()
    const handlers = ['webmcp:refresh', 'webmcp:execute', 'settings:get', 'settings:update', 'chat:send']
    for (const channel of handlers) {
      ipcMain.removeHandler(channel)
    }
  })

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('dev.webmcp-lab')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
