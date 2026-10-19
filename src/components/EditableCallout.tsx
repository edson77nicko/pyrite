import { useState } from 'react'
import { Info, Lightbulb, TriangleAlert, Trash2 } from 'lucide-react'
import type { CalloutData } from '../utils/editorBlocks'

interface Props {
  initial: CalloutData
  readOnly: boolean
  renderInline: (text: string) => string
  onChange: (block: CalloutData) => void
  onDelete: () => void
  onExit: () => void
}

export function EditableCallout({ initial, readOnly, renderInline, onChange, onDelete, onExit }: Props) {
  const [block, setBlock] = useState(initial)
  const update = (next: CalloutData) => { setBlock(next); onChange(next) }
  const Icon = block.type === 'TIP' ? Lightbulb : ['WARNING', 'CAUTION', 'IMPORTANT'].includes(block.type) ? TriangleAlert : Info
  const label = ({ TIP: 'Dica', NOTE: 'Nota', WARNING: 'Aviso', IMPORTANT: 'Importante', CAUTION: 'Atenção' } as Record<string, string>)[block.type] || block.type
  return <section className={`editor-callout editor-callout-${block.type.toLowerCase()}`} contentEditable={false} tabIndex={readOnly ? undefined : 0} aria-label={`Callout de ${label.toLowerCase()}`} onInput={event => event.stopPropagation()} onPaste={event => event.stopPropagation()} onKeyDown={event => {
    event.stopPropagation()
    if (readOnly) return
    if (event.key === 'Escape' || ((event.ctrlKey || event.metaKey) && event.key === 'Enter')) { event.preventDefault(); onExit() }
    if (event.target === event.currentTarget && ['Backspace', 'Delete'].includes(event.key)) { event.preventDefault(); onDelete() }
  }}>
    <header><Icon size={15} />{readOnly ? <strong>{block.title || label}</strong> : <input aria-label="Título do callout" placeholder={label} value={block.title} onChange={event => update({ ...block, title: event.target.value })} />}{!readOnly && <button type="button" aria-label="Excluir callout" title="Excluir callout" onClick={onDelete}><Trash2 size={14} /></button>}</header>
    {readOnly ? <div className="editor-callout-content" dangerouslySetInnerHTML={{ __html: block.content.split('\n').map(renderInline).join('<br>') }} /> : <textarea aria-label="Conteúdo do callout" className="editor-callout-content" placeholder="Escreva aqui…" value={block.content} rows={1} onChange={event => update({ ...block, content: event.target.value })} onKeyDown={event => {
      if (!event.nativeEvent.isComposing && event.key === 'Backspace' && !block.content) { event.preventDefault(); onDelete() }
    }} />}
  </section>
}
