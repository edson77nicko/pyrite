import React, { useState, useEffect } from 'react'
import type { SavedVault } from '../types'
import {
  MoreVertical,
  X,
  ExternalLink,
  Trash2,
  Sparkles,
  HelpCircle,
  ChevronDown
} from 'lucide-react'

interface VaultSwitcherModalProps {
  isOpen: boolean
  currentVaultPath?: string
  onClose: () => void
  onSelectVault: (vaultPath: string) => void
}

const STORAGE_SAVED_VAULTS = 'pyrite_saved_vaults'

export const VaultSwitcherModal: React.FC<VaultSwitcherModalProps> = ({
  isOpen,
  currentVaultPath,
  onClose,
  onSelectVault
}) => {
  const [vaults, setVaults] = useState<SavedVault[]>([])
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null)

  // Creation State
  const [isCreating, setIsCreating] = useState(false)
  const [newVaultName, setNewVaultName] = useState('')
  const [newVaultParentPath, setNewVaultParentPath] = useState('')
  const [creationError, setCreationError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Load known and saved vaults on mount / open
  useEffect(() => {
    if (!isOpen) return

    const loadVaults = async () => {
      // 1. Read existing vaults from localStorage
      let localVaults: SavedVault[] = []
      try {
        const saved = localStorage.getItem(STORAGE_SAVED_VAULTS)
        if (saved) {
          localVaults = JSON.parse(saved)
        }
      } catch (e) {
        console.error('Failed to read saved vaults from localStorage', e)
      }

      // 2. Query known vaults from Electron (auto-discovering Obsidian vaults + default)
      if (window.electronAPI?.getKnownVaults) {
        try {
          const discovered = await window.electronAPI.getKnownVaults()
          for (const d of discovered) {
            const exists = localVaults.some(v => v.path.toLowerCase() === d.path.toLowerCase())
            if (!exists) {
              localVaults.push({
                id: d.id,
                name: d.name,
                path: d.path,
                lastOpened: d.lastOpened
              })
            }
          }
        } catch (err) {
          console.warn('Could not query known vaults from Electron', err)
        }
      }

      // 3. Ensure current vault is always in the list
      if (currentVaultPath) {
        const normalizedCurrent = currentVaultPath.replace(/\\/g, '/')
        const exists = localVaults.some(v => v.path.replace(/\\/g, '/').toLowerCase() === normalizedCurrent.toLowerCase())
        if (!exists) {
          const parts = currentVaultPath.split(/[/\\]/).filter(Boolean)
          const name = parts[parts.length - 1] || 'Pyrita Vault'
          localVaults.unshift({
            id: `vault_${Date.now()}`,
            name,
            path: currentVaultPath,
            lastOpened: Date.now()
          })
        }
      }

      // Sort by last opened
      localVaults.sort((a, b) => (b.lastOpened || 0) - (a.lastOpened || 0))
      setVaults(localVaults)
      try {
        localStorage.setItem(STORAGE_SAVED_VAULTS, JSON.stringify(localVaults))
      } catch {}
    }

    loadVaults()
  }, [isOpen, currentVaultPath])

  if (!isOpen) return null

  // Save updated list
  const persistVaults = (newList: SavedVault[]) => {
    setVaults(newList)
    try {
      localStorage.setItem(STORAGE_SAVED_VAULTS, JSON.stringify(newList))
    } catch {}
  }

  // Open / Switch to a vault
  const handleOpenVault = (targetPath: string) => {
    // Update lastOpened timestamp
    const updated = vaults.map(v =>
      v.path.toLowerCase() === targetPath.toLowerCase() ? { ...v, lastOpened: Date.now() } : v
    )
    persistVaults(updated)
    onSelectVault(targetPath)
    onClose()
  }

  // Browse folder and open as vault
  const handleBrowseAndOpen = async () => {
    if (window.electronAPI?.selectFolder) {
      try {
        const selected = await window.electronAPI.selectFolder()
        if (selected) {
          const parts = selected.split(/[/\\]/).filter(Boolean)
          const name = parts[parts.length - 1] || 'Cofre'
          const existing = vaults.find(v => v.path.toLowerCase() === selected.toLowerCase())
          let updated = vaults
          if (!existing) {
            const newV: SavedVault = {
              id: `vault_${Date.now()}`,
              name,
              path: selected,
              lastOpened: Date.now()
            }
            updated = [newV, ...vaults]
            persistVaults(updated)
          }
          handleOpenVault(selected)
        }
      } catch (err) {
        console.error('Failed to select folder:', err)
      }
    }
  }

  // Pick parent directory for creating new vault
  const handlePickParentDirectory = async () => {
    if (window.electronAPI?.selectFolder) {
      try {
        const selected = await window.electronAPI.selectFolder()
        if (selected) {
          setNewVaultParentPath(selected)
        }
      } catch (err) {
        console.error('Failed to pick parent directory:', err)
      }
    }
  }

  // Submit creation of new vault
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newVaultName.trim()) {
      setCreationError('Digite um nome para o cofre.')
      return
    }
    if (!newVaultParentPath.trim()) {
      setCreationError('Escolha a pasta de destino onde o cofre será criado.')
      return
    }

    setIsSubmitting(true)
    setCreationError(null)

    try {
      if (window.electronAPI?.createVault) {
        const res = await window.electronAPI.createVault({
          parentPath: newVaultParentPath.trim(),
          vaultName: newVaultName.trim()
        })

        if (res.success && res.vaultPath) {
          const newV: SavedVault = {
            id: `vault_${Date.now()}`,
            name: newVaultName.trim(),
            path: res.vaultPath,
            lastOpened: Date.now()
          }
          const updated = [newV, ...vaults.filter(v => v.path.toLowerCase() !== res.vaultPath!.toLowerCase())]
          persistVaults(updated)
          setIsCreating(false)
          setNewVaultName('')
          setNewVaultParentPath('')
          handleOpenVault(res.vaultPath)
        } else {
          setCreationError(res.error || 'Não foi possível criar o cofre.')
        }
      }
    } catch (err: any) {
      setCreationError(err.message || 'Erro ao criar cofre.')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Restore Default Pyrite Vault
  const handleOpenDefaultVault = async () => {
    if (window.electronAPI?.getDefaultPath) {
      const defaultPath = await window.electronAPI.getDefaultPath()
      handleOpenVault(defaultPath)
    }
  }

  // Reveal in Windows Explorer
  const handleRevealInExplorer = (path: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setActiveMenuId(null)
    if (window.electronAPI?.openInExplorer) {
      window.electronAPI.openInExplorer(path)
    }
  }

  // Remove from recent list
  const handleRemoveFromList = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setActiveMenuId(null)
    const filtered = vaults.filter(v => v.id !== id)
    persistVaults(filtered)
  }

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex items-center justify-center p-4 select-none">
      {/* Modal Dialog Container */}
      <div className="relative w-full max-w-[840px] h-[550px] bg-[#121214] border border-white/[0.08] rounded-2xl shadow-2xl shadow-black/80 flex overflow-hidden text-zinc-200">
        {/* Close Button Top Right */}
        <button
          onClick={onClose}
          className="absolute top-3.5 right-3.5 w-7 h-7 flex items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/60 transition-colors z-20 cursor-pointer"
          title="Fechar Seletor de Cofres (Esc)"
        >
          <X className="w-4 h-4" />
        </button>

        {/* ========================================================
            LEFT COLUMN: Lista de Cofres Conectados (Estilo Obsidian)
            ======================================================== */}
        <div className="w-[300px] bg-[#0c0c0e] border-r border-white/[0.06] flex flex-col shrink-0">
          <div className="p-4 border-b border-white/[0.06] flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Seus Cofres ({vaults.length})
            </span>
          </div>

          {/* Vaults Scrollable List */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-chat-scrollbar">
            {vaults.length === 0 ? (
              <div className="p-4 text-center text-xs text-zinc-600 italic">
                Nenhum cofre recente encontrado.
              </div>
            ) : (
              vaults.map(v => {
                const isActive =
                  currentVaultPath &&
                  v.path.replace(/\\/g, '/').toLowerCase() === currentVaultPath.replace(/\\/g, '/').toLowerCase()

                // Format parent path display like in Obsidian: e.g. "D:\obsidian"
                const parentDir = v.path.replace(/[/\\][^/\\]+$/, '')

                return (
                  <div
                    key={v.id}
                    onClick={() => handleOpenVault(v.path)}
                    className={`group relative flex items-center justify-between p-2.5 rounded-xl text-left cursor-pointer transition-all border ${
                      isActive
                        ? 'bg-[#18181c] border-[#c59b27]/40 shadow-sm'
                        : 'bg-transparent hover:bg-zinc-900/60 border-transparent hover:border-white/[0.05]'
                    }`}
                  >
                    <div className="flex-1 min-w-0 pr-2">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-xs text-zinc-100 truncate block">
                          {v.name}
                        </span>
                        {isActive && (
                          <span className="text-[9px] font-mono px-1.5 py-0.2 rounded-full bg-[#1c1912] text-[#d4af37] border border-[#c59b27]/30 shrink-0">
                            Ativo
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-zinc-500 font-mono truncate block mt-0.5" title={v.path}>
                        {parentDir || v.path}
                      </span>
                    </div>

                    {/* Three Dots Menu Button */}
                    <div className="relative shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setActiveMenuId(activeMenuId === v.id ? null : v.id)
                        }}
                        className="p-1 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 rounded-md transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                        title="Opções do cofre"
                      >
                        <MoreVertical className="w-3.5 h-3.5" />
                      </button>

                      {/* Dropdown Menu */}
                      {activeMenuId === v.id && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="absolute right-0 top-6 w-48 bg-[#18181c] border border-zinc-700/80 rounded-xl shadow-2xl py-1 z-30 text-xs"
                        >
                          <button
                            type="button"
                            onClick={(e) => handleRevealInExplorer(v.path, e)}
                            className="w-full px-3 py-1.5 text-left text-zinc-300 hover:text-white hover:bg-zinc-800 flex items-center gap-2 transition-colors cursor-pointer"
                          >
                            <ExternalLink className="w-3.5 h-3.5 text-[#c59b27]" />
                            <span>Abrir no Explorador</span>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleRemoveFromList(v.id, e)}
                            className="w-full px-3 py-1.5 text-left text-rose-400 hover:text-rose-300 hover:bg-zinc-800 flex items-center gap-2 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Remover da lista</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* ========================================================
            RIGHT COLUMN: Pyrita Branding & Ações de Criação/Abertura
            ======================================================== */}
        <div className="flex-1 bg-[#121214] p-7 flex flex-col justify-between overflow-y-auto custom-chat-scrollbar">
          {/* Top Brand Hero */}
          <div className="flex flex-col items-center text-center pt-2 pb-4">
            {/* Pyrita Glowing Mineral Gemstone */}
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#d4af37] via-[#9e7922] to-[#423214] flex items-center justify-center shadow-lg shadow-black/60 border border-[#c59b27]/40 mb-3">
              <Sparkles className="w-7 h-7 text-zinc-950 fill-[#fef08a]" />
            </div>
            <h2 className="text-xl font-bold tracking-tight text-zinc-100">
              Pyrita
            </h2>
            <p className="text-xs text-zinc-500 font-mono mt-0.5">
              Versão 1.0.2 • Ambiente Local-First de Pensamento
            </p>
          </div>

          {/* Action Cards (Nested concentric cards matching reference layout) */}
          <div className="space-y-2.5 max-w-[440px] w-full mx-auto my-auto">
            {/* Card 1: Criar um novo cofre */}
            <div className="bg-[#18181c] border border-white/[0.06] rounded-[15px] px-[12px] py-[10px] shadow-md flex flex-col transition-all">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-xs text-zinc-100">
                    Criar um novo cofre
                  </div>
                  <div className="text-[11px] text-zinc-400 leading-snug mt-0.5">
                    Cria um novo cofre do Pyrita dentro de uma pasta.
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setIsCreating(!isCreating)
                    setCreationError(null)
                  }}
                  className="px-4 py-1.5 bg-[#c59b27] hover:bg-[#d8b150] text-zinc-950 rounded-lg text-xs font-semibold transition-all shrink-0 shadow-sm cursor-pointer"
                >
                  {isCreating ? 'Fechar' : 'Criar'}
                </button>
              </div>

              {/* Inline Creation Form */}
              {isCreating && (
                <form onSubmit={handleCreateSubmit} className="mt-3 pt-3 border-t border-white/[0.06] space-y-2">
                  <div>
                    <label className="text-[10px] text-zinc-400 uppercase font-mono block mb-1">
                      Nome do Cofre
                    </label>
                    <input
                      type="text"
                      autoFocus
                      placeholder="Ex: Meu Segundo Cérebro"
                      value={newVaultName}
                      onChange={(e) => setNewVaultName(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-[#0e0e11] border border-zinc-700/80 rounded-lg text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-[#c59b27]"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-zinc-400 uppercase font-mono block mb-1">
                      Local de Destino
                    </label>
                    <div className="flex items-center gap-1.5">
                      <div className="flex-1 px-2.5 py-1.5 bg-[#0e0e11] border border-zinc-700/80 rounded-lg text-xs text-zinc-400 font-mono truncate">
                        {newVaultParentPath || 'Nenhuma pasta selecionada'}
                      </div>
                      <button
                        type="button"
                        onClick={handlePickParentDirectory}
                        className="px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs font-medium border border-zinc-700/60 cursor-pointer shrink-0"
                      >
                        Procurar...
                      </button>
                    </div>
                  </div>

                  {creationError && (
                    <div className="text-[11px] text-rose-400 bg-rose-950/40 border border-rose-900/50 rounded-lg px-2.5 py-1">
                      {creationError}
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setIsCreating(false)}
                      className="px-3 py-1 text-zinc-400 hover:text-zinc-200 text-xs cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="px-3.5 py-1 bg-[#c59b27] hover:bg-[#d8b150] text-zinc-950 rounded-lg text-xs font-semibold shadow-sm cursor-pointer disabled:opacity-50"
                    >
                      {isSubmitting ? 'Criando...' : 'Criar e Abrir'}
                    </button>
                  </div>
                </form>
              )}
            </div>

            {/* Card 2: Abrir pasta como um cofre */}
            <div className="bg-[#18181c] border border-white/[0.06] rounded-[15px] px-[12px] py-[10px] shadow-md flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-xs text-zinc-100">
                  Abrir pasta como um cofre
                </div>
                <div className="text-[11px] text-zinc-400 leading-snug mt-0.5">
                  Abra uma pasta existente com arquivos Markdown.
                </div>
              </div>

              <button
                type="button"
                onClick={handleBrowseAndOpen}
                className="px-4 py-1.5 bg-zinc-800 hover:bg-zinc-750 text-zinc-200 rounded-lg text-xs font-semibold transition-all shrink-0 border border-zinc-700/60 shadow-sm cursor-pointer"
              >
                Abrir
              </button>
            </div>

            {/* Card 3: Cofre Padrão */}
            <div className="bg-[#18181c] border border-white/[0.06] rounded-[15px] px-[12px] py-[10px] shadow-md flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-xs text-zinc-100">
                  Cofre Padrão do Pyrita
                </div>
                <div className="text-[11px] text-zinc-400 leading-snug mt-0.5">
                  Carregar o cofre padrão de exemplo com notas do sistema.
                </div>
              </div>

              <button
                type="button"
                onClick={handleOpenDefaultVault}
                className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-750 text-zinc-200 rounded-lg text-xs font-semibold transition-all shrink-0 border border-zinc-700/60 shadow-sm cursor-pointer"
              >
                Restaurar
              </button>
            </div>
          </div>

          {/* Bottom Footer with Language Selector */}
          <div className="pt-4 flex items-center justify-center gap-2 text-zinc-500 text-xs">
            <HelpCircle className="w-3.5 h-3.5 text-zinc-500" />
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#18181c] border border-white/[0.05] text-zinc-400 text-[11px]">
              <span>Português do Brasil</span>
              <ChevronDown className="w-3 h-3 text-zinc-600" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
