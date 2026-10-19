import { contextBridge, ipcRenderer } from 'electron'

export interface VaultFileItem {
  title: string
  folder: string
  filePath: string
  content: string
  createdAt: number
  updatedAt: number
}

const electronAPI = {
  isElectron: true,
  readCanvas: (vaultPath: string) => ipcRenderer.invoke('canvas:read', vaultPath),
  writeCanvas: (vaultPath: string, document: import('../src/utils/canvasBoards').CanvasDocument) => ipcRenderer.invoke('canvas:write', vaultPath, document),
  managePath: (params: { vaultPath: string; source: string; destination?: string; action: 'copy' | 'move' | 'delete' | 'open' }) => ipcRenderer.invoke('vault:managePath', params),

  // Window Controls
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize') as Promise<boolean>,
  close: () => ipcRenderer.invoke('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized') as Promise<boolean>,
  onMaximizedChange: (callback: (isMax: boolean) => void) => {
    const handler = (_event: any, isMax: boolean) => callback(isMax)
    ipcRenderer.on('window:maximizedChange', handler)
    return () => {
      ipcRenderer.removeListener('window:maximizedChange', handler)
    }
  },

  // Vault & File System
  getDefaultPath: () => ipcRenderer.invoke('vault:getDefaultPath') as Promise<string>,
  selectFolder: () => ipcRenderer.invoke('vault:selectFolder') as Promise<string | null>,
  readVault: (vaultPath: string) => ipcRenderer.invoke('vault:readVault', vaultPath) as Promise<VaultFileItem[]>,
  saveFile: (params: { vaultPath: string; folder: string; title: string; content: string; exclusive?: boolean }) =>
    ipcRenderer.invoke('vault:saveFile', params) as Promise<{ success: boolean; filePath?: string; updatedAt?: number; error?: string }>,
  deleteFile: (filePath: string) =>
    ipcRenderer.invoke('vault:deleteFile', filePath) as Promise<{ success: boolean; error?: string }>,
  createFolder: (params: { vaultPath: string; folderPath: string }) =>
    ipcRenderer.invoke('vault:createFolder', params) as Promise<{ success: boolean; error?: string }>,
  revealInExplorer: (filePath: string) => ipcRenderer.invoke('vault:revealInExplorer', filePath),
  openInExplorer: (folderPath: string) => ipcRenderer.invoke('vault:openInExplorer', folderPath),
  getVaultSettings: () => ipcRenderer.invoke('vault:getSettings') as Promise<{ rootPath: string }>,
  setVaultRoot: (rootPath: string) => ipcRenderer.invoke('vault:setRoot', rootPath) as Promise<{ success: boolean; rootPath?: string; error?: string }>,
  duplicateVault: (params: { sourcePath: string; vaultName: string }) => ipcRenderer.invoke('vault:duplicate', params) as Promise<{ success: boolean; vaultPath?: string; error?: string }>,
  getKnownVaults: () => ipcRenderer.invoke('vault:getKnownVaults') as Promise<{ id: string; name: string; path: string; lastOpened: number }[]>,
  createVault: (params: { parentPath: string; vaultName: string }) =>
    ipcRenderer.invoke('vault:createVault', params) as Promise<{ success: boolean; vaultPath?: string; error?: string }>,

  // Auto Updater
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),
  quitAndInstall: () => ipcRenderer.invoke('updater:quitAndInstall'),
  onUpdaterStatus: (callback: (data: any) => void) => {
    const handler = (_event: any, data: any) => callback(data)
    ipcRenderer.on('updater:status', handler)
    return () => {
      ipcRenderer.removeListener('updater:status', handler)
    }
  },

  // Secure AI Configuration and LLM Execution
  aiSaveConfig: (params: { provider: string; apiKey?: string; model: string; multimodal: boolean; setActive?: boolean }) =>
    ipcRenderer.invoke('ai:saveConfig', params) as Promise<{ success: boolean; error?: string }>,
  aiGetAllConfigs: () =>
    ipcRenderer.invoke('ai:getAllConfigs') as Promise<{
      activeProvider: string
      providers: Record<string, { model: string; multimodal: boolean; hasKey: boolean; isEncrypted: boolean }>
    }>,
  aiDeleteKey: (provider: string) =>
    ipcRenderer.invoke('ai:deleteKey', provider) as Promise<{ success: boolean }>,
  aiChat: (params: { provider: string; model?: string; messages: { role: string; content: string | any[] }[]; temperature?: number }) =>
    ipcRenderer.invoke('ai:chat', params) as Promise<{ success: boolean; text?: string; error?: string }>,
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
