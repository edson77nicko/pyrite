import { app, BrowserWindow, ipcMain, dialog, shell, safeStorage } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { autoUpdater } from 'electron-updater'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// The built directory structure
//
// ├─┬ dist-electron
// │ ├── main.js
// │ └── preload.mjs
// ├─┬ dist
// │ └── index.html

process.env.APP_ROOT = path.join(__dirname, '..')

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST

let win: BrowserWindow | null = null

function createWindow() {
  win = new BrowserWindow({
    title: 'Pyrita',
    width: 1300,
    height: 820,
    minWidth: 920,
    minHeight: 620,
    frame: false, // Frameless window with custom Obsidian-like header
    backgroundColor: '#121214',
    icon: path.join(process.env.VITE_PUBLIC || '', 'favicon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  })

  // Window control event forwarders
  win.on('maximize', () => win?.webContents.send('window:maximizedChange', true))
  win.on('unmaximize', () => win?.webContents.send('window:maximizedChange', false))

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }

  // Setup auto-updater listeners and check
  setupAutoUpdater()
}

// Quit when all windows are closed, except on macOS.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

// IPC: Window Titlebar Controls
ipcMain.handle('window:minimize', () => {
  win?.minimize()
})

ipcMain.handle('window:maximize', () => {
  if (win?.isMaximized()) {
    win.unmaximize()
  } else {
    win?.maximize()
  }
  return win?.isMaximized() || false
})

ipcMain.handle('window:close', () => {
  win?.close()
})

ipcMain.handle('window:isMaximized', () => {
  return win?.isMaximized() || false
})

// IPC: Local Vault & File System (Phase 2)
ipcMain.handle('vault:getDefaultPath', () => {
  const docs = app.getPath('documents')
  const defaultPath = path.join(docs, 'Pyrite Vault')
  if (!fs.existsSync(defaultPath)) {
    fs.mkdirSync(defaultPath, { recursive: true })
  }
  return defaultPath
})

ipcMain.handle('vault:selectFolder', async () => {
  if (!win) return null
  const result = await dialog.showOpenDialog(win, {
    title: 'Selecionar Pasta do Cofre (Vault)',
    properties: ['openDirectory', 'createDirectory'],
  })
  if (result.canceled || result.filePaths.length === 0) {
    return null
  }
  return result.filePaths[0]
})

ipcMain.handle('vault:revealInExplorer', (_event, fullPath: string) => {
  if (fs.existsSync(fullPath)) {
    shell.showItemInFolder(fullPath)
  }
})

ipcMain.handle('vault:openInExplorer', (_event, folderPath: string) => {
  if (fs.existsSync(folderPath)) {
    shell.openPath(folderPath)
  }
})

// IPC: Discover known vaults (Pyrite default + Obsidian configs if present)
ipcMain.handle('vault:getKnownVaults', async () => {
  const vaults: { id: string; name: string; path: string; lastOpened: number }[] = []

  // 1. Default Pyrite Vault
  try {
    const docs = app.getPath('documents')
    const defaultVault = path.join(docs, 'Pyrite Vault')
    if (fs.existsSync(defaultVault)) {
      vaults.push({
        id: 'default-pyrite-vault',
        name: 'Pyrita Vault',
        path: defaultVault,
        lastOpened: Date.now()
      })
    }
  } catch (err) {
    console.warn('[Vault] Failed to read default docs path:', err)
  }

  // 2. Read Obsidian's obsidian.json if present
  try {
    const appData = process.env.APPDATA || path.join(app.getPath('home'), 'AppData', 'Roaming')
    const obsidianConfigPath = path.join(appData, 'obsidian', 'obsidian.json')
    if (fs.existsSync(obsidianConfigPath)) {
      const config = JSON.parse(fs.readFileSync(obsidianConfigPath, 'utf-8'))
      if (config.vaults && typeof config.vaults === 'object') {
        for (const [id, v] of Object.entries<any>(config.vaults)) {
          if (v && v.path && fs.existsSync(v.path)) {
            const vaultName = path.basename(v.path)
            if (!vaults.some(item => item.path.toLowerCase() === v.path.toLowerCase())) {
              vaults.push({
                id: `obsidian-${id}`,
                name: vaultName,
                path: v.path,
                lastOpened: v.ts || Date.now()
              })
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn('[Vault] Failed to read obsidian.json:', err)
  }

  return vaults
})

// IPC: Create a new vault folder on disk with starter note
ipcMain.handle('vault:createVault', async (_event, { parentPath, vaultName }: { parentPath: string; vaultName: string }) => {
  try {
    const safeName = vaultName.replace(/[/\\?%*:|"<>]/g, '_').trim()
    if (!safeName) {
      return { success: false, error: 'Nome do cofre inválido' }
    }
    const newVaultPath = path.join(parentPath, safeName)
    if (!fs.existsSync(newVaultPath)) {
      fs.mkdirSync(newVaultPath, { recursive: true })
    }

    return { success: true, vaultPath: newVaultPath }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
})

// Recursively read all .md files in the vault folder
interface VaultFileResult {
  title: string
  folder: string
  filePath: string
  content: string
  createdAt: number
  updatedAt: number
}

function scanVaultDirectory(dir: string, baseDir: string): VaultFileResult[] {
  const results: VaultFileResult[] = []
  if (!fs.existsSync(dir)) return results

  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    // Ignore hidden files / git
    if (entry.name.startsWith('.')) continue

    if (entry.isDirectory()) {
      results.push(...scanVaultDirectory(fullPath, baseDir))
    } else if (entry.isFile() && (entry.name.endsWith('.md') || entry.name.endsWith('.markdown') || entry.name.endsWith('.txt'))) {
      try {
        const stats = fs.statSync(fullPath)
        const content = fs.readFileSync(fullPath, 'utf-8')
        const relDir = path.relative(baseDir, dir)
        const folder = relDir && relDir !== '.' ? relDir.replace(/\\/g, '/') : 'Início'
        const title = entry.name.replace(/\.(md|markdown|txt)$/i, '')

        results.push({
          title,
          folder,
          filePath: fullPath,
          content,
          createdAt: stats.birthtimeMs || stats.ctimeMs,
          updatedAt: stats.mtimeMs,
        })
      } catch (err) {
        console.error('Error reading file:', fullPath, err)
      }
    }
  }
  return results
}

ipcMain.handle('vault:readVault', (_event, vaultPath: string) => {
  if (!vaultPath || !fs.existsSync(vaultPath)) return []
  return scanVaultDirectory(vaultPath, vaultPath)
})

ipcMain.handle('vault:saveFile', (_event, { vaultPath, folder, title, content }: { vaultPath: string; folder: string; title: string; content: string }) => {
  try {
    const safeTitle = title.replace(/[/\\?%*:|"<>]/g, '_').trim() || 'Sem título'
    const targetDir = folder && folder !== 'Início' ? path.join(vaultPath, folder.replace(/\//g, path.sep)) : vaultPath

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true })
    }

    const filePath = path.join(targetDir, `${safeTitle}.md`)
    fs.writeFileSync(filePath, content, 'utf-8')
    const stats = fs.statSync(filePath)
    return { success: true, filePath, updatedAt: stats.mtimeMs }
  } catch (err: any) {
    console.error('Failed to save file to vault:', err)
    return { success: false, error: err.message }
  }
})

ipcMain.handle('vault:deleteFile', async (_event, filePath: string) => {
  try {
    if (fs.existsSync(filePath)) {
      await shell.trashItem(filePath)
      return { success: true }
    }
    return { success: false, error: 'File not found' }
  } catch (err: any) {
    console.error('Failed to trash file:', err)
    return { success: false, error: err.message }
  }
})

ipcMain.handle('vault:createFolder', (_event, { vaultPath, folderPath }: { vaultPath: string; folderPath: string }) => {
  try {
    const targetDir = path.join(vaultPath, folderPath.replace(/\//g, path.sep))
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true })
    }
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
})

// --- Auto Updater Logic ---
autoUpdater.autoDownload = true
autoUpdater.autoInstallOnAppQuit = true

function setupAutoUpdater() {
  if (!app.isPackaged) {
    console.log('[AutoUpdater] Dev mode: Skipping automatic update check')
    return
  }

  autoUpdater.on('checking-for-update', () => {
    win?.webContents.send('updater:status', { status: 'checking' })
  })

  autoUpdater.on('update-available', (info) => {
    win?.webContents.send('updater:status', { status: 'available', version: info.version })
  })

  autoUpdater.on('update-not-available', () => {
    win?.webContents.send('updater:status', { status: 'not-available' })
  })

  autoUpdater.on('download-progress', (progress) => {
    win?.webContents.send('updater:status', {
      status: 'downloading',
      percent: Math.round(progress.percent),
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    win?.webContents.send('updater:status', { status: 'downloaded', version: info.version })
  })

  autoUpdater.on('error', (err) => {
    console.error('[AutoUpdater] Error:', err)
    win?.webContents.send('updater:status', { status: 'error', error: err?.message || 'Update failed' })
  })

  // Automatically check for updates 3 seconds after window opens
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      console.warn('[AutoUpdater] Check on start failed:', err.message)
    })
  }, 3000)
}

ipcMain.handle('updater:check', async () => {
  if (!app.isPackaged) {
    return { success: false, message: 'Dev mode' }
  }
  try {
    const result = await autoUpdater.checkForUpdates()
    return { success: true, updateInfo: result?.updateInfo }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('updater:quitAndInstall', () => {
  autoUpdater.quitAndInstall()
})

// ==========================================
// IPC: Secure AI Storage & LLM Chat Handlers
// ==========================================

interface StoredAiConfig {
  encryptedKey?: string
  isEncrypted?: boolean
  model: string
  multimodal: boolean
  updatedAt: number
}

interface StoredAiCredentials {
  activeProvider: string
  providers: Record<string, StoredAiConfig>
}

function getAiCredentialsPath(): string {
  return path.join(app.getPath('userData'), 'pyrite_ai_secure.json')
}

function readAiCredentials(): StoredAiCredentials {
  const defaultData: StoredAiCredentials = {
    activeProvider: 'openrouter',
    providers: {
      openrouter: { model: 'google/gemini-2.5-flash', multimodal: true, updatedAt: Date.now() },
      gemini: { model: 'gemini-2.5-flash', multimodal: true, updatedAt: Date.now() },
      openai: { model: 'gpt-4o-mini', multimodal: true, updatedAt: Date.now() },
      deepseek: { model: 'deepseek-chat', multimodal: false, updatedAt: Date.now() }
    }
  }

  try {
    const credPath = getAiCredentialsPath()
    if (fs.existsSync(credPath)) {
      const raw = fs.readFileSync(credPath, 'utf-8')
      const parsed = JSON.parse(raw)
      return {
        activeProvider: parsed.activeProvider || defaultData.activeProvider,
        providers: {
          ...defaultData.providers,
          ...(parsed.providers || {})
        }
      }
    }
  } catch (err) {
    console.error('[AI Storage] Error reading credentials file:', err)
  }

  return defaultData
}

function saveAiCredentials(data: StoredAiCredentials) {
  try {
    const credPath = getAiCredentialsPath()
    fs.writeFileSync(credPath, JSON.stringify(data, null, 2), 'utf-8')
  } catch (err) {
    console.error('[AI Storage] Error writing credentials file:', err)
  }
}

ipcMain.handle('ai:saveConfig', async (_event, params: {
  provider: string
  apiKey?: string
  model: string
  multimodal: boolean
  setActive?: boolean
}) => {
  const creds = readAiCredentials()
  const p = (params.provider || 'openrouter').toLowerCase()
  if (!creds.providers) creds.providers = {}
  if (!creds.providers[p]) {
    creds.providers[p] = {
      model: params.model,
      multimodal: params.multimodal,
      updatedAt: Date.now()
    }
  }

  const entry = creds.providers[p]
  entry.model = params.model.trim()
  entry.multimodal = !!params.multimodal
  entry.updatedAt = Date.now()

  if (params.setActive) {
    creds.activeProvider = p
  }

  if (params.apiKey && params.apiKey.trim().length > 0) {
    const key = params.apiKey.trim()
    try {
      if (safeStorage.isEncryptionAvailable()) {
        const encrypted = safeStorage.encryptString(key)
        entry.encryptedKey = encrypted.toString('base64')
        entry.isEncrypted = true
      } else {
        entry.encryptedKey = Buffer.from(key, 'utf-8').toString('base64')
        entry.isEncrypted = false
      }
    } catch (err: any) {
      console.error('[AI Storage] Encryption error:', err)
      return { success: false, error: 'Falha ao criptografar chave: ' + err.message }
    }
  }

  saveAiCredentials(creds)
  return { success: true }
})

ipcMain.handle('ai:getAllConfigs', async () => {
  const creds = readAiCredentials()
  const summary: Record<string, { model: string; multimodal: boolean; hasKey: boolean; isEncrypted: boolean }> = {}

  for (const [key, val] of Object.entries(creds.providers || {})) {
    summary[key] = {
      model: val.model,
      multimodal: !!val.multimodal,
      hasKey: !!val.encryptedKey && val.encryptedKey.length > 0,
      isEncrypted: !!val.isEncrypted
    }
  }

  return {
    activeProvider: creds.activeProvider || 'openrouter',
    providers: summary
  }
})

ipcMain.handle('ai:deleteKey', async (_event, provider: string) => {
  const creds = readAiCredentials()
  const p = (provider || '').toLowerCase()
  if (creds.providers?.[p]) {
    delete creds.providers[p].encryptedKey
    delete creds.providers[p].isEncrypted
    saveAiCredentials(creds)
  }
  return { success: true }
})

ipcMain.handle('ai:chat', async (_event, params: {
  provider: string
  model?: string
  messages: { role: string; content: string }[]
  temperature?: number
}) => {
  const creds = readAiCredentials()
  const p = (params.provider || creds.activeProvider || 'openrouter').toLowerCase()
  const entry = creds.providers?.[p]

  if (!entry?.encryptedKey) {
    return {
      success: false,
      error: `Chave de API não configurada para o provedor ${p.toUpperCase()}. Abra as configurações de IA para adicionar sua chave.`
    }
  }

  let apiKey = ''
  try {
    if (entry.isEncrypted && safeStorage.isEncryptionAvailable()) {
      const buf = Buffer.from(entry.encryptedKey, 'base64')
      apiKey = safeStorage.decryptString(buf)
    } else {
      apiKey = Buffer.from(entry.encryptedKey, 'base64').toString('utf-8')
    }
  } catch (err: any) {
    return { success: false, error: 'Falha ao descriptografar a chave do Windows DPAPI: ' + err.message }
  }

  const model = params.model || entry.model || 'google/gemini-2.5-flash'

  const endpoints: Record<string, { url: string; headers: Record<string, string> }> = {
    openrouter: {
      url: 'https://openrouter.ai/api/v1/chat/completions',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://pyrite.app',
        'X-Title': 'Pyrita'
      }
    },
    openai: {
      url: 'https://api.openai.com/v1/chat/completions',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    },
    deepseek: {
      url: 'https://api.deepseek.com/chat/completions',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    },
    gemini: {
      url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    }
  }

  const config = endpoints[p] || endpoints.openrouter

  try {
    const res = await fetch(config.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...config.headers
      },
      body: JSON.stringify({
        model,
        messages: params.messages,
        temperature: params.temperature ?? 0.7
      })
    })

    if (!res.ok) {
      const errText = await res.text()
      let errMsg = `Erro ${res.status}: ${res.statusText}`
      try {
        const json = JSON.parse(errText)
        if (json.error?.message) errMsg = json.error.message
      } catch {}
      return { success: false, error: errMsg }
    }

    const data: any = await res.json()
    const content = data?.choices?.[0]?.message?.content || ''
    return { success: true, text: content }
  } catch (err: any) {
    console.error('[AI Chat] Request failed:', err)
    return { success: false, error: 'Falha ao conectar com o provedor: ' + err.message }
  }
})

app.whenReady().then(createWindow)
