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
import { VaultSwitcherModal } from './components/VaultSwitcherModal'

const MAX_TABS = 8

const DEFAULT_SETTINGS: AppSettings = {
  accentColor: '#c59b27', // Pyrita: Ouro Queimado
  fontSize: 'medium',
  editorWidth: 'standard'
}

export const App: React.FC = () => {
  const [notes, setNotes] = useState<Note[]>(() => loadNotes())
  const [folders, setFolders] = useState<string[]>(() => loadFolders())
  const [currentNoteId, setCurrentNoteId] = useState<string>(() => notes[0]?.id || '')
  const [currentView, setCurrentView] = useState<ViewMode>('editor')
  const [editorDisplayMode, setEditorDisplayMode] = useState<EditorDisplayMode>('live')
  const [vaultPath, setVaultPath] = useState<string | null>(() => {
    return typeof localStorage !== 'undefined' ? localStorage.getItem('pyrite_electron_vault_path') : null
  })

  // Electron Local Vault Auto-initialization (Phase 2)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.electronAPI?.isElectron) return
    const api = window.electronAPI

    const initLocalVault = async () => {
      try {
        let currentPath = localStorage.getItem('pyrite_electron_vault_path')
        if (!currentPath) {
          currentPath = await api.getDefaultPath()
          localStorage.setItem('pyrite_electron_vault_path', currentPath)
        }
        setVaultPath(currentPath)

        const files = await api.readVault(currentPath)
        if (files.length > 0) {
          const loadedNotes: Note[] = files.map((f, i) => ({
            id: `note_disk_${i}_${Date.now()}`,
            title: f.title,
            folder: f.folder,
            content: f.content,
            filePath: f.filePath,
            tags: extractTags(f.content),
            createdAt: f.createdAt,
            updatedAt: f.updatedAt
          }))
          const loadedFolders = Array.from(new Set(loadedNotes.map(n => n.folder).filter(Boolean)))
          setNotes(loadedNotes)
          setFolders(loadedFolders)
          saveNotes(loadedNotes)
          saveFolders(loadedFolders)
          if (loadedNotes[0]) {
            setCurrentNoteId(loadedNotes[0].id)
            setTabs([{ id: `tab_${loadedNotes[0].id}`, noteId: loadedNotes[0].id, title: loadedNotes[0].title }])
            setActiveTabId(`tab_${loadedNotes[0].id}`)
          }
        } else {
          // Clean empty vault: do not create unwanted notes or folders
          setNotes([])
          setFolders([])
          saveNotes([])
          saveFolders([])
          setCurrentNoteId('')
          setTabs([])
          setActiveTabId('')
        }
      } catch (err) {
        console.error('Error initializing Electron vault:', err)
      }
    }

    initLocalVault()
  }, [])

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
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(false)
  const [isAiOpen, setIsAiOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false)
  const [isVaultSwitcherOpen, setIsVaultSwitcherOpen] = useState(false)

  // Current active note object
  const currentNote = notes.find(n => n.id === currentNoteId) || notes[0]

  // Persist Settings and apply dynamic accent color CSS variable
  const applyAccentColor = (accent: AppSettings['accentColor']) => {
    const legacyMap: Record<string, string> = {
      amber: '#c59b27',
      violet: '#8b5cf6',
      emerald: '#10b981',
      cyan: '#06b6d4',
      rose: '#ec4899'
    }
    const hex = legacyMap[accent] || accent || '#c59b27'
    document.documentElement.style.setProperty('--accent', hex)

    let r = 197, g = 155, b = 39
    if (hex.startsWith('#') && hex.length === 7) {
      r = parseInt(hex.slice(1, 3), 16)
      g = parseInt(hex.slice(3, 5), 16)
      b = parseInt(hex.slice(5, 7), 16)
    }
    document.documentElement.style.setProperty('--accent-glow', `rgba(${r}, ${g}, ${b}, 0.22)`)
    document.documentElement.style.setProperty('--accent-glow-subtle', `rgba(${r}, ${g}, ${b}, 0.12)`)
  }

  const handleUpdateSettings = (newSettings: AppSettings) => {
    setSettings(newSettings)
    localStorage.setItem('pyrite_app_settings', JSON.stringify(newSettings))
    applyAccentColor(newSettings.accentColor)
  }

  // Ensure accent is applied on initial mount
  useEffect(() => {
    applyAccentColor(settings.accentColor)
  }, [settings.accentColor])

  // Global Keyboard Shortcuts (Ctrl+P, Ctrl+O, Ctrl+G, Ctrl+N)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Shift+O -> Alternar/Gerenciar Cofres (Obsidian Vault Switcher)
      if ((e.ctrlKey || e.metaKey) && (e.key === 'o' || e.key === 'O') && e.shiftKey) {
        e.preventDefault()
        setIsVaultSwitcherOpen(prev => !prev)
        return
      }
      // Ctrl+P or Ctrl+O (without shift) -> Command Palette
      if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P' || (!e.shiftKey && (e.key === 'o' || e.key === 'O')))) {
        e.preventDefault()
        setIsCommandPaletteOpen(prev => !prev)
      }
      // Ctrl+G -> Open/Toggle Graph Tab
      if ((e.ctrlKey || e.metaKey) && (e.key === 'g' || e.key === 'G')) {
        e.preventDefault()
        handleChangeView(currentView === 'graph' ? 'editor' : 'graph')
      }
      // Ctrl+N -> New Note
      if ((e.ctrlKey || e.metaKey) && (e.key === 'n' || e.key === 'N') && !e.shiftKey) {
        e.preventDefault()
        handleCreateNote()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [notes, currentView])

  // Open view mode and create/activate a persistent tab for Graph or Canvas
  const handleChangeView = (view: ViewMode) => {
    setCurrentView(view)

    if (view === 'graph') {
      setTabs(prev => {
        const existing = prev.find(t => t.noteId === '__graph__')
        if (existing) {
          setActiveTabId(existing.id)
          return prev
        }
        const graphTab: TabItem = {
          id: 'tab_graph',
          noteId: '__graph__',
          title: 'Grafo'
        }
        setActiveTabId(graphTab.id)
        return [...prev, graphTab]
      })
      return
    }

    if (view === 'canvas') {
      setTabs(prev => {
        const existing = prev.find(t => t.noteId === '__canvas__')
        if (existing) {
          setActiveTabId(existing.id)
          return prev
        }
        const canvasTab: TabItem = {
          id: 'tab_canvas',
          noteId: '__canvas__',
          title: 'Canvas'
        }
        setActiveTabId(canvasTab.id)
        return [...prev, canvasTab]
      })
      return
    }

    // Switching back to editor: activate current note's tab
    const noteTab = tabs.find(t => t.noteId === currentNoteId)
    if (noteTab) {
      setActiveTabId(noteTab.id)
    } else if (currentNoteId) {
      handleSelectNote(currentNoteId)
    }
  }

  // Select note and ensure tab exists (preserves Graph/Canvas tabs!)
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

      // If exceeding MAX_TABS, evict the oldest regular note tab (never evict Graph or Canvas tabs!)
      if (prev.length >= MAX_TABS) {
        const firstNoteIdx = prev.findIndex(t => t.noteId !== '__graph__' && t.noteId !== '__canvas__')
        if (firstNoteIdx !== -1) {
          const next = [...prev]
          next.splice(firstNoteIdx, 1)
          return [...next, newTab]
        }
      }
      return [...prev, newTab]
    })
  }

  // Tab management
  const handleSelectTab = (tabId: string) => {
    setActiveTabId(tabId)
    const tab = tabs.find(t => t.id === tabId)
    if (!tab) return

    if (tab.noteId === '__graph__') {
      setCurrentView('graph')
    } else if (tab.noteId === '__canvas__') {
      setCurrentView('canvas')
    } else {
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
      if (nextTab.noteId === '__graph__') {
        setCurrentView('graph')
      } else if (nextTab.noteId === '__canvas__') {
        setCurrentView('canvas')
      } else {
        setCurrentNoteId(nextTab.noteId)
        setCurrentView('editor')
      }
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

    // Electron disk persistence
    if (window.electronAPI?.isElectron && vaultPath) {
      window.electronAPI.saveFile({
        vaultPath,
        folder: targetFolder,
        title: newNote.title,
        content: newNote.content
      }).then(res => {
        if (res.success && res.filePath) {
          newNote.filePath = res.filePath
        }
      })
    }
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

    // Electron disk persistence
    if (window.electronAPI?.isElectron && vaultPath) {
      window.electronAPI.saveFile({
        vaultPath,
        folder: 'Diário',
        title: dailyNote.title,
        content: dailyNote.content
      }).then(res => {
        if (res.success && res.filePath) {
          dailyNote.filePath = res.filePath
        }
      })
    }
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

      // Electron disk folder creation
      if (window.electronAPI?.isElectron && vaultPath) {
        window.electronAPI.createFolder({ vaultPath, folderPath: fullFolderPath })
      }
    }
  }

  const handleDeleteNote = (noteId: string) => {
    const noteToDelete = notes.find(n => n.id === noteId)
    const updated = notes.filter(n => n.id !== noteId)
    setNotes(updated)
    saveNotes(updated)
    setTabs(t => t.filter(item => item.noteId !== noteId))

    // Electron disk deletion (moves to Windows trash/recycle bin)
    if (window.electronAPI?.isElectron && noteToDelete?.filePath) {
      window.electronAPI.deleteFile(noteToDelete.filePath)
    }

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

    // Electron disk persistence on note edits
    if (window.electronAPI?.isElectron && vaultPath) {
      window.electronAPI.saveFile({
        vaultPath,
        folder: finalNote.folder || 'Início',
        title: finalNote.title,
        content: finalNote.content
      }).then(res => {
        if (res.success && res.filePath) {
          finalNote.filePath = res.filePath
        }
      })
    }

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

  const handleInsertSnippet = (snippet: string) => {
    if (!currentNote) return
    const appendedContent = currentNote.content ? `${currentNote.content.trimEnd()}\n\n${snippet}\n` : snippet
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

  // Open / Switch Local Vault Folder (Native dialog in Electron, File System Access API in Web)
  const handleOpenLocalFolder = async () => {
    // If running in native Electron app:
    if (window.electronAPI?.isElectron) {
      try {
        const selected = await window.electronAPI.selectFolder()
        if (selected) {
          localStorage.setItem('pyrite_electron_vault_path', selected)
          setVaultPath(selected)
          const files = await window.electronAPI.readVault(selected)
          if (files.length > 0) {
            const loadedNotes: Note[] = files.map((f, i) => ({
              id: `note_disk_${i}_${Date.now()}`,
              title: f.title,
              folder: f.folder,
              content: f.content,
              filePath: f.filePath,
              tags: extractTags(f.content),
              createdAt: f.createdAt,
              updatedAt: f.updatedAt
            }))
            const loadedFolders = Array.from(new Set(loadedNotes.map(n => n.folder).filter(Boolean)))
            setNotes(loadedNotes)
            setFolders(loadedFolders.length > 0 ? loadedFolders : ['Início'])
            saveNotes(loadedNotes)
            if (loadedNotes[0]) {
              handleSelectNote(loadedNotes[0].id)
            }
            alert(`Cofre carregado com sucesso!\n${loadedNotes.length} notas carregadas de:\n${selected}`)
          } else {
            alert(`Pasta selecionada como cofre ativo:\n${selected}\n(Nenhuma nota .md encontrada ainda nesta pasta)`)
          }
        }
      } catch (err) {
        console.error('Error selecting folder in Electron:', err)
      }
      return
    }

    // Web fallback: File System Access API
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

  // Switch to an existing or newly created vault by absolute path
  const handleSwitchVault = async (targetPath: string) => {
    try {
      localStorage.setItem('pyrite_electron_vault_path', targetPath)
      setVaultPath(targetPath)

      if (window.electronAPI?.isElectron) {
        const files = await window.electronAPI.readVault(targetPath)
        if (files.length > 0) {
          const loadedNotes: Note[] = files.map((f, i) => ({
            id: `note_disk_${i}_${Date.now()}`,
            title: f.title,
            folder: f.folder,
            content: f.content,
            filePath: f.filePath,
            tags: extractTags(f.content),
            createdAt: f.createdAt,
            updatedAt: f.updatedAt
          }))
          const loadedFolders = Array.from(new Set(loadedNotes.map(n => n.folder).filter(Boolean)))
          setNotes(loadedNotes)
          setFolders(loadedFolders)
          saveNotes(loadedNotes)
          saveFolders(loadedFolders)
          if (loadedNotes[0]) {
            setCurrentNoteId(loadedNotes[0].id)
            setTabs([{ id: `tab_${loadedNotes[0].id}`, noteId: loadedNotes[0].id, title: loadedNotes[0].title }])
            setActiveTabId(`tab_${loadedNotes[0].id}`)
          }
        } else {
          setNotes([])
          setFolders([])
          saveNotes([])
          saveFolders([])
          setCurrentNoteId('')
          setTabs([])
          setActiveTabId('')
        }
      }
    } catch (err) {
      console.error('Error switching vault in Electron:', err)
    }
  }

  // Open active vault folder in Windows Explorer
  const handleOpenInExplorer = () => {
    if (window.electronAPI?.isElectron && vaultPath) {
      window.electronAPI.openInExplorer(vaultPath)
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
          onChangeView={handleChangeView}
          isLeftSidebarOpen={isLeftSidebarOpen}
          onToggleLeftSidebar={() => setIsLeftSidebarOpen(o => !o)}
          onOpenDailyNote={handleOpenDailyNote}
          onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
          isAiOpen={isAiOpen}
          onToggleAi={() => setIsAiOpen(o => !o)}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenVaultSwitcher={() => setIsVaultSwitcherOpen(true)}
        />

        {/* Left Sidebar (Hierarchical Subfolders & Notes Tree) */}
        <Sidebar
          notes={notes}
          folders={folders}
          currentNoteId={currentNoteId}
          vaultPath={vaultPath}
          onSelectNote={handleSelectNote}
          onCreateNote={handleCreateNote}
          onCreateFolder={handleCreateFolder}
          onDeleteNote={handleDeleteNote}
          onToggleFavorite={handleToggleFavorite}
          onOpenDailyNote={handleOpenDailyNote}
          onOpenLocalFolder={handleOpenLocalFolder}
          onOpenInExplorer={handleOpenInExplorer}
          onOpenVaultSwitcher={() => setIsVaultSwitcherOpen(true)}
          isOpen={isLeftSidebarOpen}
        />

        {/* AI Agent Panel - Opens beside main sidebar, to the left of the content (like reference image) */}
        {isAiOpen && (
          <AiAssistant
            currentNote={currentNote}
            allNotes={notes}
            onConnectNote={handleConnectNote}
            onAddTag={handleAddTag}
            onInsertSnippet={handleInsertSnippet}
            onClose={() => setIsAiOpen(false)}
          />
        )}

        {/* Central View Area with Workspace Tab Header */}
        <main className="flex-1 h-full overflow-hidden relative bg-[#0f0f12] flex flex-col">
          {/* Obsidian Tab Header - Stays across full top of central section */}
          <TabHeader
            tabs={tabs}
            activeTabId={activeTabId}
            onSelectTab={handleSelectTab}
            onCloseTab={handleCloseTab}
            onNewTab={() => handleCreateNote()}
            currentView={currentView}
            displayMode={editorDisplayMode}
            onChangeDisplayMode={setEditorDisplayMode}
            onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
            onOpenSettings={() => setIsSettingsOpen(true)}
            onExportVault={handleExportVault}
          />

          {/* Page area below Header: Contains Editor/Graph/Canvas and the RightSidebar (Sumário) */}
          <div className="flex-1 flex overflow-hidden relative">
            <div className="flex-1 overflow-hidden relative">
              {currentView === 'editor' && currentNote && (
                <Editor
                  note={currentNote}
                  allNotes={notes}
                  displayMode={editorDisplayMode}
                  onUpdateNote={handleUpdateNote}
                  onNavigate={handleNavigate}
                  settings={settings}
                  isRightSidebarOpen={isRightSidebarOpen}
                  onToggleRightSidebar={() => setIsRightSidebarOpen(o => !o)}
                />
              )}

              {(currentView === 'graph' || tabs.some(t => t.noteId === '__graph__')) && (
                <div className={currentView === 'graph' ? 'w-full h-full' : 'hidden'}>
                  <GraphView
                    notes={notes}
                    currentNoteId={currentNoteId}
                    onSelectNote={handleSelectNote}
                  />
                </div>
              )}

              {currentView === 'canvas' && (
                <CanvasView
                  notes={notes}
                  onOpenNote={handleSelectNote}
                />
              )}
            </div>

            {/* Right Sidebar (Backlinks, Outline, Tags) - Height limited to page below header */}
            <RightSidebar
              currentNote={currentNote}
              allNotes={notes}
              onSelectNote={handleSelectNote}
              isOpen={isRightSidebarOpen}
            />
          </div>
        </main>
      </div>

      {/* 3. Bottom Status Bar */}
      <StatusBar
        currentNote={currentNote}
        allNotes={notes}
        onOpenGraph={() => handleChangeView('graph')}
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
        onChangeViewMode={handleChangeView}
        onOpenAi={() => setIsAiOpen(true)}
        onOpenLocalFolder={handleOpenLocalFolder}
        onOpenVaultSwitcher={() => setIsVaultSwitcherOpen(true)}
      />

      {/* 6. Vault Switcher Modal (Obsidian-Style) */}
      <VaultSwitcherModal
        isOpen={isVaultSwitcherOpen}
        currentVaultPath={vaultPath || undefined}
        onClose={() => setIsVaultSwitcherOpen(false)}
        onSelectVault={handleSwitchVault}
      />
    </div>
  )
}

export default App
