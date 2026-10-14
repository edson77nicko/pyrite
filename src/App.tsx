import React, { useState, useEffect } from 'react'
import type { Note, ViewMode, EditorDisplayMode, TabItem, AppSettings } from './types'
import {
  loadNotes,
  saveNotes,
  loadFolders,
  saveFolders,
  extractTags
} from './utils/vault'
import { Ribbon } from './components/Ribbon'
import { TabHeader } from './components/TabHeader'
import { Sidebar } from './components/Sidebar'
import { RightSidebar } from './components/RightSidebar'
import { Editor } from './components/Editor'
import { GraphView } from './components/GraphView'
import { CanvasView } from './components/CanvasView'
import { CommandPalette } from './components/CommandPalette'
import { AiAssistant } from './components/AiAssistant'
import { StatusBar } from './components/StatusBar'
import { SettingsModal } from './components/SettingsModal'

const MAX_TABS = 5

const DEFAULT_SETTINGS: AppSettings = {
  accentColor: 'violet',
  fontSize: 'medium',
  editorWidth: 'standard'
}

export const App: React.FC = () => {
  const [notes, setNotes] = useState<Note[]>(() => loadNotes())
  const [folders, setFolders] = useState<string[]>(() => loadFolders())
  const [currentNoteId, setCurrentNoteId] = useState<string>(() => notes[0]?.id || '')
  const [currentView, setCurrentView] = useState<ViewMode>('editor')
  const [editorDisplayMode, setEditorDisplayMode] = useState<EditorDisplayMode>('live')

  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const saved = localStorage.getItem('pyrite_app_settings')
      return saved ? JSON.parse(saved) : DEFAULT_SETTINGS
    } catch {
      return DEFAULT_SETTINGS
    }
  })

  // Multi-tabs state
  const [tabs, setTabs] = useState<TabItem[]>(() => {
    const initialNote = notes[0]
    return initialNote
      ? [{ id: `tab_${initialNote.id}`, noteId: initialNote.id, title: initialNote.title }]
      : []
  })
  const [activeTabId, setActiveTabId] = useState<string>(() => tabs[0]?.id || '')

  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(true)
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(true)
  const [isAiOpen, setIsAiOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false)

  // Current active note object
  const currentNote = notes.find(n => n.id === currentNoteId) || notes[0]

  // Persist Settings and apply dynamic accent color CSS variable
  const handleUpdateSettings = (newSettings: AppSettings) => {
    setSettings(newSettings)
    localStorage.setItem('pyrite_app_settings', JSON.stringify(newSettings))

    const colorMap = {
      violet: '#8b5cf6',
      emerald: '#10b981',
      cyan: '#06b6d4',
      amber: '#f59e0b',
      rose: '#ec4899'
    }
    document.documentElement.style.setProperty('--accent', colorMap[newSettings.accentColor] || '#8b5cf6')
  }

  // Global Keyboard Shortcuts (Ctrl+P, Ctrl+O, Ctrl+G, Ctrl+N)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+P or Ctrl+O -> Command Palette
      if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P' || e.key === 'o' || e.key === 'O')) {
        e.preventDefault()
        setIsCommandPaletteOpen(prev => !prev)
      }
      // Ctrl+G -> Toggle Graph View
      if ((e.ctrlKey || e.metaKey) && (e.key === 'g' || e.key === 'G')) {
        e.preventDefault()
        setCurrentView(prev => prev === 'graph' ? 'editor' : 'graph')
      }
      // Ctrl+N -> New Note
      if ((e.ctrlKey || e.metaKey) && (e.key === 'n' || e.key === 'N') && !e.shiftKey) {
        e.preventDefault()
        handleCreateNote()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [notes])

  // Select note and ensure tab exists (Max 5 tabs, replaces oldest)
  const handleSelectNote = (noteId: string) => {
    setCurrentNoteId(noteId)
    setCurrentView('editor')

    const targetNote = notes.find(n => n.id === noteId)
    if (!targetNote) return

    setTabs(prev => {
      const existingTab = prev.find(t => t.noteId === noteId)
      if (existingTab) {
        setActiveTabId(existingTab.id)
        return prev
      }
      const newTab: TabItem = {
        id: `tab_${noteId}_${Date.now()}`,
        noteId,
        title: targetNote.title
      }
      setActiveTabId(newTab.id)

      // Strict limit: at most 5 tabs. When opening a 6th, replace the oldest tab (FIFO).
      if (prev.length >= MAX_TABS) {
        const trimmed = prev.slice(prev.length - (MAX_TABS - 1))
        return [...trimmed, newTab]
      }
      return [...prev, newTab]
    })
  }

  // Tab management
  const handleSelectTab = (tabId: string) => {
    setActiveTabId(tabId)
    const tab = tabs.find(t => t.id === tabId)
    if (tab) {
      setCurrentNoteId(tab.noteId)
      setCurrentView('editor')
    }
  }

  const handleCloseTab = (tabId: string) => {
    const remaining = tabs.filter(t => t.id !== tabId)
    setTabs(remaining)
    if (activeTabId === tabId && remaining.length > 0) {
      const nextTab = remaining[remaining.length - 1]
      setActiveTabId(nextTab.id)
      setCurrentNoteId(nextTab.noteId)
    }
  }

  const handleNavigate = (title: string) => {
    const found = notes.find(n => n.title.toLowerCase().trim() === title.toLowerCase().trim())
    if (found) {
      handleSelectNote(found.id)
    } else {
      // Create new note with this title if it doesn't exist
      const newNote: Note = {
        id: `note_${Date.now()}`,
        title: title.trim(),
        content: `Criada via link bidirecional a partir de [[${currentNote?.title || 'Vault'}]].\n`,
        folder: currentNote?.folder || 'Início',
        tags: [],
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
      const updatedNotes = [...notes, newNote]
      setNotes(updatedNotes)
      saveNotes(updatedNotes)
      handleSelectNote(newNote.id)
    }
  }

  const handleCreateNote = (folder?: string, initialTitle?: string) => {
    const targetFolder = folder || currentNote?.folder || 'Início'
    const title = initialTitle || `Nota ${notes.length + 1}`
    const newNote: Note = {
      id: `note_${Date.now()}`,
      title,
      content: `Escreva sua nota aqui... Conecte com [[${currentNote?.title || 'Bem-vindo ao Pyrite'}]].\n`,
      folder: targetFolder,
      tags: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    const updated = [newNote, ...notes]
    setNotes(updated)
    saveNotes(updated)
    handleSelectNote(newNote.id)
  }

  // Open or Create Today's Daily Note
  const handleOpenDailyNote = () => {
    const today = new Date().toLocaleDateString('pt-BR')
    const dailyTitle = `Diário - ${today}`

    const existing = notes.find(n => n.title === dailyTitle)
    if (existing) {
      handleSelectNote(existing.id)
      return
    }

    if (!folders.includes('Diário')) {
      const newFolders = [...folders, 'Diário']
      setFolders(newFolders)
      saveFolders(newFolders)
    }

    const dailyNote: Note = {
      id: `note_daily_${Date.now()}`,
      title: dailyTitle,
      content: `## Metas de Hoje\n- [ ] Definir prioridades do dia\n- [ ] Registrar novas ideias no [[Grafos de Conhecimento]]\n\n## Pensamentos & Notas\n\n`,
      folder: 'Diário',
      tags: ['diário', 'produtividade'],
      createdAt: Date.now(),
      updatedAt: Date.now()
    }

    const updated = [dailyNote, ...notes]
    setNotes(updated)
    saveNotes(updated)
    handleSelectNote(dailyNote.id)
  }

  const handleToggleFavorite = (noteId: string) => {
    const updated = notes.map(n => n.id === noteId ? { ...n, isFavorite: !n.isFavorite } : n)
    setNotes(updated)
    saveNotes(updated)
  }

  const handleCreateFolder = (fullFolderPath: string) => {
    if (!folders.includes(fullFolderPath)) {
      const updated = [...folders, fullFolderPath]
      setFolders(updated)
      saveFolders(updated)
    }
  }

  const handleDeleteNote = (noteId: string) => {
    const updated = notes.filter(n => n.id !== noteId)
    setNotes(updated)
    saveNotes(updated)
    setTabs(t => t.filter(item => item.noteId !== noteId))
    if (currentNoteId === noteId) {
      setCurrentNoteId(updated[0]?.id || '')
    }
  }

  const handleUpdateNote = (updatedNote: Note) => {
    const extracted = extractTags(updatedNote.content)
    const combinedTags = Array.from(new Set([...updatedNote.tags, ...extracted]))
    const finalNote = { ...updatedNote, tags: combinedTags }

    const updated = notes.map(n => n.id === finalNote.id ? finalNote : n)
    setNotes(updated)
    saveNotes(updated)

    setTabs(prev => prev.map(t => t.noteId === finalNote.id ? { ...t, title: finalNote.title } : t))
  }

  // AI Assistant helpers
  const handleConnectNote = (targetTitle: string) => {
    if (!currentNote) return
    const appendedContent = `${currentNote.content}\n\n- Conexão sugerida: [[${targetTitle}]]`
    handleUpdateNote({ ...currentNote, content: appendedContent })
  }

  const handleAddTag = (tag: string) => {
    if (!currentNote) return
    const appendedContent = `${currentNote.content} #${tag}`
    handleUpdateNote({ ...currentNote, content: appendedContent })
  }

  // Recursive Directory Scanner (reads folder and all subfolders deeply!)
  const scanDirectoryRecursive = async (
    dirHandle: any,
    currentPath = ''
  ): Promise<{ notes: Note[]; folders: string[] }> => {
    const collectedNotes: Note[] = []
    const collectedFolders: string[] = []

    for await (const entry of dirHandle.values()) {
      if (entry.kind === 'file' && entry.name.endsWith('.md')) {
        const file = await entry.getFile()
        const text = await file.text()
        const title = entry.name.replace(/\.md$/, '')
        collectedNotes.push({
          id: `local_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          title,
          content: text,
          folder: currentPath || dirHandle.name,
          tags: extractTags(text),
          createdAt: file.lastModified,
          updatedAt: file.lastModified
        })
      } else if (entry.kind === 'directory') {
        // Skip hidden and build folders
        if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') {
          continue
        }

        const nextPath = currentPath ? `${currentPath}/${entry.name}` : entry.name
        collectedFolders.push(nextPath)

        const sub = await scanDirectoryRecursive(entry, nextPath)
        collectedNotes.push(...sub.notes)
        collectedFolders.push(...sub.folders)
      }
    }

    return { notes: collectedNotes, folders: collectedFolders }
  }

  // File System Access API: Deep Recursive Import
  const handleOpenLocalFolder = async () => {
    if (!('showDirectoryPicker' in window)) {
      alert('A API File System Access é suportada no Chrome, Edge e Chromium. Você pode exportar ou importar seu vault em JSON.')
      return
    }

    try {
      // @ts-ignore
      const rootDirHandle = await window.showDirectoryPicker()
      const { notes: importedNotes, folders: importedFolders } = await scanDirectoryRecursive(rootDirHandle, rootDirHandle.name)

      if (importedNotes.length > 0) {
        const uniqueFolders = Array.from(new Set([...folders, rootDirHandle.name, ...importedFolders]))
        const mergedNotes = [...importedNotes, ...notes]

        setNotes(mergedNotes)
        setFolders(uniqueFolders)
        saveNotes(mergedNotes)
        saveFolders(uniqueFolders)
        handleSelectNote(importedNotes[0].id)
        alert(`Sucesso! Importadas ${importedNotes.length} notas organizadas em ${importedFolders.length + 1} pastas e subpastas de "${rootDirHandle.name}".`)
      } else {
        alert(`Nenhum arquivo Markdown (.md) encontrado na pasta "${rootDirHandle.name}" e suas subpastas.`)
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('Error opening folder:', err)
        alert('Não foi possível ler a pasta selecionada.')
      }
    }
  }

  // Export Vault as JSON
  const handleExportVault = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(notes, null, 2))
    const downloadAnchor = document.createElement('a')
    downloadAnchor.setAttribute('href', dataStr)
    downloadAnchor.setAttribute('download', `pyrite-vault-backup-${new Date().toISOString().slice(0, 10)}.json`)
    document.body.appendChild(downloadAnchor)
    downloadAnchor.click()
    downloadAnchor.remove()
  }

  return (
    <div className="flex flex-col w-screen h-screen bg-[#0f0f12] text-zinc-100 overflow-hidden font-sans">
      {/* 1. Main Workspace Layout */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Leftmost Ribbon Bar (Icon-only navigation like Obsidian) */}
        <Ribbon
          currentView={currentView}
          onChangeView={setCurrentView}
          isLeftSidebarOpen={isLeftSidebarOpen}
          onToggleLeftSidebar={() => setIsLeftSidebarOpen(o => !o)}
          onOpenDailyNote={handleOpenDailyNote}
          onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
          isAiOpen={isAiOpen}
          onToggleAi={() => setIsAiOpen(o => !o)}
          onOpenSettings={() => setIsSettingsOpen(true)}
        />

        {/* Left Sidebar (Hierarchical Subfolders & Notes Tree) */}
        <Sidebar
          notes={notes}
          folders={folders}
          currentNoteId={currentNoteId}
          onSelectNote={handleSelectNote}
          onCreateNote={handleCreateNote}
          onCreateFolder={handleCreateFolder}
          onDeleteNote={handleDeleteNote}
          onToggleFavorite={handleToggleFavorite}
          onOpenDailyNote={handleOpenDailyNote}
          onOpenLocalFolder={handleOpenLocalFolder}
          isOpen={isLeftSidebarOpen}
        />

        {/* Central View Area with Workspace Tab Header */}
        <main className="flex-1 h-full overflow-hidden relative bg-[#0f0f12] flex flex-col">
          {/* Obsidian Tab Header with right-side actions & max 5 tabs */}
          <TabHeader
            tabs={tabs}
            activeTabId={activeTabId}
            onSelectTab={handleSelectTab}
            onCloseTab={handleCloseTab}
            onNewTab={() => handleCreateNote()}
            currentView={currentView}
            displayMode={editorDisplayMode}
            onChangeDisplayMode={setEditorDisplayMode}
            isAiOpen={isAiOpen}
            onToggleAi={() => setIsAiOpen(o => !o)}
            isRightSidebarOpen={isRightSidebarOpen}
            onToggleRightSidebar={() => setIsRightSidebarOpen(o => !o)}
            onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
            onOpenSettings={() => setIsSettingsOpen(true)}
            onExportVault={handleExportVault}
          />

          <div className="flex-1 overflow-hidden relative">
            {currentView === 'editor' && currentNote && (
              <Editor
                note={currentNote}
                allNotes={notes}
                displayMode={editorDisplayMode}
                onUpdateNote={handleUpdateNote}
                onNavigate={handleNavigate}
                settings={settings}
              />
            )}

            {currentView === 'graph' && (
              <GraphView
                notes={notes}
                currentNoteId={currentNoteId}
                onSelectNote={handleSelectNote}
              />
            )}

            {currentView === 'canvas' && (
              <CanvasView
                notes={notes}
                onOpenNote={handleSelectNote}
              />
            )}
          </div>
        </main>

        {/* Right Sidebar (Backlinks, Outline, Tags) */}
        <RightSidebar
          currentNote={currentNote}
          allNotes={notes}
          onSelectNote={handleSelectNote}
          onOpenAi={() => setIsAiOpen(true)}
          isOpen={isRightSidebarOpen}
        />

        {/* AI Copilot Panel */}
        {isAiOpen && currentNote && (
          <AiAssistant
            currentNote={currentNote}
            allNotes={notes}
            onConnectNote={handleConnectNote}
            onAddTag={handleAddTag}
            onClose={() => setIsAiOpen(false)}
          />
        )}
      </div>

      {/* 3. Bottom Status Bar */}
      <StatusBar
        currentNote={currentNote}
        allNotes={notes}
        onOpenGraph={() => setCurrentView('graph')}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
      />

      {/* 4. Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onUpdateSettings={handleUpdateSettings}
      />

      {/* 5. Command Palette / Quick Switcher Modal */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        notes={notes}
        onSelectNote={handleSelectNote}
        onCreateNote={handleCreateNote}
        onChangeViewMode={setCurrentView}
        onOpenAi={() => setIsAiOpen(true)}
        onOpenLocalFolder={handleOpenLocalFolder}
      />
    </div>
  )
}

export default App
