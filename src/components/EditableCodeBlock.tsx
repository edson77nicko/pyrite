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
  return <section className="editor-code-block relative group" contentEditable={false} tabIndex={readOnly ? undefined : 0} aria-label="Bloco de código" onInput={event => event.stopPropagation()} onPaste={event => event.stopPropagation()} onKeyDown={event => {
    event.stopPropagation()
    if (readOnly) return
    if (event.key === 'Escape' || ((event.ctrlKey || event.metaKey) && event.key === 'Enter')) { event.preventDefault(); onExit() }
    if (event.target === event.currentTarget && ['Backspace', 'Delete'].includes(event.key)) { event.preventDefault(); onDelete() }
  }}>
    {/* Floating Controls Inside: Superior Direito */}
    <div className="editor-code-actions-overlay absolute top-2 right-2.5 z-10 flex items-center gap-1.5 opacity-60 group-hover:opacity-100 transition-opacity select-none">
      {readOnly ? (
        (block.language || block.title) && (
          <span className="editor-code-lang-pill text-[10px] font-mono uppercase px-1.5 py-0.5 rounded text-zinc-400 font-medium">
            {block.language || block.title}
          </span>
        )
      ) : (
        <input
          className="editor-code-lang-input text-[10px] font-mono px-1.5 py-0.5 rounded border border-transparent hover:border-zinc-700/60 focus:border-zinc-600 outline-none w-20 text-right text-zinc-400 bg-transparent placeholder-zinc-600"
          aria-label="Linguagem do código"
          placeholder="linguagem"
          value={block.language}
          onChange={event => update({ ...block, language: event.target.value })}
        />
      )}
      <button
        type="button"
        className="editor-code-action-btn p-1 rounded hover:bg-zinc-700/40 text-zinc-400 hover:text-zinc-200 cursor-pointer transition-colors"
        aria-label="Copiar código"
        title="Copiar código"
        onClick={() => void copy()}
      >
        {copyStatus === 'Copiado' ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
      </button>
      {!readOnly && (
        <button
          type="button"
          className="editor-code-action-btn p-1 rounded hover:bg-rose-950/40 text-zinc-500 hover:text-rose-400 cursor-pointer transition-colors"
          aria-label="Excluir bloco de código"
          title="Excluir bloco de código"
          onClick={onDelete}
        >
          <Trash2 size={13} />
        </button>
      )}
    </div>

    {/* Code Area */}
    {readOnly ? (
      <pre><code>{block.content}</code></pre>
    ) : (
      <textarea
        ref={body}
        className="editor-code-content"
        aria-label="Conteúdo do bloco de código"
        placeholder="Digite ou cole seu código…"
        rows={3}
        value={block.content}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        onChange={event => { setCopyStatus(''); update({ ...block, content: event.target.value }) }}
        onKeyDown={event => {
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
        }}
      />
    )}
    {!readOnly && <footer className="editor-block-footer"><button type="button" onClick={onExit}><ArrowDown size={13} />Escrever abaixo</button>{copyStatus && <span role="status">{copyStatus}</span>}</footer>}
    {readOnly && copyStatus && <span className="editor-copy-status" role="status">{copyStatus}</span>}
  </section>
}
