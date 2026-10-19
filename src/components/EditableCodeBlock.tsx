import { useRef, useState } from 'react'
import { ArrowDown, Check, Copy, Trash2 } from 'lucide-react'
import type { CodeBlockData } from '../utils/editorBlocks'

interface Props {
  initial: CodeBlockData
  readOnly: boolean
  onChange: (block: CodeBlockData) => void
  onDelete: () => void
  onExit: () => void
}

export function EditableCodeBlock({ initial, readOnly, onChange, onDelete, onExit }: Props) {
  const [block, setBlock] = useState(initial)
  const [copyStatus, setCopyStatus] = useState('')
  const body = useRef<HTMLTextAreaElement>(null)
  const update = (next: CodeBlockData) => { setBlock(next); onChange(next) }
  const copy = async () => {
    try { await navigator.clipboard.writeText(block.content); setCopyStatus('Copiado') }
    catch { setCopyStatus('Não foi possível copiar') }
  }
  return <section className="editor-code-block" contentEditable={false} tabIndex={readOnly ? undefined : 0} aria-label="Bloco de código" onInput={event => event.stopPropagation()} onPaste={event => event.stopPropagation()} onKeyDown={event => {
    event.stopPropagation()
    if (readOnly) return
    if (event.key === 'Escape' || ((event.ctrlKey || event.metaKey) && event.key === 'Enter')) { event.preventDefault(); onExit() }
    if (event.target === event.currentTarget && ['Backspace', 'Delete'].includes(event.key)) { event.preventDefault(); onDelete() }
  }}>
    <header className="editor-code-header">
      {readOnly ? <span className="editor-code-title">{block.title || block.language || 'Código'}</span> : <input aria-label="Título do bloco de código" placeholder={block.language || 'Título do bloco'} value={block.title} onChange={event => update({ ...block, title: event.target.value })} />}
      <div className="editor-block-actions">
        {readOnly ? block.title && block.language && <span className="editor-code-language">{block.language}</span> : <input className="editor-code-language" aria-label="Linguagem do código" placeholder="texto" value={block.language} onChange={event => update({ ...block, language: event.target.value })} />}
        <button type="button" aria-label="Copiar código" title="Copiar código" onClick={() => void copy()}>{copyStatus === 'Copiado' ? <Check size={14} /> : <Copy size={14} />}</button>
        {!readOnly && <button type="button" aria-label="Excluir bloco de código" title="Excluir bloco de código" onClick={onDelete}><Trash2 size={14} /></button>}
      </div>
    </header>
    {readOnly ? <pre><code>{block.content}</code></pre> : <textarea ref={body} className="editor-code-content" aria-label="Conteúdo do bloco de código" placeholder="Digite ou cole seu código…" rows={3} value={block.content} spellCheck={false} autoCapitalize="off" autoCorrect="off" onChange={event => { setCopyStatus(''); update({ ...block, content: event.target.value }) }} onKeyDown={event => {
      if (event.nativeEvent.isComposing) return
      if (event.key === 'Tab') {
        event.preventDefault()
        const field = event.currentTarget
        const start = field.selectionStart
        const end = field.selectionEnd
        const insert = event.shiftKey ? '' : '  '
        const remove = event.shiftKey && block.content.slice(Math.max(0, start - 2), start) === '  ' ? 2 : 0
        update({ ...block, content: block.content.slice(0, start - remove) + insert + block.content.slice(end) })
        requestAnimationFrame(() => body.current?.setSelectionRange(start - remove + insert.length, start - remove + insert.length))
      }
      if (event.key === 'Backspace' && !block.content) { event.preventDefault(); onDelete() }
    }} />}
    {!readOnly && <footer className="editor-block-footer"><button type="button" onClick={onExit}><ArrowDown size={13} />Escrever abaixo</button>{copyStatus && <span role="status">{copyStatus}</span>}</footer>}
    {readOnly && copyStatus && <span className="editor-copy-status" role="status">{copyStatus}</span>}
  </section>
}
