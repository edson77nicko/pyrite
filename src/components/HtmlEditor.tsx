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
  Sparkles,
  ChevronDown
} from 'lucide-react'

interface HtmlEditorProps {
  note: Note
  onUpdateNote: (note: Note) => void
  themeMode?: 'dark' | 'light'
}

type ViewMode = 'preview' | 'split' | 'code'
export type DevicePreset = 'desktop' | 'iphone-16' | 'galaxy-s24' | 'iphone-se' | 'tablet'

interface DeviceConfig {
  id: DevicePreset
  name: string
  shortName: string
  width: number
  height: number
  isMobile: boolean
  hasIsland?: boolean
}

const DEVICE_CONFIGS: Record<DevicePreset, DeviceConfig> = {
  desktop: {
    id: 'desktop',
    name: 'Desktop (100% Fluido)',
    shortName: 'Desktop',
    width: 0,
    height: 0,
    isMobile: false
  },
  'iphone-16': {
    id: 'iphone-16',
    name: 'iPhone 16 Pro (402 × 874 px)',
    shortName: 'iPhone 16 Pro',
    width: 402,
    height: 874,
    isMobile: true,
    hasIsland: true
  },
  'galaxy-s24': {
    id: 'galaxy-s24',
    name: 'Samsung Galaxy S24 (412 × 915 px)',
    shortName: 'Galaxy S24',
    width: 412,
    height: 915,
    isMobile: true
  },
  'iphone-se': {
    id: 'iphone-se',
    name: 'iPhone SE (375 × 667 px)',
    shortName: 'iPhone SE',
    width: 375,
    height: 667,
    isMobile: true
  },
  tablet: {
    id: 'tablet',
    name: 'iPad Mini / Tablet (768 × 1024 px)',
    shortName: 'iPad Mini',
    width: 768,
    height: 1024,
    isMobile: false
  }
}

export const HtmlEditor: React.FC<HtmlEditorProps> = ({ note, onUpdateNote, themeMode }) => {
  const isLight = themeMode === 'light'
  const [content, setContent] = useState(note.content)

  // Persist View Mode ('preview' | 'split' | 'code')
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    try {
      const saved = localStorage.getItem('pyrite_html_view_mode') || localStorage.getItem('pyrita_html_view_mode')
      if (saved === 'preview' || saved === 'split' || saved === 'code') {
        return saved
      }
    } catch (_) {}
    return 'preview'
  })

  // Persist Device Preset
  const [device, setDevice] = useState<DevicePreset>(() => {
    try {
      const saved = localStorage.getItem('pyrite_html_device_preset') || localStorage.getItem('pyrita_html_device_preset')
      if (saved && saved in DEVICE_CONFIGS) {
        return saved as DevicePreset
      }
    } catch (_) {}
    return 'desktop'
  })

  // Persist Resizable Split View State
  const [splitRatio, setSplitRatio] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('pyrite_html_split_ratio') || localStorage.getItem('pyrita_html_split_ratio')
      if (saved) {
        const parsed = parseFloat(saved)
        if (!isNaN(parsed) && parsed >= 15 && parsed <= 85) {
          return parsed
        }
      }
    } catch (_) {}
    return 50
  })

  // Persist Word Wrap
  const [wordWrap, setWordWrap] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('pyrite_html_word_wrap') || localStorage.getItem('pyrita_html_word_wrap')
      if (saved !== null) return saved === 'true'
    } catch (_) {}
    return true
  })

  const [isDeviceMenuOpen, setIsDeviceMenuOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  // Save states to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('pyrite_html_view_mode', viewMode)
    } catch (_) {}
  }, [viewMode])

  useEffect(() => {
    try {
      localStorage.setItem('pyrite_html_device_preset', device)
    } catch (_) {}
  }, [device])

  useEffect(() => {
    try {
      localStorage.setItem('pyrite_html_split_ratio', splitRatio.toString())
    } catch (_) {}
  }, [splitRatio])

  useEffect(() => {
    try {
      localStorage.setItem('pyrite_html_word_wrap', String(wordWrap))
    } catch (_) {}
  }, [wordWrap])

  // Injected theme scrollbar style into iframe preview
  const renderedContent = React.useMemo(() => {
    const scrollbarCss = `<style id="pyrite-theme-scrollbars">
  :root {
    color-scheme: ${isLight ? 'light' : 'dark'};
  }
  ::-webkit-scrollbar {
    width: 7px;
    height: 7px;
  }
  ::-webkit-scrollbar-track {
    background: transparent;
  }
  ::-webkit-scrollbar-thumb {
    background: ${isLight ? '#cbd5e1' : '#3f3f46'};
    border-radius: 9999px;
  }
  ::-webkit-scrollbar-thumb:hover {
    background: ${isLight ? '#94a3b8' : '#52525b'};
  }
  * {
    scrollbar-width: thin;
    scrollbar-color: ${isLight ? '#cbd5e1 transparent' : '#3f3f46 transparent'};
  }
</style>`
    if (!content) return scrollbarCss
    if (/<\/head>/i.test(content)) {
      return content.replace(/<\/head>/i, `${scrollbarCss}</head>`)
    }
    if (/<body/i.test(content)) {
      return content.replace(/<body/i, `${scrollbarCss}<body`)
    }
    return scrollbarCss + content
  }, [content, isLight])
  const [isDraggingSplit, setIsDraggingSplit] = useState(false)
  const splitContainerRef = useRef<HTMLDivElement>(null)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const lineNumbersRef = useRef<HTMLDivElement>(null)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const deviceMenuRef = useRef<HTMLDivElement>(null)

  // Close device menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (deviceMenuRef.current && !deviceMenuRef.current.contains(e.target as Node)) {
        setIsDeviceMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Sync when note.content changes externally (e.g., via AI Chat <<<REPLACE_NOTE>>>)
  useEffect(() => {
    if (note.content !== content) {
      setContent(note.content)
      setRefreshKey(k => k + 1)
    }
  }, [note.content])

  // Dragging split ratio logic
  useEffect(() => {
    if (!isDraggingSplit) return

    const handleMouseMove = (e: MouseEvent) => {
      const container = splitContainerRef.current
      if (!container) return
      const rect = container.getBoundingClientRect()
      const newRatio = ((e.clientX - rect.left) / rect.width) * 100
      const clamped = Math.min(Math.max(newRatio, 15), 85)
      setSplitRatio(clamped)
    }

    const handleMouseUp = () => {
      setIsDraggingSplit(false)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDraggingSplit])

  const handleSplitMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsDraggingSplit(true)
  }

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

  const activeDeviceConfig = DEVICE_CONFIGS[device]

  return (
    <div
      className={`flex flex-col h-full w-full overflow-hidden select-none transition-colors ${
        isLight ? 'bg-zinc-100 text-zinc-800' : 'bg-[#0d0d11] text-[#e4e4e7]'
      }`}
    >
      {/* Top Header / Toolbar */}
      <header
        className={`flex items-center justify-between px-4 py-2 border-b shrink-0 text-xs transition-colors ${
          isLight ? 'bg-white border-zinc-200' : 'bg-[#121217] border-[#27272a]'
        }`}
      >
        {/* Left: File Badge & Title */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20 font-mono font-semibold">
            <CodeXml className="w-3.5 h-3.5" />
            <span>HTML5</span>
          </div>
          <span className="font-semibold truncate max-w-[200px]" title={note.title}>
            {note.title.endsWith('.html') || note.title.endsWith('.htm') ? note.title : `${note.title}.html`}
          </span>
          {note.folder && note.folder !== 'Início' && (
            <span className={`text-[11px] truncate hidden sm:inline ${isLight ? 'text-zinc-500' : 'text-zinc-500'}`}>
              em {note.folder}
            </span>
          )}
        </div>

        {/* Center: View Switcher */}
        <div
          className={`flex items-center rounded-lg p-0.5 shadow-inner border transition-colors ${
            isLight ? 'bg-zinc-100 border-zinc-200' : 'bg-[#1c1c24] border-[#2e2e38]'
          }`}
        >
          <button
            type="button"
            onClick={() => setViewMode('preview')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-all font-medium cursor-pointer ${
              viewMode === 'preview'
                ? isLight
                  ? 'bg-white text-zinc-900 shadow-xs border border-zinc-200/80 font-semibold'
                  : 'bg-[#2a2a36] text-white shadow-sm'
                : isLight
                ? 'text-zinc-600 hover:text-zinc-900'
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
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-all font-medium cursor-pointer ${
              viewMode === 'split'
                ? isLight
                  ? 'bg-white text-zinc-900 shadow-xs border border-zinc-200/80 font-semibold'
                  : 'bg-[#2a2a36] text-white shadow-sm'
                : isLight
                ? 'text-zinc-600 hover:text-zinc-900'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
            title="Modo Dividido (Código + Visualização com Redimensionamento)"
          >
            <Columns className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Dividido</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('code')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-all font-medium cursor-pointer ${
              viewMode === 'code'
                ? isLight
                  ? 'bg-white text-zinc-900 shadow-xs border border-zinc-200/80 font-semibold'
                  : 'bg-[#2a2a36] text-white shadow-sm'
                : isLight
                ? 'text-zinc-600 hover:text-zinc-900'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
            title="Editor de Código-Fonte"
          >
            <Code className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Código</span>
          </button>
        </div>

        {/* Right: Device Selection & Utility Actions */}
        <div className="flex items-center gap-1.5">
          {/* Device Selector Dropdown (visible when preview is shown) */}
          {viewMode !== 'code' && (
            <div className="relative" ref={deviceMenuRef}>
              <button
                type="button"
                onClick={() => setIsDeviceMenuOpen(prev => !prev)}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-md border font-medium transition-colors cursor-pointer ${
                  isLight
                    ? 'bg-zinc-50 border-zinc-200 text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900'
                    : 'bg-[#1c1c24] border-[#2e2e38] text-zinc-300 hover:text-white'
                }`}
                title="Escolher dispositivo de visualização"
              >
                {activeDeviceConfig.id === 'desktop' ? (
                  <Monitor className="w-3.5 h-3.5 text-amber-500" />
                ) : activeDeviceConfig.id === 'tablet' ? (
                  <Tablet className="w-3.5 h-3.5 text-purple-400" />
                ) : (
                  <Smartphone className="w-3.5 h-3.5 text-emerald-400" />
                )}
                <span className="text-[11px] hidden sm:inline">{activeDeviceConfig.shortName}</span>
                <ChevronDown className="w-3 h-3 opacity-60" />
              </button>

              {isDeviceMenuOpen && (
                <div
                  className={`absolute right-0 top-full mt-1.5 z-50 w-64 rounded-xl border p-1 shadow-2xl text-xs space-y-0.5 animate-in fade-in zoom-in-95 duration-100 ${
                    isLight
                      ? 'bg-white border-zinc-200 text-zinc-800'
                      : 'bg-[#181b22] border-zinc-700/80 text-zinc-200'
                  }`}
                >
                  <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                    Dispositivos Móveis & Telas
                  </div>
                  {Object.values(DEVICE_CONFIGS).map(cfg => (
                    <button
                      key={cfg.id}
                      type="button"
                      onClick={() => {
                        setDevice(cfg.id)
                        setIsDeviceMenuOpen(false)
                      }}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left transition-colors cursor-pointer ${
                        device === cfg.id
                          ? isLight
                            ? 'bg-amber-500/15 text-amber-700 font-semibold'
                            : 'bg-amber-500/15 text-amber-300 font-semibold'
                          : isLight
                          ? 'hover:bg-zinc-100 text-zinc-700'
                          : 'hover:bg-zinc-800 text-zinc-300'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {cfg.id === 'desktop' ? (
                          <Monitor className="w-3.5 h-3.5 text-amber-500" />
                        ) : cfg.id === 'tablet' ? (
                          <Tablet className="w-3.5 h-3.5 text-purple-400" />
                        ) : (
                          <Smartphone className="w-3.5 h-3.5 text-emerald-400" />
                        )}
                        <span>{cfg.name}</span>
                      </div>
                      {device === cfg.id && <Check className="w-3.5 h-3.5 shrink-0 text-amber-500" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Toggle Word Wrap (when code is shown) */}
          {viewMode !== 'preview' && (
            <button
              type="button"
              onClick={() => setWordWrap(!wordWrap)}
              className={`p-1.5 rounded-md border transition-colors cursor-pointer ${
                wordWrap
                  ? isLight
                    ? 'bg-amber-500/10 text-amber-600 border-amber-500/30'
                    : 'bg-[#1e1e28] text-amber-400 border-amber-500/30'
                  : isLight
                  ? 'bg-zinc-50 border-zinc-200 text-zinc-500 hover:text-zinc-900'
                  : 'bg-[#14141a] border-[#2e2e38] text-zinc-400 hover:text-zinc-200'
              }`}
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
              className={`p-1.5 rounded-md border transition-colors cursor-pointer ${
                isLight
                  ? 'bg-zinc-50 border-zinc-200 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100'
                  : 'bg-[#14141a] border-[#2e2e38] text-zinc-400 hover:text-zinc-200'
              }`}
              title="Recarregar Visualização"
            >
              <RotateCw className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Copy HTML */}
          <button
            type="button"
            onClick={handleCopyCode}
            className={`flex items-center gap-1 px-2 py-1 rounded-md border transition-colors cursor-pointer ${
              isLight
                ? 'bg-zinc-50 border-zinc-200 text-zinc-700 hover:text-zinc-900 hover:bg-zinc-100'
                : 'bg-[#14141a] border-[#2e2e38] text-zinc-300 hover:text-white'
            }`}
            title="Copiar Código HTML"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-[11px] text-emerald-500">Copiado</span>
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
            className={`p-1.5 rounded-md border transition-colors cursor-pointer ${
              isLight
                ? 'bg-zinc-50 border-zinc-200 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100'
                : 'bg-[#14141a] border-[#2e2e38] text-zinc-400 hover:text-zinc-200'
            }`}
            title="Abrir no Navegador Externo"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* Main Workspace Area with Resizable Split Support */}
      <div ref={splitContainerRef} className="flex-1 flex overflow-hidden relative">
        {/* Code Editor Pane */}
        {viewMode !== 'preview' && (
          <div
            style={viewMode === 'split' ? { width: `${splitRatio}%` } : { width: '100%' }}
            className={`flex flex-col h-full overflow-hidden select-text border-r transition-colors ${
              isLight ? 'bg-white border-zinc-200' : 'bg-[#101015] border-[#22222a]'
            }`}
          >
            <div
              className={`flex items-center justify-between px-3 py-1 border-b text-[11px] font-mono shrink-0 ${
                isLight ? 'bg-zinc-50 border-zinc-200 text-zinc-500' : 'bg-[#14141a] border-[#22222a] text-zinc-400'
              }`}
            >
              <span>Código-Fonte HTML</span>
              <span>{lineCount} linhas</span>
            </div>

            <div className="relative flex-1 flex overflow-hidden font-mono text-[13px] leading-[21px]">
              {/* Line Numbers Gutter */}
              <div
                ref={lineNumbersRef}
                className={`w-12 py-3 select-none text-right pr-3 overflow-hidden border-r font-mono shrink-0 transition-colors ${
                  isLight
                    ? 'bg-zinc-50 text-zinc-400 border-zinc-200'
                    : 'bg-[#0d0d12] text-zinc-600 border-[#1e1e26]'
                }`}
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
                className={`flex-1 h-full p-3 bg-transparent outline-none resize-none font-mono text-[13px] leading-[21px] tab-[2] ${
                  isLight
                    ? 'text-zinc-900 placeholder-zinc-400 selection:bg-amber-500/30'
                    : 'text-zinc-200 placeholder-zinc-600 selection:bg-amber-500/20'
                }`}
                placeholder="<!-- Digite ou cole seu código HTML aqui... -->"
              />
            </div>
          </div>
        )}

        {/* Resizable Divider Bar (in Split Mode) */}
        {viewMode === 'split' && (
          <div
            onMouseDown={handleSplitMouseDown}
            onDoubleClick={() => setSplitRatio(50)}
            title="Arraste para redimensionar (duplo clique para 50%)"
            className={`w-2 h-full cursor-col-resize flex items-center justify-center relative z-20 group transition-colors select-none ${
              isDraggingSplit
                ? 'bg-[var(--accent,#f97316)]'
                : isLight
                ? 'bg-zinc-200 hover:bg-[var(--accent,#f97316)]'
                : 'bg-[#181822] hover:bg-[var(--accent,#f97316)]'
            }`}
          >
            <div className="w-0.5 h-8 rounded-full bg-zinc-400/60 group-hover:bg-white" />
          </div>
        )}

        {/* Live Preview Pane */}
        {viewMode !== 'code' && (
          <div
            style={viewMode === 'split' ? { width: `${100 - splitRatio}%` } : { width: '100%' }}
            className={`flex flex-col h-full overflow-hidden relative ${
              isLight ? 'bg-zinc-200/60' : 'bg-[#09090c]'
            }`}
          >
            {/* Sub-bar: Renderização ao Vivo - shown only in split mode */}
            {viewMode === 'split' && (
              <div
                className={`flex items-center justify-between px-3 py-1 border-b text-[11px] shrink-0 ${
                  isLight ? 'bg-zinc-50 border-zinc-200 text-zinc-600' : 'bg-[#14141a] border-[#22222a] text-zinc-400'
                }`}
              >
                <span className="flex items-center gap-1.5 font-medium">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  Renderização ao Vivo
                </span>
                <span className="text-[11px] font-mono opacity-80">
                  {activeDeviceConfig.name}
                </span>
              </div>
            )}

            {/* Container with Scroll and Device Frame */}
            <div
              className={`flex-1 flex items-center justify-center relative ${
                viewMode === 'preview' && activeDeviceConfig.id === 'desktop'
                  ? 'p-0 m-0 w-full h-full overflow-hidden'
                  : 'p-2 sm:p-6 overflow-auto'
              }`}
            >
              {/* Invisible overlay during divider drag to prevent iframe from intercepting mouse */}
              {isDraggingSplit && (
                <div className="absolute inset-0 z-50 cursor-col-resize" />
              )}

              {activeDeviceConfig.id === 'desktop' ? (
                // Full Desktop View (edge-to-edge in preview mode)
                <div
                  className={`w-full h-full overflow-hidden bg-white ${
                    viewMode === 'preview'
                      ? 'border-0 rounded-none shadow-none m-0 p-0'
                      : isLight
                      ? 'shadow-2xl rounded-lg border border-zinc-300 shadow-zinc-300/50'
                      : 'shadow-2xl rounded-lg border border-[#2b2b36] shadow-black/80'
                  }`}
                >
                  <iframe
                    key={refreshKey}
                    srcDoc={renderedContent}
                    title="HTML Preview Desktop"
                    sandbox="allow-scripts allow-modals allow-same-origin allow-forms allow-popups"
                    className="w-full h-full border-0 rounded-none m-0 p-0 block bg-white"
                  />
                </div>
              ) : (
                // Realistic Smartphone / Tablet Frame Mockup
                <div
                  style={{
                    width: `${activeDeviceConfig.width}px`,
                    maxWidth: '100%',
                    height: `${activeDeviceConfig.height}px`,
                    maxHeight: '100%'
                  }}
                  className={`flex flex-col shrink-0 my-auto shadow-2xl transition-all duration-200 relative ${
                    activeDeviceConfig.isMobile
                      ? 'rounded-[44px] border-[10px] border-[#1c1d22] ring-1 ring-zinc-700/60 shadow-black/90'
                      : 'rounded-[28px] border-[8px] border-[#24252c] ring-1 ring-zinc-700/60 shadow-black/80'
                  } bg-black overflow-hidden`}
                >
                  {/* Dynamic Island / Notch for iPhone 16 Pro */}
                  {activeDeviceConfig.hasIsland && (
                    <div className="absolute top-2.5 left-1/2 -translate-x-1/2 w-28 h-5 bg-black rounded-full z-30 pointer-events-none flex items-center justify-between px-2">
                      <div className="w-2 h-2 rounded-full bg-[#111] border border-zinc-800" />
                      <div className="w-2 h-2 rounded-full bg-emerald-500/80 animate-pulse" />
                    </div>
                  )}

                  {/* Top Speaker Line for other mobile devices */}
                  {activeDeviceConfig.isMobile && !activeDeviceConfig.hasIsland && (
                    <div className="absolute top-2 left-1/2 -translate-x-1/2 w-16 h-1 bg-zinc-700 rounded-full z-30 pointer-events-none" />
                  )}

                  {/* Iframe Viewport */}
                  <div className="flex-1 w-full h-full overflow-hidden bg-white">
                    <iframe
                      key={refreshKey}
                      srcDoc={renderedContent}
                      title={`HTML Preview ${activeDeviceConfig.shortName}`}
                      sandbox="allow-scripts allow-modals allow-same-origin allow-forms allow-popups"
                      className="w-full h-full border-none bg-white"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Bottom Status / AI Hint bar - Hidden in preview mode so content takes 100% of the area */}
      {viewMode !== 'preview' && (
        <footer
          className={`flex items-center justify-between px-3 py-1 border-t shrink-0 text-[11px] transition-colors ${
            isLight ? 'bg-white border-zinc-200 text-zinc-600' : 'bg-[#0f0f14] border-[#1f1f28] text-zinc-500'
          }`}
        >
          <div className="flex items-center gap-2">
            <Sparkles className="w-3 h-3 text-amber-500" />
            <span>Peça ao <strong>Assistente IA</strong> para alterar o código, adicionar seções, estilizar ou criar interatividade.</span>
          </div>
          <div className="flex items-center gap-3 font-mono text-[10px]">
            {viewMode === 'split' && (
              <span className="opacity-70">Divisão: {Math.round(splitRatio)}% / {Math.round(100 - splitRatio)}%</span>
            )}
            <span>{content.length} caracteres</span>
          </div>
        </footer>
      )}
    </div>
  )
}
