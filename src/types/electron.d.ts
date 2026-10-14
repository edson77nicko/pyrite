export interface VaultFileItem {
  title: string
  folder: string
  filePath: string
  content: string
  createdAt: number
  updatedAt: number
}

export interface ElectronAPI {
  isElectron: boolean
  minimize: () => Promise<void>
  maximize: () => Promise<boolean>
  close: () => Promise<void>
  isMaximized: () => Promise<boolean>
  onMaximizedChange: (callback: (isMax: boolean) => void) => () => void
  getDefaultPath: () => Promise<string>
  selectFolder: () => Promise<string | null>
  readVault: (vaultPath: string) => Promise<VaultFileItem[]>
  saveFile: (params: {
    vaultPath: string
    folder: string
    title: string
    content: string
  }) => Promise<{ success: boolean; filePath?: string; updatedAt?: number; error?: string }>
  deleteFile: (filePath: string) => Promise<{ success: boolean; error?: string }>
  createFolder: (params: { vaultPath: string; folderPath: string }) => Promise<{ success: boolean; error?: string }>
  revealInExplorer: (filePath: string) => Promise<void>
  openInExplorer: (folderPath: string) => Promise<void>
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}
