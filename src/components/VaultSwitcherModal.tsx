import { useEffect, useRef, useState } from 'react'
import { Copy, FolderOpen, MoreVertical, Plus, Trash2, X } from 'lucide-react'
import { loadVaultCatalog, mergeVaultCatalog, normalizeVaultPath, openVaultInCatalog, removeVaultFromCatalog, VAULT_CATALOG_KEY, type VaultCatalog } from '../utils/vaultCatalog'

interface Props {
  isOpen: boolean
  currentVaultPath?: string
  onClose: () => void
  onSelectVault: (vaultPath: string) => void | Promise<void>
}
const emptyCatalog: VaultCatalog = { vaults: [], hiddenPaths: [] }
const basename = (value: string) => value.split(/[/\\]/).filter(Boolean).pop() || 'Cofre'

export function VaultSwitcherModal({ isOpen, currentVaultPath, onClose, onSelectVault }: Props) {
  const [catalog, setCatalog] = useState<VaultCatalog>(emptyCatalog)
  const catalogRef = useRef(catalog)
  const [rootPath, setRootPath] = useState('')
  const [mode, setMode] = useState<'create' | 'copy' | null>(null)
  const [sourcePath, setSourcePath] = useState('')
  const [name, setName] = useState('')
  const [menu, setMenu] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [error, setError] = useState('')
  const desktop = !!window.electronAPI?.getVaultSettings
  const persist = (next: VaultCatalog) => {
    localStorage.setItem(VAULT_CATALOG_KEY, JSON.stringify(next))
    catalogRef.current = next
    setCatalog(next)
  }
  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    setError(''); setMode(null); setMenu(null)
    const load = async () => {
      try {
        const saved = loadVaultCatalog(localStorage)
        catalogRef.current = saved; setCatalog(saved)
        const [discovered, settings] = await Promise.all([
          window.electronAPI?.getKnownVaults?.() ?? [],
          window.electronAPI?.getVaultSettings?.() ?? { rootPath: '' }
        ])
        if (cancelled) return
        setRootPath(settings.rootPath)
        // Read the latest catalog: a removal while discovery runs must stay removed.
        persist(mergeVaultCatalog(catalogRef.current, discovered, currentVaultPath))
      } catch (err) { if (!cancelled) setError(String(err instanceof Error ? err.message : err)) }
    }
    void load()
    return () => { cancelled = true }
  }, [isOpen, currentVaultPath])
  useEffect(() => {
    if (!isOpen) return
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busyRef.current) { if (menu) setMenu(null); else onClose() }
    }
    window.addEventListener('keydown', escape)
    return () => window.removeEventListener('keydown', escape)
  }, [isOpen, menu, onClose])
  if (!isOpen) return null

  const run = async (action: () => Promise<void>) => {
    if (busyRef.current) return
    busyRef.current = true; setBusy(true); setError(''); setMenu(null)
    try { await action() }
    catch (err) { setError(err instanceof Error ? err.message : String(err)) }
    finally { busyRef.current = false; setBusy(false) }
  }
  const open = async (vaultPath: string) => {
    await onSelectVault(vaultPath)
    persist(openVaultInCatalog(catalogRef.current, vaultPath))
    onClose()
  }
  const beginCopy = (source: string) => {
    setSourcePath(source); setName(basename(source) + ' - cópia'); setMode('copy'); setMenu(null); setError('')
  }
  const chooseRoot = () => run(async () => {
    const selected = await window.electronAPI?.selectFolder()
    if (!selected) return
    const result = await window.electronAPI!.setVaultRoot(selected)
    if (!result.success || !result.rootPath) throw new Error(result.error || 'Não foi possível salvar a pasta raiz.')
    setRootPath(result.rootPath)
    const discovered = await window.electronAPI!.getKnownVaults()
    persist(mergeVaultCatalog(catalogRef.current, discovered, currentVaultPath))
  })
  const button = 'flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm hover:bg-white/5 disabled:opacity-40 disabled:cursor-wait'
  return <div className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center p-6" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <section role="dialog" aria-modal="true" aria-label="Gerenciar cofres" className="relative w-full max-w-[900px] h-[590px] max-h-[90vh] flex rounded-2xl border border-white/10 bg-[#121214] text-zinc-200 shadow-2xl overflow-hidden">
      <button disabled={busy} onClick={onClose} aria-label="Fechar gerenciador de cofres" className="absolute right-3 top-3 p-2 rounded-lg hover:bg-white/5 disabled:opacity-40"><X size={18}/></button>
      <aside className="w-[310px] shrink-0 bg-[#0c0c0e] border-r border-white/10 flex flex-col">
        <h2 className="p-5 text-sm font-semibold">Seus cofres ({catalog.vaults.length})</h2>
        <div className="flex-1 overflow-y-auto px-2 pb-3">
          {catalog.vaults.length === 0 && <p className="p-3 text-sm text-zinc-500">Nenhum cofre na lista.</p>}
          {catalog.vaults.map(vault => <div key={normalizeVaultPath(vault.path)} data-vault-path={vault.path} className="mb-1 rounded-lg bg-white/[0.025]">
            <div className="flex items-center">
              <button disabled={busy} onClick={() => void run(() => open(vault.path))} className="min-w-0 flex-1 p-3 text-left hover:bg-white/5 rounded-lg" title={vault.path}>
                <div className="truncate text-sm font-medium">{vault.name}{currentVaultPath && normalizeVaultPath(currentVaultPath) === normalizeVaultPath(vault.path) && <span className="ml-2 text-[10px] text-zinc-500">Atual</span>}</div>
                <div className="truncate mt-1 text-[11px] text-zinc-500">{vault.path}</div>
              </button>
              <button disabled={busy} aria-label={`Opções de ${vault.name}`} onClick={() => setMenu(menu === vault.path ? null : vault.path)} className="p-2 hover:bg-white/5 rounded-lg"><MoreVertical size={16}/></button>
            </div>
            {menu === vault.path && <div role="menu" className="border-t border-white/10 p-1 text-xs">
              <button disabled={busy || !desktop} role="menuitem" className="w-full flex gap-2 p-2 hover:bg-white/5 rounded" onClick={() => beginCopy(vault.path)}><Copy size={14}/>Duplicar para meus cofres</button>
              <button disabled={busy || !desktop} role="menuitem" className="w-full flex gap-2 p-2 hover:bg-white/5 rounded" onClick={() => void run(async () => { await window.electronAPI?.openInExplorer(vault.path) })}><FolderOpen size={14}/>Mostrar na pasta</button>
              <button disabled={busy} role="menuitem" className="w-full flex gap-2 p-2 text-red-400 hover:bg-white/5 rounded" onClick={() => { try { persist(removeVaultFromCatalog(catalogRef.current, vault.path)); setMenu(null) } catch { setError('Não foi possível salvar a remoção.') } }}><Trash2 size={14}/>Remover da lista</button>
            </div>}
          </div>)}
        </div>
        <p className="p-4 text-[11px] text-zinc-500 border-t border-white/5">Remover da lista mantém os arquivos na pasta original.</p>
      </aside>
      <main className="flex-1 min-w-0 overflow-y-auto p-7 pt-8">
        <h1 className="text-xl font-semibold mb-1">Gerenciar cofres</h1>
        <p className="text-sm text-zinc-500 mb-6">Organize seus espaços de notas.</p>
        <div className="rounded-xl border border-white/10 p-3 mb-5">
          <div className="flex justify-between items-center gap-2"><span className="text-xs font-medium">Pasta dos meus cofres</span><button disabled={busy || !desktop} onClick={() => void chooseRoot()} className="text-xs text-zinc-400 hover:text-white disabled:opacity-40">Escolher pasta</button></div>
          <p className="text-xs text-zinc-500 mt-2 break-all" data-testid="vault-root">{rootPath || 'Disponível no aplicativo desktop'}</p>
        </div>
        {!mode ? <div className="space-y-3">
          <button disabled={busy || !desktop} className={button + ' w-full'} onClick={() => { setMode('create'); setName(''); setError('') }}><Plus size={17}/>Criar cofre</button>
          <button disabled={busy || !desktop} className={button + ' w-full'} onClick={() => void run(async () => { const selected = await window.electronAPI!.selectFolder(); if (selected) await open(selected) })}><FolderOpen size={17}/>Abrir original</button>
          <button disabled={busy || !desktop} className={button + ' w-full'} onClick={() => void run(async () => { const selected = await window.electronAPI!.selectFolder(); if (selected) beginCopy(selected) })}><Copy size={17}/>Importar uma cópia</button>
          <p className="text-xs text-zinc-500 leading-relaxed">Importe uma cópia de um cofre do Obsidian ou de outra pasta. As alterações no Pyrita ficarão na cópia.</p>
        </div> : <form onSubmit={event => { event.preventDefault(); void run(async () => {
          const result = mode === 'copy'
            ? await window.electronAPI!.duplicateVault({ sourcePath, vaultName: name })
            : await window.electronAPI!.createVault({ parentPath: rootPath, vaultName: name })
          if (!result.success || !result.vaultPath) throw new Error(result.error || 'Não foi possível criar o cofre.')
          // Retain the successful copy even if opening it encounters a later error.
          persist(openVaultInCatalog(catalogRef.current, result.vaultPath))
          setMode(null)
          await open(result.vaultPath)
        }) }}>
          <h3 className="text-sm font-medium mb-3">{mode === 'copy' ? 'Duplicar cofre' : 'Novo cofre'}</h3>
          {mode === 'copy' && <p className="text-xs text-zinc-500 mb-3 break-all">Original: {sourcePath}</p>}
          <label className="text-xs text-zinc-400">Nome do cofre<input autoFocus required disabled={busy} value={name} onChange={event => setName(event.target.value)} className="mt-2 mb-3 block w-full rounded-lg bg-black/30 border border-white/10 p-2 text-sm text-zinc-200 outline-none focus:border-zinc-500"/></label>
          <p className="text-xs text-zinc-500 mb-4 break-all">Destino: {rootPath}{rootPath.endsWith('\\') || rootPath.endsWith('/') ? '' : '/'}{name || '…'}</p>
          <div className="flex gap-2"><button type="submit" disabled={busy || !rootPath || !name.trim()} className={button}>{busy ? 'Aguarde…' : mode === 'copy' ? 'Copiar e abrir' : 'Criar e abrir'}</button><button type="button" disabled={busy} className={button} onClick={() => setMode(null)}>Cancelar</button></div>
        </form>}
        {busy && <p role="status" className="mt-4 text-xs text-zinc-400">Processando. Aguarde a conclusão.</p>}
        {error && <p role="alert" className="mt-4 text-sm text-red-400 break-words">{error}</p>}
      </main>
    </section>
  </div>
}
