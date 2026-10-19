import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowRight, FileText, Link2, Maximize2, Plus, Trash2, X, ZoomIn, ZoomOut } from 'lucide-react'
import type { CanvasCard, Note } from '../types'
import { createBoard, initialCanvas, isCanvasDocument, linkedNote, notePath, type CanvasBoard, type CanvasDocument } from '../utils/canvasBoards'

interface Props { notes?: Note[]; vaultPath?: string; onOpenNote?: (noteId: string) => void }
const uid = () => crypto.randomUUID()
const cleanPath = (value: string) => value.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()

export function CanvasView({ notes = [], vaultPath, onOpenNote }: Props) {
  const storageKey = 'pyrita_canvas_v2:' + (vaultPath ? cleanPath(vaultPath) : 'local')
  const native = !!vaultPath && !!window.electronAPI?.readCanvas
  const [document, setDocument] = useState<CanvasDocument | null>(null)
  const latest = useRef<CanvasDocument | null>(null)
  const mounted = useRef(true)
  const [status, setStatus] = useState('Carregando quadros…')
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const [connecting, setConnecting] = useState<string | null>(null)
  const [edgeId, setEdgeId] = useState<string | null>(null)
  const [picker, setPicker] = useState(false)
  const [query, setQuery] = useState('')
  const [form, setForm] = useState<'new' | 'rename' | 'delete' | null>(null)
  const [boardName, setBoardName] = useState('')
  const surface = useRef<HTMLDivElement>(null)
  const drag = useRef<{ pointer: number; card?: string; x: number; y: number; originX: number; originY: number } | null>(null)
  const board = document?.boards.find(item => item.id === document.activeBoardId)

  const persist = useCallback((next: CanvasDocument) => {
    latest.current = next; setDocument(next)
    const token = uid()
    try {
      localStorage.setItem(storageKey, JSON.stringify({ document: next, pending: native, token }))
      setError(''); setStatus(native ? 'Salvando…' : 'Salvo neste navegador')
      if (native) void window.electronAPI!.writeCanvas(vaultPath!, next).then(result => {
        const backup = JSON.parse(localStorage.getItem(storageKey) || 'null')
        if (backup?.token !== token) return
        if (!result.success) throw new Error(result.error || 'Não foi possível salvar no cofre.')
        localStorage.setItem(storageKey, JSON.stringify({ document: next, pending: false, token }))
        if (mounted.current) { setStatus('Salvo no cofre'); setError('') }
      }).catch(err => { if (mounted.current) { setError(String(err instanceof Error ? err.message : err)); setStatus('Cópia local preservada') } })
    } catch (err) { setError(String(err instanceof Error ? err.message : err)); setStatus('Falha ao salvar') }
  }, [storageKey, native, vaultPath])
  useEffect(() => {
    mounted.current = true
    let cancelled = false
    const load = async () => {
      try {
        const backup = JSON.parse(localStorage.getItem(storageKey) || 'null')
        const remote = native ? await window.electronAPI!.readCanvas(vaultPath!) : null
        if (cancelled) return
        if (remote !== null && !isCanvasDocument(remote)) throw new Error('O arquivo de quadros não é válido. O original foi preservado.')
        const cached = isCanvasDocument(backup?.document) ? backup : null
        const owner = localStorage.getItem('pyrita_canvas_legacy_owner')
        const next = cached?.pending ? cached.document : remote || cached?.document || initialCanvas(localStorage, !owner || owner === storageKey)
        latest.current = next; setDocument(next); setError('')
        if (!owner) localStorage.setItem('pyrita_canvas_legacy_owner', storageKey)
        if ((native && (!remote || cached?.pending)) || !cached && !native) persist(next)
        else setStatus(native ? 'Salvo no cofre' : 'Salvo neste navegador')
      } catch (err) { if (!cancelled) { setError(String(err instanceof Error ? err.message : err)); setStatus('Não foi possível abrir os quadros') } }
    }
    void load()
    return () => { cancelled = true; mounted.current = false }
  }, [storageKey, native, vaultPath, retry, persist])

  const changeBoard = (update: (current: CanvasBoard) => CanvasBoard, save = true) => {
    const current = latest.current
    if (!current) return
    const next = { ...current, boards: current.boards.map(item => item.id === current.activeBoardId ? update(item) : item) }
    latest.current = next
    if (save) persist(next); else setDocument(next)
  }
  const ready = document !== null
  // Store portable paths when a linked note is renamed or moved during this session.
  useEffect(() => {
    const current = latest.current
    if (!current) return
    let changed = false
    const boards = current.boards.map(item => ({ ...item, cards: item.cards.map(card => {
      if (!card.noteId && !card.notePath) return card
      const note = linkedNote(card, notes, vaultPath)
      if (!note || (card.notePath === notePath(note, vaultPath) && card.title === note.title && card.noteId === note.id)) return card
      changed = true
      return { ...card, notePath: notePath(note, vaultPath), noteId: note.id, title: note.title }
    }) }))
    if (changed) persist({ ...current, boards })
  }, [notes, vaultPath, ready, persist])

  const resetSelection = () => { setSelected(null); setConnecting(null); setEdgeId(null); setPicker(false); setForm(null) }
  const addCard = (note?: Note, point?: { x: number; y: number }) => {
    if (!board) return
    const rect = surface.current!.getBoundingClientRect()
    const columns = Math.max(1, Math.floor((rect.width / board.view.zoom - 48) / 320))
    let position = { x: (24 - board.view.x) / board.view.zoom, y: (150 - board.view.y) / board.view.zoom }
    if (!point) for (let index = 0; index < 1000; index++) {
      position = { x: (24 - board.view.x) / board.view.zoom + (index % columns) * 320, y: (150 - board.view.y) / board.view.zoom + Math.floor(index / columns) * 250 }
      if (!board.cards.some(card => position.x < card.x + card.width + 16 && position.x + 296 > card.x && position.y < card.y + card.height + 16 && position.y + 226 > card.y)) break
    }
    const card: CanvasCard = { id: uid(), title: note?.title || 'Nova ideia', text: '', noteId: note?.id, notePath: note ? notePath(note, vaultPath) : undefined, color: '#71717a', x: point?.x ?? position.x, y: point?.y ?? position.y, width: 280, height: 210 }
    changeBoard(current => ({ ...current, cards: [...current.cards, card] })); setSelected(card.id); setPicker(false)
  }
  const removeCard = (id: string) => { changeBoard(current => ({ ...current, cards: current.cards.filter(card => card.id !== id), connections: current.connections.filter(edge => edge.from !== id && edge.to !== id) })); resetSelection() }
  const connectTo = (id: string) => {
    if (!connecting) { setConnecting(id); return }
    if (connecting !== id) {
      const existing = board?.connections.find(edge => edge.from === connecting && edge.to === id)
      if (existing) setEdgeId(existing.id)
      else { const edge = { id: uid(), from: connecting, to: id, label: 'relaciona-se com' }; changeBoard(current => ({ ...current, connections: [...current.connections, edge] })); setEdgeId(edge.id) }
    }
    setConnecting(null)
  }
  const fit = () => {
    if (!board || !surface.current || !board.cards.length) return
    const left = Math.min(...board.cards.map(card => card.x)), top = Math.min(...board.cards.map(card => card.y))
    const width = Math.max(...board.cards.map(card => card.x + card.width)) - left
    const height = Math.max(...board.cards.map(card => card.y + card.height)) - top
    const bounds = surface.current.getBoundingClientRect()
    const zoom = Math.max(.15, Math.min(1.5, (bounds.width - 80) / width, (bounds.height - 170) / height))
    changeBoard(current => ({ ...current, view: { zoom, x: (bounds.width - width * zoom) / 2 - left * zoom, y: 110 - top * zoom } }))
  }
  const pointerDown = (event: React.PointerEvent, card?: CanvasCard) => {
    if (event.button !== 0 || !board) return
    if (!card && (event.target as HTMLElement).closest('.canvas-ui, .canvas-card, .canvas-edge')) return
    event.preventDefault()
    if (connecting && card) { connectTo(card.id); return }
    surface.current?.setPointerCapture(event.pointerId)
    drag.current = { pointer: event.pointerId, card: card?.id, x: event.clientX, y: event.clientY, originX: card?.x ?? board.view.x, originY: card?.y ?? board.view.y }
    setSelected(card?.id || null); setPicker(false)
  }
  const stopDrag = () => { if (drag.current && latest.current) persist(latest.current); drag.current = null }
  const zoomTo = (value: number) => {
    if (!board || !surface.current) return
    const zoom = Math.max(.15, Math.min(2.5, value)), centerX = surface.current.clientWidth / 2, centerY = surface.current.clientHeight / 2
    changeBoard(current => ({ ...current, view: { zoom, x: centerX - (centerX - current.view.x) * zoom / current.view.zoom, y: centerY - (centerY - current.view.y) * zoom / current.view.zoom } }))
  }
  const editedEdge = board?.connections.find(edge => edge.id === edgeId)
  const button = 'canvas-button'
  return <div ref={surface} className="canvas-project" aria-label="Quadro do projeto" onPointerDown={event => pointerDown(event)} onPointerMove={event => {
    const moving = drag.current
    if (!moving || moving.pointer !== event.pointerId || !board) return
    const dx = event.clientX - moving.x, dy = event.clientY - moving.y
    changeBoard(current => moving.card ? { ...current, cards: current.cards.map(card => card.id === moving.card ? { ...card, x: moving.originX + dx / current.view.zoom, y: moving.originY + dy / current.view.zoom } : card) } : { ...current, view: { ...current.view, x: moving.originX + dx, y: moving.originY + dy } }, false)
  }} onPointerUp={stopDrag} onPointerCancel={stopDrag} onDoubleClick={event => {
    if ((event.target as HTMLElement).closest('.canvas-ui, .canvas-card, .canvas-edge') || !board) return
    const rect = surface.current!.getBoundingClientRect()
    addCard(undefined, { x: (event.clientX - rect.left - board.view.x) / board.view.zoom, y: (event.clientY - rect.top - board.view.y) / board.view.zoom })
  }} onKeyDown={event => { if (event.key === 'Escape') resetSelection() }}>
    <div className="canvas-dots" style={{ backgroundSize: `${24 * (board?.view.zoom || 1)}px ${24 * (board?.view.zoom || 1)}px`, backgroundPosition: `${board?.view.x || 0}px ${board?.view.y || 0}px` }}/>
    <div className="canvas-ui canvas-project-toolbar">
      <div className="canvas-project-heading"><div><span className="canvas-eyebrow">Quadros do projeto</span><small role="status">{status}</small></div>
        <select aria-label="Selecionar quadro" value={document?.activeBoardId || ''} disabled={!document} onChange={event => { if (document) { persist({ ...document, activeBoardId: event.target.value }); resetSelection() } }}>{document?.boards.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
      </div>
      <div className="canvas-toolbar-actions">
        <button className={button} disabled={!board} onClick={() => { setForm('new'); setBoardName(''); setPicker(false) }}><Plus size={14}/>Novo quadro</button>
        <button className={button} disabled={!board} onClick={() => { setForm('rename'); setBoardName(board!.name) }}>Renomear</button>
        <button className={button} disabled={!board} onClick={() => addCard()}><Plus size={14}/>Ideia</button>
        <button className={button} disabled={!board} onClick={() => { setPicker(!picker); setQuery(''); setForm(null) }}><FileText size={14}/>Vincular nota</button>
        <button className={button} disabled={!board} aria-label="Excluir quadro" onClick={() => setForm('delete')}><Trash2 size={14}/></button>
      </div>
      {picker && <div className="canvas-note-picker"><input autoFocus aria-label="Buscar nota para vincular" placeholder="Buscar notas do cofre…" value={query} onChange={event => setQuery(event.target.value)}/><div>{notes.filter(note => (note.title + ' ' + note.folder).toLowerCase().includes(query.toLowerCase())).map(note => <button key={note.id} onClick={() => addCard(note)}><span>{note.title}</span><small>{note.folder || 'Início'}</small></button>)}{!notes.length && <p>Crie uma nota no editor para vinculá-la aqui.</p>}</div></div>}
    </div>
    {error && <div className="canvas-ui canvas-error" role="alert">{error}<button className={button} onClick={() => document ? persist(document) : setRetry(value => value + 1)}>Tentar novamente</button></div>}
    {form && <div className="canvas-ui canvas-board-form" role="dialog" aria-label={form === 'new' ? 'Novo quadro' : form === 'rename' ? 'Renomear quadro' : 'Excluir quadro'}>
      {form === 'delete' ? <><p>Excluir “{board?.name}” e seus cartões? As notas vinculadas serão mantidas.</p><div><button className={button} onClick={() => { if (!document || !board) return; const remaining = document.boards.filter(item => item.id !== board.id); if (!remaining.length) remaining.push(createBoard('Novo projeto')); persist({ ...document, boards: remaining, activeBoardId: remaining[0].id }); resetSelection() }}>Excluir quadro</button><button className={button} onClick={() => setForm(null)}>Cancelar</button></div></> : <form onSubmit={event => { event.preventDefault(); if (!boardName.trim() || !document) return; if (form === 'new') { const next = createBoard(boardName.trim()); persist({ ...document, boards: [...document.boards, next], activeBoardId: next.id }) } else changeBoard(current => ({ ...current, name: boardName.trim() })); resetSelection() }}><label>Nome do projeto<input autoFocus required maxLength={100} value={boardName} onChange={event => setBoardName(event.target.value)}/></label><div><button className={button} type="submit">{form === 'new' ? 'Criar quadro' : 'Salvar nome'}</button><button type="button" className={button} onClick={() => setForm(null)}>Cancelar</button></div></form>}
    </div>}
    {board && <>
      <div className="canvas-world" style={{ transform: `translate(${board.view.x}px, ${board.view.y}px) scale(${board.view.zoom})` }}>
        <svg className="canvas-lines"><defs><marker id="project-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 1 L9 5 L0 9" fill="none" stroke="#a1a1aa"/></marker></defs>
          {board.connections.map(edge => {
            const from = board.cards.find(card => card.id === edge.from), to = board.cards.find(card => card.id === edge.to)
            if (!from || !to) return null
            const horizontal = Math.abs(to.x - from.x) > Math.abs(to.y - from.y)
            const forward = horizontal ? to.x >= from.x : to.y >= from.y
            const x1 = horizontal ? from.x + (forward ? from.width : 0) : from.x + from.width / 2, y1 = horizontal ? from.y + from.height / 2 : from.y + (forward ? from.height : 0)
            const x2 = horizontal ? to.x + (forward ? 0 : to.width) : to.x + to.width / 2, y2 = horizontal ? to.y + to.height / 2 : to.y + (forward ? 0 : to.height)
            const d = `M${x1} ${y1} L${x2} ${y2}`
            return <g key={edge.id} className="canvas-edge" role="button" tabIndex={0} aria-label={`Editar conexão: ${edge.label || 'Sem nome'}`} onClick={() => setEdgeId(edge.id)} onKeyDown={event => { if (event.key === 'Enter') setEdgeId(edge.id) }}><path d={d} stroke="transparent" strokeWidth={20}/><path d={d} fill="none" stroke={edgeId === edge.id ? '#e4e4e7' : '#71717a'} strokeWidth={1.5} markerEnd="url(#project-arrow)"/><text x={(x1+x2)/2} y={(y1+y2)/2-9} textAnchor="middle">{edge.label || 'Nomear conexão'}</text></g>
          })}
        </svg>
        {board.cards.map(card => {
          const linked = !!card.noteId || !!card.notePath, note = linked ? linkedNote(card, notes, vaultPath) : undefined
          return <article key={card.id} data-card-id={card.id} className={`canvas-card ${selected === card.id ? 'is-selected' : ''} ${connecting === card.id ? 'is-connecting' : ''}`} style={{ left: card.x, top: card.y, width: card.width, height: card.height }} onClick={() => { if (connecting && connecting !== card.id) connectTo(card.id); else setSelected(card.id) }}>
            <header onPointerDown={event => { event.stopPropagation(); pointerDown(event, card) }} title="Arraste para mover o cartão">{linked ? <><FileText size={14}/><strong>{note?.title || card.title || 'Nota vinculada'}</strong></> : <input aria-label="Título da ideia" value={card.title || ''} onPointerDown={event => event.stopPropagation()} onChange={event => changeBoard(current => ({ ...current, cards: current.cards.map(item => item.id === card.id ? { ...item, title: event.target.value } : item) }))}/>}<span className="canvas-drag-handle">⠿</span></header>
            {linked ? <div className="canvas-linked-content">{note ? <p>{note.content || 'Esta nota ainda está vazia.'}</p> : <p className="canvas-missing">Nota não encontrada no cofre. O vínculo foi preservado.</p>}</div> : <textarea aria-label="Conteúdo da ideia" placeholder="Escreva sua ideia…" value={card.text} onChange={event => changeBoard(current => ({ ...current, cards: current.cards.map(item => item.id === card.id ? { ...item, text: event.target.value } : item) }))}/>}
            <footer><span>{linked ? note ? 'Vinculada à nota' : 'Vínculo indisponível' : 'Ideia livre'}</span><div>{note && <button title="Abrir nota no editor" onClick={event => { event.stopPropagation(); onOpenNote?.(note.id) }}>Abrir ↗</button>}<button title="Conectar cartão" aria-label={`Conectar ${note?.title || card.title || 'cartão'}`} onClick={event => { event.stopPropagation(); connectTo(card.id) }}><Link2 size={14}/></button><button title="Remover cartão" onClick={event => { event.stopPropagation(); removeCard(card.id) }}><X size={14}/></button></div></footer>
          </article>
        })}
      </div>
      {!board.cards.length && <div className="canvas-ui canvas-empty"><h2>Um espaço para este projeto</h2><p>Traga suas notas, escreva ideias e conecte o que faz sentido.</p><div><button className={button} onClick={() => addCard()}>Adicionar ideia</button><button className={button} onClick={() => { setPicker(true); setQuery('') }}>Vincular uma nota</button></div></div>}
      {editedEdge && <div className="canvas-ui canvas-edge-editor"><label>Nome da conexão<input autoFocus value={editedEdge.label || ''} onChange={event => changeBoard(current => ({ ...current, connections: current.connections.map(edge => edge.id === editedEdge.id ? { ...edge, label: event.target.value } : edge) }))}/></label><button className={button} aria-label="Excluir conexão" onClick={() => { changeBoard(current => ({ ...current, connections: current.connections.filter(edge => edge.id !== editedEdge.id) })); setEdgeId(null) }}><Trash2 size={14}/></button><button className={button} aria-label="Fechar conexão" onClick={() => setEdgeId(null)}><X size={14}/></button></div>}
      <div className="canvas-ui canvas-navigation"><button className={button} aria-label="Diminuir zoom" onClick={() => zoomTo(board.view.zoom - .15)}><ZoomOut size={15}/></button><span>{Math.round(board.view.zoom * 100)}%</span><button className={button} aria-label="Aumentar zoom" onClick={() => zoomTo(board.view.zoom + .15)}><ZoomIn size={15}/></button><button className={button} onClick={fit} title="Enquadrar todos os cartões"><Maximize2 size={15}/>Enquadrar</button></div>
      <p className="canvas-ui canvas-hint">{connecting ? <><ArrowRight size={14}/>Escolha o cartão de destino. Esc cancela.</> : <>Arraste pelo cabeçalho · Duplo clique cria uma ideia</>}</p>
    </>}
  </div>
}
