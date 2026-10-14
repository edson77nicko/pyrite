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
  saveFile: (params: { vaultPath: string; folder: string; title: string; content: string }) =>
    ipcRenderer.invoke('vault:saveFile', params) as Promise<{ success: boolean; filePath?: string; updatedAt?: number; error?: string }>,
  deleteFile: (filePath: string) =>
    ipcRenderer.invoke('vault:deleteFile', filePath) as Promise<{ success: boolean; error?: string }>,
  createFolder: (params: { vaultPath: string; folderPath: string }) =>
    ipcRenderer.invoke('vault:createFolder', params) as Promise<{ success: boolean; error?: string }>,
  revealInExplorer: (filePath: string) => ipcRenderer.invoke('vault:revealInExplorer', filePath),
  openInExplorer: (folderPath: string) => ipcRenderer.invoke('vault:openInExplorer', folderPath),

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
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
