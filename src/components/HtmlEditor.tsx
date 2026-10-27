import React, { useState, useEffect, useRef } from 'react'
import type { Note } from '../types'
import {
  CodeXml,
  Eye,
  Columns,
  Code,
  RotateCw,
  Copy,
  Check,
  ExternalLink,
  Smartphone,
  Tablet,
  Monitor,
  WrapText,
  Sparkles
} from 'lucide-react'

interface HtmlEditorProps {
  note: Note
  onUpdateNote: (note: Note) => void
}

type ViewMode = 'preview' | 'split' | 'code'
type ViewportSize = 'desktop' | 'tablet' | 'mobile'

export const HtmlEditor: React.FC<HtmlEditorProps> = ({ note, onUpdateNote }) => {
  const [content, setContent] = useState(note.content)
  const [viewMode, setViewMode] = useState<ViewMode>('split')
  const [viewport, setViewport] = useState<ViewportSize>('desktop')
  const [wordWrap, setWordWrap] = useState(true)
  const [copied, setCopied] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const lineNumbersRef = useRef<HTMLDivElement>(null)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync when note.content changes externally (e.g., via AI Chat <<<REPLACE_NOTE>>>)
  useEffect(() => {
    if (note.content !== content) {
      setContent(note.content)
      setRefreshKey(k => k + 1)
    }
  }, [note.content])

  // Debounced update to parent
  const handleContentChange = (newVal: string) => {
    setContent(newVal)
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    debounceTimerRef.current = setTimeout(() => {
      onUpdateNote({
        ...note,
        content: newVal,
        updatedAt: Date.now()
      })
    }, 400)
  }

  const handleBlur = () => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    if (content !== note.content) {
      onUpdateNote({
        ...note,
        content,
        updatedAt: Date.now()
      })
    }
  }

  // Handle Tab key for clean indentation (2 spaces)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault()
      const textarea = textareaRef.current
      if (!textarea) return
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const spaces = '  '
      const updated = content.substring(0, start) + spaces + content.substring(end)
      handleContentChange(updated)
      requestAnimationFrame(() => {
        textarea.selectionStart = textarea.selectionEnd = start + spaces.length
      })
    }
  }

  // Synchronize line numbers scroll with textarea
  const handleScroll = () => {
    if (textareaRef.current && lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop
    }
  }

  // Copy HTML code
  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy', err)
    }
  }

  // Open preview in a new window/browser
  const handleOpenExternal = () => {
    const blob = new Blob([content], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank')
  }

  // Calculate lines for line number gutter
  const lineCount = content.split('\n').length
  const lineNumbers = Array.from({ length: Math.max(lineCount, 1) }, (_, i) => i + 1)

  // Viewport widths
  const viewportWidthClass =
    viewport === 'mobile'
      ? 'max-w-[375px]'
      : viewport === 'tablet'
      ? 'max-w-[768px]'
      : 'w-full'

  return (
    <div className="flex flex-col h-full w-full bg-[#0d0d11] text-[#e4e4e7] overflow-hidden select-none">
      {/* Top Header / Toolbar */}
      <header className="flex items-center justify-between px-4 py-2 border-b border-[#27272a] bg-[#121217] shrink-0 text-xs">
        {/* Left: File Badge & Title */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#f97316]/10 text-[#f97316] border border-[#f97316]/20 font-mono font-semibold">
            <CodeXml className="w-3.5 h-3.5" />
            <span>HTML5</span>
          </div>
          <span className="font-semibold text-zinc-200 truncate max-w-[200px]" title={note.title}>
            {note.title.endsWith('.html') || note.title.endsWith('.htm') ? note.title : `${note.title}.html`}
          </span>
          {note.folder && note.folder !== 'Início' && (
            <span className="text-[11px] text-zinc-500 truncate hidden sm:inline">
              em {note.folder}
            </span>
          )}
        </div>

        {/* Center: View Switcher */}
        <div className="flex items-center bg-[#1c1c24] border border-[#2e2e38] rounded-lg p-0.5 shadow-inner">
          <button
            type="button"
            onClick={() => setViewMode('preview')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-all font-medium ${
              viewMode === 'preview'
                ? 'bg-[#2a2a36] text-white shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
            title="Visualização Renderizada"
          >
            <Eye className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Visualizar</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('split')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-all font-medium ${
              viewMode === 'split'
                ? 'bg-[#2a2a36] text-white shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
            title="Modo Dividido (Código + Visualização)"
          >
            <Columns className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Dividido</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('code')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-all font-medium ${
              viewMode === 'code'
                ? 'bg-[#2a2a36] text-white shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
            title="Editor de Código-Fonte"
          >
            <Code className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Código</span>
          </button>
        </div>

        {/* Right: Viewport & Utility Actions */}
        <div className="flex items-center gap-1.5">
          {/* Viewport size controls (visible when preview is shown) */}
          {viewMode !== 'code' && (
            <div className="flex items-center bg-[#1c1c24] border border-[#2e2e38] rounded-md p-0.5 mr-1 hidden lg:flex">
              <button
                type="button"
                onClick={() => setViewport('desktop')}
                className={`p-1 rounded transition-colors ${viewport === 'desktop' ? 'bg-[#2a2a36] text-amber-400' : 'text-zinc-400 hover:text-zinc-200'}`}
                title="Largura Desktop (100%)"
              >
                <Monitor className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setViewport('tablet')}
                className={`p-1 rounded transition-colors ${viewport === 'tablet' ? 'bg-[#2a2a36] text-amber-400' : 'text-zinc-400 hover:text-zinc-200'}`}
                title="Largura Tablet (768px)"
              >
                <Tablet className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setViewport('mobile')}
                className={`p-1 rounded transition-colors ${viewport === 'mobile' ? 'bg-[#2a2a36] text-amber-400' : 'text-zinc-400 hover:text-zinc-200'}`}
                title="Largura Mobile (375px)"
              >
                <Smartphone className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Toggle Word Wrap (when code is shown) */}
          {viewMode !== 'preview' && (
            <button
              type="button"
              onClick={() => setWordWrap(!wordWrap)}
              className={`p-1.5 rounded-md border border-[#2e2e38] transition-colors ${wordWrap ? 'bg-[#1e1e28] text-amber-400' : 'bg-[#14141a] text-zinc-400 hover:text-zinc-200'}`}
              title={wordWrap ? 'Quebra de linha ativa' : 'Quebra de linha desativada'}
            >
              <WrapText className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Refresh Preview */}
          {viewMode !== 'code' && (
            <button
              type="button"
              onClick={() => setRefreshKey(k => k + 1)}
              className="p-1.5 rounded-md bg-[#14141a] border border-[#2e2e38] text-zinc-400 hover:text-zinc-200 transition-colors"
              title="Recarregar Visualização"
            >
              <RotateCw className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Copy HTML */}
          <button
            type="button"
            onClick={handleCopyCode}
            className="flex items-center gap-1 px-2 py-1 rounded-md bg-[#14141a] border border-[#2e2e38] text-zinc-300 hover:text-white transition-colors"
            title="Copiar Código HTML"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-[11px] text-emerald-400">Copiado</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span className="hidden xl:inline text-[11px]">Copiar</span>
              </>
            )}
          </button>

          {/* Open in external browser */}
          <button
            type="button"
            onClick={handleOpenExternal}
            className="p-1.5 rounded-md bg-[#14141a] border border-[#2e2e38] text-zinc-400 hover:text-zinc-200 transition-colors"
            title="Abrir no Navegador Externo"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* Main Workspace Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Code Editor Pane */}
        {viewMode !== 'preview' && (
          <div className={`flex flex-col h-full bg-[#101015] border-r border-[#22222a] overflow-hidden select-text ${viewMode === 'split' ? 'w-1/2' : 'w-full'}`}>
            <div className="flex items-center justify-between px-3 py-1 bg-[#14141a] border-b border-[#22222a] text-[11px] text-zinc-400 font-mono">
              <span>Código-Fonte HTML</span>
              <span>{lineCount} linhas</span>
            </div>

            <div className="relative flex-1 flex overflow-hidden font-mono text-[13px] leading-[21px]">
              {/* Line Numbers Gutter */}
              <div
                ref={lineNumbersRef}
                className="w-12 py-3 bg-[#0d0d12] text-zinc-600 select-none text-right pr-3 overflow-hidden border-r border-[#1e1e26] font-mono shrink-0"
              >
                {lineNumbers.map(line => (
                  <div key={line} className="h-[21px]">{line}</div>
                ))}
              </div>

              {/* Textarea Code Input */}
              <textarea
                ref={textareaRef}
                value={content}
                onChange={e => handleContentChange(e.target.value)}
                onBlur={handleBlur}
                onKeyDown={handleKeyDown}
                onScroll={handleScroll}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                wrap={wordWrap ? 'soft' : 'off'}
                className="flex-1 h-full p-3 bg-transparent text-zinc-200 outline-none resize-none font-mono text-[13px] leading-[21px] tab-[2] selection:bg-amber-500/20"
                placeholder="<!-- Digite ou cole seu código HTML aqui... -->"
              />
            </div>
          </div>
        )}

        {/* Live Preview Pane */}
        {viewMode !== 'code' && (
          <div className={`flex flex-col h-full bg-[#09090c] overflow-hidden ${viewMode === 'split' ? 'w-1/2' : 'w-full'}`}>
            <div className="flex items-center justify-between px-3 py-1 bg-[#14141a] border-b border-[#22222a] text-[11px] text-zinc-400">
              <span className="flex items-center gap-1.5 font-medium">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Renderização ao Vivo
              </span>
              <span className="text-zinc-500 font-mono">
                {viewport === 'desktop' ? 'Desktop 100%' : viewport === 'tablet' ? 'Tablet (768px)' : 'Mobile (375px)'}
              </span>
            </div>

            <div className="flex-1 flex items-center justify-center p-2 sm:p-4 overflow-auto bg-[#070709]">
              <div
                className={`h-full transition-all duration-200 shadow-2xl rounded-lg overflow-hidden border border-[#2b2b36] bg-white ${viewportWidthClass} ${viewport !== 'desktop' ? 'my-auto shadow-black/80' : 'w-full'}`}
              >
                <iframe
                  key={refreshKey}
                  srcDoc={content}
                  title="HTML Preview"
                  sandbox="allow-scripts allow-modals allow-same-origin allow-forms allow-popups"
                  className="w-full h-full border-none bg-white"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Status / AI Hint bar */}
      <footer className="flex items-center justify-between px-3 py-1 border-t border-[#1f1f28] bg-[#0f0f14] text-[11px] text-zinc-500 shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles className="w-3 h-3 text-amber-400" />
          <span>Peça ao <strong>Assistente IA</strong> para alterar o código, adicionar seções, estilizar ou criar interatividade.</span>
        </div>
        <div className="font-mono text-[10px]">
          {content.length} caracteres
        </div>
      </footer>
    </div>
  )
}
