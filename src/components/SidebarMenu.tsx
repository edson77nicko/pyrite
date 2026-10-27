import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Copy, Pencil, Trash2, FolderInput, FilePlus, FolderPlus, Search, Star, Clipboard, ExternalLink, FileText, Palette, Brain, CodeXml } from 'lucide-react'
import type { Note } from '../types'

export type SidebarAction = 'new-note' | 'new-draw' | 'new-mindmap' | 'new-html' | 'new-folder' | 'search' | 'open' | 'copy' | 'move' | 'favorite' | 'copy-path' | 'copy-relative' | 'reveal' | 'external' | 'rename' | 'delete'
interface Props {
  context: { x: number; y: number; note?: Note; folder?: string }
  folders: string[]
  isVaultRoot?: boolean
  onClose: () => void
  onAction: (action: SidebarAction, value?: string) => Promise<void>
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
  useLayoutEffect(() => {
    const menu = ref.current!
    const bounds = menu.getBoundingClientRect()
    setPosition({ left: Math.max(8, Math.min(context.x, innerWidth - bounds.width - 8)), top: Math.max(8, Math.min(context.y, innerHeight - bounds.height - 8)) })
    menu.querySelector<HTMLButtonElement>('button')?.focus()
    const dismiss = (e: PointerEvent) => { if (!menu.contains(e.target as Node)) closeRef.current() }
    const close = () => closeRef.current()
    document.addEventListener('pointerdown', dismiss)
    window.addEventListener('resize', close)
    return () => { document.removeEventListener('pointerdown', dismiss); window.removeEventListener('resize', close) }
  }, [context.x, context.y])
  const run = async (action: SidebarAction, input?: string) => {
    setBusy(true); setError('')
    try { await onAction(action, input); onClose() }
    catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível concluir a ação.') }
    finally { setBusy(false) }
  }
  const item = (action: SidebarAction, label: string, Icon: typeof Copy) => <button key={action} role="menuitem" disabled={busy} className={`flex w-full items-center gap-3 rounded px-2 py-1.5 text-left text-xs hover:bg-zinc-700/50 focus:bg-zinc-700/50 focus:outline-none disabled:opacity-40 ${action === 'delete' ? 'text-rose-400' : 'text-zinc-200'}`} onClick={() => {
    if (action === 'rename' || action === 'move') { setEditing(action); setValue(action === 'rename' ? context.note?.title || context.folder!.split('/').pop()! : context.note?.folder || ''); return }
    if (action === 'delete' && !confirm(context.note ? `Apagar "${context.note.title}"?` : `Apagar a pasta "${context.folder}" e todo o seu conteúdo?`)) return
    void run(action)
  }}><Icon size={15} className="shrink-0 opacity-70" />{label}</button>
  const separator = <div role="separator" className="my-1 border-t border-zinc-700/60" />
  return createPortal(<div ref={ref} role="menu" aria-label={context.note ? 'Opções da nota' : 'Opções da pasta'} style={position} className="fixed z-[100] w-64 max-h-[calc(100vh-16px)] overflow-y-auto rounded-xl border border-zinc-700 bg-[#181b21] p-1.5 shadow-2xl" onContextMenu={e => e.preventDefault()} onKeyDown={e => {
    if (e.key === 'Escape') { e.stopPropagation(); onClose() }
    if (!editing && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
      e.preventDefault()
      const buttons = Array.from(ref.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
      buttons[e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1 : (index + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus()
    }
  }}>
    {editing ? <form className="space-y-2 p-2 text-xs text-zinc-200" onSubmit={e => { e.preventDefault(); void run(editing, value) }}>
      <label className="block">{editing === 'rename' ? 'Novo nome' : 'Pasta de destino'}
        {editing === 'rename' ? <input autoFocus value={value} onChange={e => setValue(e.target.value)} className="mt-2 w-full rounded border border-zinc-600 bg-zinc-900 p-2" /> : <select autoFocus value={value} onChange={e => setValue(e.target.value)} className="mt-2 w-full rounded border border-zinc-600 bg-zinc-900 p-2"><option value="">Raiz do cofre</option>{folders.filter(f => !context.folder || (f !== context.folder && !f.startsWith(context.folder + '/'))).map(f => <option key={f} value={f}>{f}</option>)}</select>}
      </label><div className="flex gap-2"><button disabled={busy} className="rounded bg-zinc-700 px-3 py-1">{busy ? 'Salvando…' : 'Confirmar'}</button><button type="button" disabled={busy} onClick={onClose}>Cancelar</button></div>
    </form> : <>
      {context.note ? item('open', 'Abrir em uma nova aba', context.note.type === 'mindmap' ? Brain : context.note.type === 'draw' ? Palette : context.note.type === 'html' ? CodeXml : FileText) : <>{item('new-note', 'Nova nota', FilePlus)}{item('new-draw', 'Novo Draw (Desenho)', Palette)}{item('new-mindmap', 'Novo Mapa Mental', Brain)}{item('new-html', 'Novo Arquivo HTML', CodeXml)}{item('new-folder', 'Nova pasta', FolderPlus)}</>}
      {!isVaultRoot && <>{separator}{item('copy', 'Fazer uma cópia', Copy)}{item('move', context.note ? 'Mover arquivo para…' : 'Mover pasta para…', FolderInput)}</>}
      {!context.note && item('search', 'Pesquisa na pasta', Search)}
      {context.note && item('favorite', context.note.isFavorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos', Star)}
      {separator}{item('copy-path', 'Copiar caminho', Clipboard)}{item('copy-relative', 'Copiar caminho relativo', Clipboard)}
      {window.electronAPI?.isElectron && <>{separator}{context.note?.filePath && item('external', 'Abrir com o aplicativo padrão', ExternalLink)}{item('reveal', 'Mostrar na pasta', FolderInput)}</>}
      {!isVaultRoot && <>{separator}{item('rename', 'Renomear', Pencil)}{item('delete', 'Apagar', Trash2)}</>}
    </>}
    {error && <p role="alert" className="p-2 text-xs text-rose-400">{error}</p>}
  </div>, document.body)
}
