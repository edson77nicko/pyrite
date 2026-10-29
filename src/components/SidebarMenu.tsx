import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Copy,
  Pencil,
  Trash2,
  FolderInput,
  FilePlus,
  FolderPlus,
  Search,
  Star,
  Clipboard,
  ExternalLink,
  FileText,
  Palette,
  Brain,
  CodeXml,
  FileInput,
  Folder,
  FolderOpen,
  ChevronRight,
  ArrowLeft,
  Check,
  X
} from 'lucide-react'
import type { Note } from '../types'

export type SidebarAction = 'new-note' | 'new-draw' | 'new-mindmap' | 'new-html' | 'import-html' | 'new-folder' | 'search' | 'open' | 'copy' | 'move' | 'favorite' | 'copy-path' | 'copy-relative' | 'reveal' | 'external' | 'rename' | 'delete'
interface Props {
  context: { x: number; y: number; note?: Note; folder?: string }
  folders: string[]
  isVaultRoot?: boolean
  onClose: () => void
  onAction: (action: SidebarAction, value?: string) => Promise<void>
}

// Helper to extract immediate child folders for hierarchical navigation
function getImmediateChildren(validFolders: string[], currentPath: string): { name: string; fullPath: string; hasChildren: boolean }[] {
  const prefix = currentPath ? currentPath + '/' : ''
  const childMap = new Map<string, { fullPath: string; hasChildren: boolean }>()

  for (const f of validFolders) {
    if (prefix) {
      if (!f.startsWith(prefix)) continue
      const remainder = f.slice(prefix.length)
      if (!remainder) continue
      const parts = remainder.split('/')
      const childName = parts[0]
      const childFullPath = prefix + childName
      const existing = childMap.get(childName)
      childMap.set(childName, {
        fullPath: childFullPath,
        hasChildren: existing?.hasChildren || parts.length > 1
      })
    } else {
      const parts = f.split('/')
      const childName = parts[0]
      const existing = childMap.get(childName)
      childMap.set(childName, {
        fullPath: childName,
        hasChildren: existing?.hasChildren || parts.length > 1
      })
    }
  }

  return Array.from(childMap.entries())
    .map(([name, data]) => ({
      name,
      fullPath: data.fullPath,
      hasChildren: data.hasChildren
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function SidebarMenu({ context, folders, isVaultRoot, onClose, onAction }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  useEffect(() => { closeRef.current = onClose }, [onClose])
  const [position, setPosition] = useState({ left: context.x, top: context.y })
  const [editing, setEditing] = useState<'rename' | 'move' | null>(null)
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // Move-to Enhanced Search & Hierarchy states
  const [folderSearch, setFolderSearch] = useState('')
  const [currentNavFolder, setCurrentNavFolder] = useState('')

  // Valid destination folders (prevent moving into itself or its own subfolders)
  const validFolders = useMemo(() => {
    return folders.filter(f => !context.folder || (f !== context.folder && !f.startsWith(context.folder + '/')))
  }, [folders, context.folder])

  // Filtered folders by search query
  const searchResults = useMemo(() => {
    const q = folderSearch.trim().toLowerCase()
    if (!q) return []
    return validFolders.filter(f => f.toLowerCase().includes(q))
  }, [validFolders, folderSearch])

  // Immediate child folders of current navigation folder
  const currentChildFolders = useMemo(() => {
    return getImmediateChildren(validFolders, currentNavFolder)
  }, [validFolders, currentNavFolder])

  useLayoutEffect(() => {
    const menu = ref.current!
    const bounds = menu.getBoundingClientRect()
    setPosition({
      left: Math.max(8, Math.min(context.x, innerWidth - bounds.width - 8)),
      top: Math.max(8, Math.min(context.y, innerHeight - bounds.height - 8))
    })
    menu.querySelector<HTMLButtonElement>('button')?.focus()
    const dismiss = (e: PointerEvent) => { if (!menu.contains(e.target as Node)) closeRef.current() }
    const close = () => closeRef.current()
    document.addEventListener('pointerdown', dismiss)
    window.addEventListener('resize', close)
    return () => { document.removeEventListener('pointerdown', dismiss); window.removeEventListener('resize', close) }
  }, [context.x, context.y, editing])

  const run = async (action: SidebarAction, input?: string) => {
    setBusy(true); setError('')
    try { await onAction(action, input); onClose() }
    catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível concluir a ação.') }
    finally { setBusy(false) }
  }

  const item = (action: SidebarAction, label: string, Icon: typeof Copy) => (
    <button
      key={action}
      role="menuitem"
      disabled={busy}
      className={`flex w-full items-center gap-3 rounded px-2 py-1.5 text-left text-xs hover:bg-zinc-700/50 focus:bg-zinc-700/50 focus:outline-none disabled:opacity-40 cursor-pointer ${
        action === 'delete' ? 'text-rose-400' : 'text-zinc-200'
      }`}
      onClick={() => {
        if (action === 'rename') {
          setEditing('rename')
          setValue(context.note?.title || context.folder!.split('/').pop()!)
          return
        }
        if (action === 'move') {
          setEditing('move')
          const initialTarget = context.note?.folder || ''
          setValue(initialTarget)
          setCurrentNavFolder(initialTarget)
          return
        }
        if (action === 'delete' && !confirm(context.note ? `Apagar "${context.note.title}"?` : `Apagar a pasta "${context.folder}" e todo o seu conteúdo?`)) return
        void run(action)
      }}
    >
      <Icon size={15} className="shrink-0 opacity-70" />
      {label}
    </button>
  )

  const separator = <div role="separator" className="my-1 border-t border-zinc-700/60" />

  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label={context.note ? 'Opções da nota' : 'Opções da pasta'}
      style={position}
      className={`fixed z-[100] max-h-[calc(100vh-16px)] overflow-y-auto rounded-xl border border-zinc-700 bg-[#181b21] p-1.5 shadow-2xl transition-all ${
        editing === 'move' ? 'w-84 sm:w-96' : 'w-64'
      }`}
      onContextMenu={e => e.preventDefault()}
      onKeyDown={e => {
        if (e.key === 'Escape') { e.stopPropagation(); onClose() }
        if (!editing && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
          e.preventDefault()
          const buttons = Array.from(ref.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))
          const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
          buttons[e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1 : (index + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus()
        }
      }}
    >
      {editing === 'rename' ? (
        <form className="space-y-2 p-2 text-xs text-zinc-200" onSubmit={e => { e.preventDefault(); void run(editing, value) }}>
          <label className="block font-medium text-zinc-300">
            Novo nome
            <input
              autoFocus
              value={value}
              onChange={e => setValue(e.target.value)}
              className="mt-2 w-full rounded-lg border border-zinc-600 bg-zinc-900 p-2 text-zinc-100 outline-none focus:border-zinc-400"
            />
          </label>
          <div className="flex gap-2 justify-end pt-1">
            <button type="button" disabled={busy} onClick={onClose} className="rounded-lg px-3 py-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer">
              Cancelar
            </button>
            <button disabled={busy} className="rounded-lg bg-zinc-700 hover:bg-zinc-600 px-3 py-1.5 text-white font-medium transition-colors cursor-pointer" style={{ backgroundColor: 'var(--accent)' }}>
              {busy ? 'Salvando…' : 'Confirmar'}
            </button>
          </div>
        </form>
      ) : editing === 'move' ? (
        /* ENHANCED MOVE-TO DIALOG WITH INSTANT SEARCH & HIERARCHICAL FOLDERS */
        <div className="p-2 text-xs text-zinc-200 flex flex-col gap-2.5">
          <div className="flex items-center justify-between pb-1 border-b border-zinc-750">
            <div className="flex items-center gap-1.5 font-semibold text-zinc-100 text-[13px]">
              <FolderInput className="w-4 h-4" style={{ color: 'var(--accent)' }} />
              <span>Mover para pasta</span>
            </div>
            <button onClick={onClose} className="p-1 text-zinc-400 hover:text-zinc-200 rounded cursor-pointer">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Search Input Bar */}
          <div className="relative flex items-center bg-zinc-900/90 border border-zinc-700/80 rounded-lg px-2 py-1.5 focus-within:border-zinc-500">
            <Search className="w-3.5 h-3.5 text-zinc-400 shrink-0 mr-1.5" />
            <input
              type="text"
              autoFocus
              placeholder="Buscar pasta..."
              value={folderSearch}
              onChange={e => setFolderSearch(e.target.value)}
              className="w-full bg-transparent text-xs text-zinc-100 placeholder-zinc-500 outline-none"
            />
            {folderSearch && (
              <button onClick={() => setFolderSearch('')} className="p-0.5 text-zinc-400 hover:text-zinc-200 cursor-pointer">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Search Results Mode */}
          {folderSearch.trim() !== '' ? (
            <div className="flex flex-col gap-1 max-h-52 overflow-y-auto">
              <span className="text-[10px] text-zinc-400 font-medium px-1">Resultados da busca:</span>

              {/* Raiz do cofre matching option */}
              {'raiz do cofre'.includes(folderSearch.toLowerCase()) && (
                <button
                  type="button"
                  onClick={() => setValue('')}
                  className={`flex items-center justify-between p-2 rounded-lg text-left transition-colors cursor-pointer border ${
                    value === '' ? 'border-sky-500 bg-sky-500/10 text-white font-medium' : 'border-zinc-800 bg-zinc-900/40 text-zinc-300 hover:bg-zinc-800'
                  }`}
                  style={value === '' ? { borderColor: 'var(--accent)', backgroundColor: 'var(--accent-glow-subtle)' } : undefined}
                >
                  <div className="flex items-center gap-2 truncate">
                    <Folder className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--accent)' }} />
                    <span className="truncate">Raiz do cofre</span>
                  </div>
                  {value === '' && <Check className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--accent)' }} />}
                </button>
              )}

              {searchResults.length === 0 && !'raiz do cofre'.includes(folderSearch.toLowerCase()) ? (
                <div className="p-3 text-center text-zinc-500 text-[11px]">Nenhuma pasta encontrada</div>
              ) : (
                searchResults.map(f => {
                  const isSelected = value === f
                  return (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setValue(f)}
                      className={`flex items-center justify-between p-2 rounded-lg text-left transition-colors cursor-pointer border ${
                        isSelected
                          ? 'border-sky-500 bg-sky-500/10 text-white font-medium'
                          : 'border-zinc-800 bg-zinc-900/40 text-zinc-300 hover:bg-zinc-800'
                      }`}
                      style={isSelected ? { borderColor: 'var(--accent)', backgroundColor: 'var(--accent-glow-subtle)' } : undefined}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <Folder className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--accent)' }} />
                        <span className="truncate">{f}</span>
                      </div>
                      {isSelected && <Check className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--accent)' }} />}
                    </button>
                  )
                })
              )}
            </div>
          ) : (
            /* Hierarchical Navigation Mode (Drill down folders!) */
            <div className="flex flex-col gap-2">
              {/* Breadcrumb Trail */}
              <div className="flex items-center gap-1 text-[11px] text-zinc-400 overflow-x-auto pb-0.5">
                <button
                  type="button"
                  onClick={() => setCurrentNavFolder('')}
                  className="hover:text-white px-1 py-0.5 rounded hover:bg-zinc-800 transition-colors cursor-pointer shrink-0"
                >
                  Raiz
                </button>
                {currentNavFolder.split('/').filter(Boolean).map((seg, idx, arr) => {
                  const segPath = arr.slice(0, idx + 1).join('/')
                  const isLast = idx === arr.length - 1
                  return (
                    <Fragment key={segPath}>
                      <ChevronRight className="w-3 h-3 text-zinc-600 shrink-0" />
                      <button
                        type="button"
                        onClick={() => setCurrentNavFolder(segPath)}
                        className={`px-1 py-0.5 rounded transition-colors cursor-pointer truncate max-w-[100px] ${
                          isLast ? 'text-white font-medium bg-zinc-800/80' : 'hover:text-white hover:bg-zinc-800'
                        }`}
                        title={seg}
                      >
                        {seg}
                      </button>
                    </Fragment>
                  )
                })}
              </div>

              {/* Action: Select Current Folder as Destination */}
              <div
                onClick={() => setValue(currentNavFolder)}
                className={`p-2 rounded-lg border flex items-center justify-between cursor-pointer transition-all ${
                  value === currentNavFolder
                    ? 'border-sky-500 bg-sky-500/15 text-white font-medium shadow-xs'
                    : 'border-zinc-700/80 bg-zinc-900/60 text-zinc-300 hover:bg-zinc-800 hover:text-white'
                }`}
                style={value === currentNavFolder ? { borderColor: 'var(--accent)', backgroundColor: 'var(--accent-glow-subtle)' } : undefined}
              >
                <div className="flex items-center gap-2 truncate">
                  <FolderOpen className="w-4 h-4 shrink-0" style={{ color: 'var(--accent)' }} />
                  <div className="flex flex-col truncate text-left">
                    <span className="text-[10px] text-zinc-400">Destino selecionado:</span>
                    <span className="truncate font-semibold text-zinc-100">
                      {currentNavFolder ? currentNavFolder : 'Raiz do cofre'}
                    </span>
                  </div>
                </div>
                {value === currentNavFolder ? (
                  <Check className="w-4 h-4 shrink-0" style={{ color: 'var(--accent)' }} />
                ) : (
                  <span className="text-[10.5px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 hover:text-white shrink-0">
                    Mover para cá
                  </span>
                )}
              </div>

              {/* Subfolders in this directory */}
              <div className="flex flex-col gap-1 max-h-44 overflow-y-auto">
                {currentNavFolder !== '' && (
                  <button
                    type="button"
                    onClick={() => {
                      const parts = currentNavFolder.split('/')
                      parts.pop()
                      setCurrentNavFolder(parts.join('/'))
                    }}
                    className="flex items-center gap-2 p-1.5 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/70 text-left transition-colors cursor-pointer text-[11px]"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Voltar pasta anterior</span>
                  </button>
                )}

                {currentChildFolders.length === 0 ? (
                  <div className="p-3 text-center text-zinc-500 text-[11px]">
                    Nenhuma subpasta aqui
                  </div>
                ) : (
                  currentChildFolders.map(child => {
                    const isTarget = value === child.fullPath
                    return (
                      <div
                        key={child.fullPath}
                        className={`flex items-center justify-between p-1.5 rounded-lg transition-colors border ${
                          isTarget ? 'border-sky-500/80 bg-sky-500/10 text-white' : 'border-transparent text-zinc-300 hover:bg-zinc-800/80 hover:text-white'
                        }`}
                        style={isTarget ? { borderColor: 'var(--accent)', backgroundColor: 'var(--accent-glow-subtle)' } : undefined}
                      >
                        <div
                          onClick={() => setValue(child.fullPath)}
                          className="flex items-center gap-2 truncate flex-1 cursor-pointer"
                        >
                          <Folder className="w-3.5 h-3.5 shrink-0 opacity-80" style={{ color: 'var(--accent)' }} />
                          <span className="truncate">{child.name}</span>
                        </div>

                        {child.hasChildren && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              setCurrentNavFolder(child.fullPath)
                            }}
                            className="p-1 hover:bg-zinc-700/60 rounded text-zinc-400 hover:text-white transition-colors cursor-pointer flex items-center gap-0.5 text-[10px]"
                            title="Entrar nesta pasta"
                          >
                            <span>Abrir</span>
                            <ChevronRight className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          )}

          {/* Dialog Action Buttons */}
          <div className="flex items-center justify-between pt-2 border-t border-zinc-800">
            <span className="text-[10px] text-zinc-400 truncate max-w-[140px]">
              Alvo: <strong className="text-zinc-200">{value ? value.split('/').pop() : 'Raiz'}</strong>
            </span>
            <div className="flex gap-1.5">
              <button
                type="button"
                disabled={busy}
                onClick={onClose}
                className="rounded-lg px-2.5 py-1 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer text-xs"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void run('move', value)}
                className="rounded-lg px-3 py-1 text-white font-medium shadow-md transition-colors cursor-pointer text-xs flex items-center gap-1.5"
                style={{ backgroundColor: 'var(--accent)' }}
              >
                {busy ? 'Movendo…' : 'Mover'}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          {context.note ? item('open', 'Abrir em uma nova aba', context.note.type === 'mindmap' ? Brain : context.note.type === 'draw' ? Palette : context.note.type === 'html' ? CodeXml : FileText) : <>{item('new-note', 'Nova nota', FilePlus)}{item('new-draw', 'Novo Draw (Desenho)', Palette)}{item('new-mindmap', 'Novo Mapa Mental', Brain)}{item('new-html', 'Novo Arquivo HTML', CodeXml)}{item('import-html', 'Importar HTML nesta pasta...', FileInput)}{item('new-folder', 'Nova pasta', FolderPlus)}</>}
          {!isVaultRoot && <>{separator}{item('copy', 'Fazer uma cópia', Copy)}{item('move', context.note ? 'Mover arquivo para…' : 'Mover pasta para…', FolderInput)}</>}
          {!context.note && item('search', 'Pesquisa na pasta', Search)}
          {context.note && item('favorite', context.note.isFavorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos', Star)}
          {separator}{item('copy-path', 'Copiar caminho', Clipboard)}{item('copy-relative', 'Copiar caminho relativo', Clipboard)}
          {window.electronAPI?.isElectron && <>{separator}{context.note?.filePath && item('external', 'Abrir com o aplicativo padrão', ExternalLink)}{item('reveal', 'Mostrar na pasta', FolderInput)}</>}
          {!isVaultRoot && <>{separator}{item('rename', 'Renomear', Pencil)}{item('delete', 'Apagar', Trash2)}</>}
        </>
      )}
      {error && <p role="alert" className="p-2 text-xs text-rose-400">{error}</p>}
    </div>,
    document.body
  )
}
