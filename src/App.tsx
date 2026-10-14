import React, { useState, useEffect } from 'react'
import type { Note, ViewMode, EditorDisplayMode } from './types'
import {
  loadNotes,
  saveNotes,
  loadFolders,
  saveFolders,
  extractTags
} from './utils/vault'
import { Header } from './components/Header'
import { Sidebar } from './components/Sidebar'
import { RightSidebar } from './components/RightSidebar'
import { Editor } from './components/Editor'
import { GraphView } from './components/GraphView'
import { CanvasView } from './components/CanvasView'
import { CommandPalette } from './components/CommandPalette'
import { AiAssistant } from './components/AiAssistant'

export const App: React.FC = () => {
  const [notes, setNotes] = useState<Note[]>(() => loadNotes())
  const [folders, setFolders] = useState<string[]>(() => loadFolders())
  const [currentNoteId, setCurrentNoteId] = useState<string>(() => notes[0]?.id || '')
  const [currentView, setCurrentView] = useState<ViewMode>('editor')
  const [editorDisplayMode, setEditorDisplayMode] = useState<EditorDisplayMode>('split')

  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(true)
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(true)
  const [isAiOpen, setIsAiOpen] = useState(false)
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false)

  // Current active note object
  const currentNote = notes.find(n => n.id === currentNoteId) || notes[0]

  // Global Keyboard Shortcuts
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
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Note actions
  const handleSelectNote = (noteId: string) => {
    setCurrentNoteId(noteId)
    setCurrentView('editor')
  }

  const handleNavigate = (title: string) => {
    const found = notes.find(n => n.title.toLowerCase().trim() === title.toLowerCase().trim())
    if (found) {
      setCurrentNoteId(found.id)
      setCurrentView('editor')
    } else {
      // Create new note with this title if it doesn't exist
      const newNote: Note = {
        id: `note_${Date.now()}`,
        title: title.trim(),
        content: `# ${title.trim()}\n\nCriada via link bidirecional a partir de [[${currentNote?.title || 'Vault'}]].\n`,
        folder: currentNote?.folder || 'Início',
        tags: [],
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
      const updatedNotes = [...notes, newNote]
      setNotes(updatedNotes)
      saveNotes(updatedNotes)
      setCurrentNoteId(newNote.id)
      setCurrentView('editor')
    }
  }

  const handleCreateNote = (folder?: string, initialTitle?: string) => {
    const targetFolder = folder || currentNote?.folder || 'Início'
    const title = initialTitle || `Nota ${notes.length + 1}`
    const newNote: Note = {
      id: `note_${Date.now()}`,
      title,
      content: `# ${title}\n\nEscreva sua nota aqui... Conecte com [[${currentNote?.title || 'Bem-vindo ao Pyrite'}]].\n`,
      folder: targetFolder,
      tags: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    const updated = [newNote, ...notes]
    setNotes(updated)
    saveNotes(updated)
    setCurrentNoteId(newNote.id)
    setCurrentView('editor')
  }

  const handleCreateFolder = (name: string) => {
    if (!folders.includes(name)) {
      const updated = [...folders, name]
      setFolders(updated)
      saveFolders(updated)
    }
  }

  const handleDeleteNote = (noteId: string) => {
    const updated = notes.filter(n => n.id !== noteId)
    setNotes(updated)
    saveNotes(updated)
    if (currentNoteId === noteId) {
      setCurrentNoteId(updated[0]?.id || '')
    }
  }

  const handleUpdateNote = (updatedNote: Note) => {
    // Automatically re-extract tags from content
    const extracted = extractTags(updatedNote.content)
    const combinedTags = Array.from(new Set([...updatedNote.tags, ...extracted]))
    const finalNote = { ...updatedNote, tags: combinedTags }

    const updated = notes.map(n => n.id === finalNote.id ? finalNote : n)
    setNotes(updated)
    saveNotes(updated)
  }

  // AI Assistant Connect & Tag Helpers
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

  // File System Access API: Open Local Folder from PC as Vault
  const handleOpenLocalFolder = async () => {
    if (!('showDirectoryPicker' in window)) {
      alert('A API File System Access é suportada no Chrome, Edge e navegadores baseados em Chromium. Você pode exportar ou importar seu vault em JSON.')
      return
    }

    try {
      // @ts-ignore
      const dirHandle = await window.showDirectoryPicker()
      const importedNotes: Note[] = []
      const importedFolders: string[] = []

      // @ts-ignore
      for await (const entry of dirHandle.values()) {
        if (entry.kind === 'file' && entry.name.endsWith('.md')) {
          const file = await entry.getFile()
          const text = await file.text()
          const title = entry.name.replace(/\.md$/, '')
          importedNotes.push({
            id: `local_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            title,
            content: text,
            folder: 'Local',
            tags: extractTags(text),
            createdAt: file.lastModified,
            updatedAt: file.lastModified
          })
        }
      }

      if (importedNotes.length > 0) {
        if (!folders.includes('Local')) {
          importedFolders.push('Local')
        }
        const mergedNotes = [...importedNotes, ...notes]
        const mergedFolders = [...folders, ...importedFolders]
        setNotes(mergedNotes)
        setFolders(mergedFolders)
        saveNotes(mergedNotes)
        saveFolders(mergedFolders)
        setCurrentNoteId(importedNotes[0].id)
        alert(`Sucesso! ${importedNotes.length} notas carregadas da pasta "${dirHandle.name}".`)
      } else {
        alert(`Nenhum arquivo .md encontrado na pasta selecionada.`)
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('Error opening folder:', err)
        alert('Não foi possível ler a pasta selecionada.')
      }
    }
  }

  // Export Vault as JSON file
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
    <div className="flex flex-col w-screen h-screen bg-zinc-950 text-zinc-100 overflow-hidden font-sans">
      {/* Top Header */}
      <Header
        currentView={currentView}
        onChangeView={setCurrentView}
        isLeftSidebarOpen={isLeftSidebarOpen}
        onToggleLeftSidebar={() => setIsLeftSidebarOpen(o => !o)}
        isRightSidebarOpen={isRightSidebarOpen}
        onToggleRightSidebar={() => setIsRightSidebarOpen(o => !o)}
        isAiOpen={isAiOpen}
        onToggleAi={() => setIsAiOpen(o => !o)}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        onExportVault={handleExportVault}
        noteCount={notes.length}
      />

      {/* Main Workspace Layout */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Left Sidebar (File Explorer) */}
        <Sidebar
          notes={notes}
          folders={folders}
          currentNoteId={currentNoteId}
          onSelectNote={handleSelectNote}
          onCreateNote={handleCreateNote}
          onCreateFolder={handleCreateFolder}
          onDeleteNote={handleDeleteNote}
          onOpenLocalFolder={handleOpenLocalFolder}
          isOpen={isLeftSidebarOpen}
        />

        {/* Central View Area */}
        <main className="flex-1 h-full overflow-hidden relative bg-zinc-950 flex flex-col">
          {currentView === 'editor' && currentNote && (
            <Editor
              note={currentNote}
              allNotes={notes}
              displayMode={editorDisplayMode}
              onChangeDisplayMode={setEditorDisplayMode}
              onUpdateNote={handleUpdateNote}
              onNavigate={handleNavigate}
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

      {/* Command Palette / Quick Switcher Modal */}
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
