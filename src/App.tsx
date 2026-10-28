import type { SidebarAction } from './components/SidebarMenu'
import React, { useState, useEffect } from 'react'
import type { Note, NoteType, ViewMode, EditorDisplayMode, TabItem, AppSettings, TaskItem, TaskSettings, TaskBoard } from './types'
import {
  loadNotes,
  saveNotes,
  loadFolders,
  saveFolders,
  extractTags
} from './utils/vault'
import { createEmptyDrawDocument, isDrawContent, serializeDrawDocument } from './utils/drawUtils'
import { createEmptyMindMapDocument, isMindMapContent, parseMindMapDocument, serializeMindMapDocument } from './utils/mindMapUtils'
import { loadTasks, saveTasks, loadTaskSettings, saveTaskSettings, DEFAULT_BOARDS } from './utils/taskStorage'
import { Ribbon } from './components/Ribbon'
import { TabHeader } from './components/TabHeader'
import { Sidebar } from './components/Sidebar'
import { RightSidebar } from './components/RightSidebar'
import { Editor } from './components/Editor'
import { DrawEditor } from './components/DrawEditor'
import { MindMapEditor, mindMapViewportCache } from './components/MindMapEditor'
import { HtmlEditor } from './components/HtmlEditor'
import { GraphView } from './components/GraphView'
import { CanvasView } from './components/CanvasView'
import { TasksView } from './components/TasksView'
import { CommandPalette } from './components/CommandPalette'
import { AiAssistant } from './components/AiAssistant'
import { StatusBar } from './components/StatusBar'
import { SettingsModal } from './components/SettingsModal'
import { VaultSwitcherModal } from './components/VaultSwitcherModal'
import { FileText, Plus } from 'lucide-react'

const MAX_TABS = 8

const DEFAULT_SETTINGS: AppSettings = {
  accentColor: '#c59b27', // Pyrita: Ouro Queimado
  accentColorDark: '#c59b27',
  accentColorLight: '#c59b27',
  fontSize: 'medium',
  fontFamily: 'sans',
  editorWidth: 'standard',
  themeMode: 'dark'
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

  const handleRefreshVault = async (targetPath?: string, keepSelection = true) => {
    if (typeof window === 'undefined' || !window.electronAPI?.isElectron) return
    const api = window.electronAPI
    const currentPath = targetPath || vaultPath || localStorage.getItem('pyrite_electron_vault_path')
    if (!currentPath) return

    try {
      const files = await api.readVault(currentPath)
      if (files.length > 0) {
        setNotes(prevNotes => {
          const existingMap = new Map(prevNotes.map(n => [n.filePath || `${n.folder}/${n.title}`, n]))
          const loadedNotes: Note[] = files.map((f, i) => {
            const key = f.filePath || `${f.folder}/${f.title}`
            const existing = existingMap.get(key)
            return {
              id: existing ? existing.id : `note_disk_${i}_${Date.now()}`,
              title: f.title,
              folder: f.folder,
              content: f.content,
              filePath: f.filePath,
              tags: extractTags(f.content),
              type: (isMindMapContent(f.content) || f.filePath?.endsWith('.mindmap.json') || f.filePath?.endsWith('.mindmap.md'))
                ? 'mindmap'
                : (isDrawContent(f.content) || f.filePath?.endsWith('.draw.json') || f.filePath?.endsWith('.draw.md'))
                ? 'draw'
                : (f.filePath?.endsWith('.html') || f.filePath?.endsWith('.htm'))
                ? 'html'
                : 'note',
              createdAt: f.createdAt,
              updatedAt: f.updatedAt,
              isFavorite: existing?.isFavorite
            }
          })
          const loadedFolders = Array.from(new Set(loadedNotes.map(n => n.folder).filter(Boolean)))
          setFolders(loadedFolders)
          saveNotes(loadedNotes)
          saveFolders(loadedFolders)
          if (!keepSelection && loadedNotes[0]) {
            setCurrentNoteId(loadedNotes[0].id)
            setTabs([{ id: `tab_${loadedNotes[0].id}`, noteId: loadedNotes[0].id, title: loadedNotes[0].title, type: loadedNotes[0].type }])
            setActiveTabId(`tab_${loadedNotes[0].id}`)
          }
          return loadedNotes
        })
        setTasks(loadTasks(currentPath))
        setTaskSettings(loadTaskSettings(currentPath))
      } else {
        setNotes([])
        setFolders([])
        saveNotes([])
        saveFolders([])
      }
    } catch (err) {
      console.error('Error refreshing vault:', err)
    }
  }

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
        await handleRefreshVault(currentPath, false)
      } catch (err) {
        console.error('Error initializing Electron vault:', err)
      }
    }

    initLocalVault()

    // File change listener (fs.watch in main process)
    const unlistenWatch = api.onVaultChanged?.(() => {
      handleRefreshVault(undefined, true)
    })

    // Window focus listener (when switching from Windows Explorer / Browser back to Pyrita)
    const handleFocus = () => {
      handleRefreshVault(undefined, true)
    }
    window.addEventListener('focus', handleFocus)

    return () => {
      unlistenWatch?.()
      window.removeEventListener('focus', handleFocus)
    }
  }, [])

  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const saved = localStorage.getItem('pyrite_app_settings')
      if (saved) {
        const parsed = JSON.parse(saved)
        // Sanitizar e remover qualquer cor azul salva
        const blueTones = ['blue', 'sky', '#3b82f6', '#0ea5e9', '#0284c7', '#2563eb', '#009dea', '#0004ff']
        if (parsed.accentColorDark && blueTones.includes(String(parsed.accentColorDark).toLowerCase())) parsed.accentColorDark = '#c59b27'
        if (parsed.accentColorLight && blueTones.includes(String(parsed.accentColorLight).toLowerCase())) parsed.accentColorLight = '#c59b27'
        if (blueTones.includes(String(parsed.accentColor).toLowerCase())) {
          parsed.accentColor = '#c59b27'
        }
        if (!parsed.accentColorDark) parsed.accentColorDark = parsed.accentColor || '#c59b27'
        if (!parsed.accentColorLight) parsed.accentColorLight = parsed.accentColor || '#c59b27'
        if (!parsed.fontFamily) parsed.fontFamily = 'sans'
        localStorage.setItem('pyrite_app_settings', JSON.stringify(parsed))
        return parsed
      }
      return DEFAULT_SETTINGS
    } catch {
      return DEFAULT_SETTINGS
    }
  })

  // Multi-tabs state
  const [tabs, setTabs] = useState<TabItem[]>(() => {
    const initialNote = notes[0]
    return initialNote
      ? [{ id: `tab_${initialNote.id}`, noteId: initialNote.id, title: initialNote.title, type: initialNote.type }]
      : []
  })
  const [activeTabId, setActiveTabId] = useState<string>(() => tabs[0]?.id || '')

  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(true)
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(false)
  const [isAiOpen, setIsAiOpen] = useState(false)
  const [isAiConversationsOpen, setIsAiConversationsOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false)
  const [isVaultSwitcherOpen, setIsVaultSwitcherOpen] = useState(false)

  // Workspace Tasks State
  const [tasks, setTasks] = useState<TaskItem[]>(() => loadTasks(vaultPath || 'default'))
  const [taskSettings, setTaskSettings] = useState<TaskSettings>(() => loadTaskSettings(vaultPath || 'default'))
  const [activeBoardId, setActiveBoardId] = useState<string>('default')
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)

  const taskBoards = taskSettings.boards && taskSettings.boards.length > 0 ? taskSettings.boards : DEFAULT_BOARDS

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
    let hex = legacyMap[accent] || accent || '#c59b27'
    const blueTones = ['blue', 'sky', '#3b82f6', '#0ea5e9', '#0284c7', '#2563eb', '#009dea', '#0004ff']
    if (blueTones.includes(hex.toLowerCase())) {
      hex = '#c59b27'
    }
    document.documentElement.style.setProperty('--accent', hex)

    let r = 197, g = 155, b = 39
    if (hex.startsWith('#') && hex.length === 7) {
      r = parseInt(hex.slice(1, 3), 16)
      g = parseInt(hex.slice(3, 5), 16)
      b = parseInt(hex.slice(5, 7), 16)
    }

    // Convert to HSL for precise derived light-mode shades
    const rn = r / 255
    const gn = g / 255
    const bn = b / 255
    const max = Math.max(rn, gn, bn)
    const min = Math.min(rn, gn, bn)
    const diff = max - min

    let h = 0
    if (diff > 0) {
      if (max === rn) h = ((gn - bn) / diff) % 6
      else if (max === gn) h = (bn - rn) / diff + 2
      else h = (rn - gn) / diff + 4
      h = Math.round(h * 60)
      if (h < 0) h += 360
    }
    const l = (max + min) / 2
    const s = diff === 0 ? 0 : diff / (1 - Math.abs(2 * l - 1))

    // 1. Preenchimento suave (8-12%, set at 9% as required: "Cor do usuário a 8–12%")
    const subtleBg = `rgba(${r}, ${g}, ${b}, 0.09)`
    const subtleHover = `rgba(${r}, ${g}, ${b}, 0.14)`
    const glow = `rgba(${r}, ${g}, ${b}, 0.20)`

    // 2. Ícone / Texto para modo claro: contraste equilibrado sobre branco (#FFFFFF) sem tom berrante
    const textLightL = Math.min(l, 0.36)
    const textLightS = Math.min(Math.max(s, 0.60), 0.85)
    const accentTextLight = `hsl(${h}, ${Math.round(textLightS * 100)}%, ${Math.round(textLightL * 100)}%)`

    const iconLightL = Math.min(l, 0.40)
    const iconLightS = Math.min(Math.max(s, 0.65), 0.85)
    const accentIconLight = `hsl(${h}, ${Math.round(iconLightS * 100)}%, ${Math.round(iconLightL * 100)}%)`

    // 3. Botão para modo claro: tom sólido, confortável e estável
    const btnLightL = Math.min(Math.max(l, 0.38), 0.46)
    const btnLightHoverL = Math.max(btnLightL - 0.06, 0.30)
    const accentBtnBgLight = `hsl(${h}, ${Math.round(s * 100)}%, ${Math.round(btnLightL * 100)}%)`
    const accentBtnHoverLight = `hsl(${h}, ${Math.round(s * 100)}%, ${Math.round(btnLightHoverL * 100)}%)`

    // Set dynamic properties on documentElement
    document.documentElement.style.setProperty('--accent-rgb', `${r}, ${g}, ${b}`)
    document.documentElement.style.setProperty('--accent-glow', glow)
    document.documentElement.style.setProperty('--accent-glow-subtle', subtleBg)
    document.documentElement.style.setProperty('--accent-subtle', subtleBg)
    document.documentElement.style.setProperty('--accent-subtle-hover', subtleHover)

    // Derived light mode variables
    document.documentElement.style.setProperty('--accent-text-light', accentTextLight)
    document.documentElement.style.setProperty('--accent-icon-light', accentIconLight)
    document.documentElement.style.setProperty('--accent-btn-bg-light', accentBtnBgLight)
    document.documentElement.style.setProperty('--accent-btn-hover-light', accentBtnHoverLight)
    document.documentElement.style.setProperty('--accent-btn-text-light', '#ffffff')
  }

  const applyTypography = (size: AppSettings['fontSize'], family?: AppSettings['fontFamily']) => {
    const fontSizeMap: Record<string, string> = {
      small: '13px',
      medium: '15px',
      large: '17px'
    }
    const px = fontSizeMap[size] || '15px'
    document.documentElement.style.setProperty('--editor-font-size', px)

    const fontFamilies: Record<string, string> = {
      sans: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      serif: "'Lora', Georgia, 'Times New Roman', serif",
      mono: "'Fira Code', 'Cascadia Code', 'JetBrains Mono', Consolas, monospace",
      humanist: "'Plus Jakarta Sans', system-ui, sans-serif"
    }
    const fontStr = fontFamilies[family || 'sans'] || fontFamilies.sans
    document.documentElement.style.setProperty('--app-font-family', fontStr)
  }

  const handleUpdateSettings = (newSettings: AppSettings) => {
    // Determinar a cor de destaque atual com base no modo
    const isLight = newSettings.themeMode === 'light'
    let currentAccent = isLight
      ? (newSettings.accentColorLight || newSettings.accentColor)
      : (newSettings.accentColorDark || newSettings.accentColor)

    const sanitizedSettings: AppSettings = {
      ...newSettings,
      accentColor: currentAccent,
      accentColorLight: isLight ? (newSettings.accentColorLight || currentAccent) : (newSettings.accentColorLight || '#c59b27'),
      accentColorDark: !isLight ? (newSettings.accentColorDark || currentAccent) : (newSettings.accentColorDark || '#c59b27')
    }

    setSettings(sanitizedSettings)
    localStorage.setItem('pyrite_app_settings', JSON.stringify(sanitizedSettings))
    applyAccentColor(sanitizedSettings.accentColor)
    applyTypography(sanitizedSettings.fontSize, sanitizedSettings.fontFamily)
  }

  // Ensure accent, theme mode and typography are applied on mount and update
  useEffect(() => {
    applyAccentColor(settings.accentColor)
    applyTypography(settings.fontSize, settings.fontFamily)
    if (settings.themeMode === 'light') {
      document.documentElement.classList.add('light')
      document.documentElement.classList.remove('dark')
    } else {
      document.documentElement.classList.remove('light')
      document.documentElement.classList.add('dark')
    }
  }, [settings.accentColor, settings.themeMode, settings.fontSize, settings.fontFamily])

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

  // Open view mode and create/activate a persistent tab for Graph, Canvas or Tasks
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

    if (view === 'tasks') {
      setTabs(prev => {
        const existing = prev.find(t => t.noteId === '__tasks__')
        if (existing) {
          setActiveTabId(existing.id)
          return prev
        }
        const tasksTab: TabItem = {
          id: 'tab_tasks',
          noteId: '__tasks__',
          title: 'Tarefas'
        }
        setActiveTabId(tasksTab.id)
        return [...prev, tasksTab]
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

  // Select note and ensure tab exists (preserves Graph/Canvas/Tasks tabs!)
  const handleSelectNote = (noteId: string, directNote?: Note) => {
    setCurrentNoteId(noteId)
    setCurrentView('editor')

    const targetNote = directNote || notes.find(n => n.id === noteId)
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
        title: targetNote.title,
        type: targetNote.type
      }
      setActiveTabId(newTab.id)

      // If exceeding MAX_TABS, evict the oldest regular note tab (never evict Graph, Canvas or Tasks tabs!)
      if (prev.length >= MAX_TABS) {
        const firstNoteIdx = prev.findIndex(t => t.noteId !== '__graph__' && t.noteId !== '__canvas__' && t.noteId !== '__tasks__')
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
    } else if (tab.noteId === '__tasks__') {
      setCurrentView('tasks')
    } else {
      setCurrentNoteId(tab.noteId)
      setCurrentView('editor')
    }
  }

  const handleCloseTab = (tabId: string) => {
    const tabToClose = tabs.find(t => t.id === tabId)
    if (tabToClose?.noteId) {
      mindMapViewportCache.delete(tabToClose.noteId)
    }
    const remaining = tabs.filter(t => t.id !== tabId)
    setTabs(remaining)
    if (remaining.length === 0) {
      setActiveTabId('')
      setCurrentNoteId('')
      return
    }
    if (activeTabId === tabId && remaining.length > 0) {
      const nextTab = remaining[remaining.length - 1]
      setActiveTabId(nextTab.id)
      if (nextTab.noteId === '__graph__') {
        setCurrentView('graph')
      } else if (nextTab.noteId === '__canvas__') {
        setCurrentView('canvas')
      } else if (nextTab.noteId === '__tasks__') {
        setCurrentView('tasks')
      } else {
        setCurrentNoteId(nextTab.noteId)
        setCurrentView('editor')
      }
    }
  }

  // Workspace Task Handlers
  const handleSelectTaskBoard = (boardId: string) => {
    setActiveBoardId(boardId)
    setCurrentView('tasks')
    const currentBoards = taskSettings.boards && taskSettings.boards.length > 0 ? taskSettings.boards : DEFAULT_BOARDS
    const boardObj = currentBoards.find(b => b.id === boardId)
    const boardTitle = boardObj?.name || 'Tarefas'
    setTabs(prev => {
      const existing = prev.find(t => t.noteId === '__tasks__')
      if (existing) {
        setActiveTabId(existing.id)
        return prev.map(t => t.id === existing.id ? { ...t, title: boardTitle } : t)
      }
      const tasksTab: TabItem = {
        id: 'tab_tasks',
        noteId: '__tasks__',
        title: boardTitle
      }
      setActiveTabId(tasksTab.id)
      return [...prev, tasksTab]
    })
  }

  const handleCreateTaskBoard = (name: string, icon: string = 'CheckCircle2') => {
    const newBoard: TaskBoard = {
      id: `board_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: name.trim() || 'Nova Aba',
      icon: icon || 'CheckCircle2',
      createdAt: Date.now()
    }
    const currentBoards = taskSettings.boards && taskSettings.boards.length > 0 ? taskSettings.boards : DEFAULT_BOARDS
    const updatedBoards = [...currentBoards, newBoard]
    const updatedSettings: TaskSettings = { ...taskSettings, boards: updatedBoards }
    handleUpdateTaskSettings(updatedSettings)
    setActiveBoardId(newBoard.id)
    setCurrentView('tasks')
    setTabs(prev => {
      const existing = prev.find(t => t.noteId === '__tasks__')
      if (existing) {
        setActiveTabId(existing.id)
        return prev.map(t => t.id === existing.id ? { ...t, title: newBoard.name } : t)
      }
      const tasksTab: TabItem = {
        id: 'tab_tasks',
        noteId: '__tasks__',
        title: newBoard.name
      }
      setActiveTabId(tasksTab.id)
      return [...prev, tasksTab]
    })
  }

  const handleRenameTaskBoard = (boardId: string, newName: string) => {
    if (!newName.trim()) return
    const currentBoards = taskSettings.boards && taskSettings.boards.length > 0 ? taskSettings.boards : DEFAULT_BOARDS
    const updatedBoards = currentBoards.map(b =>
      b.id === boardId ? { ...b, name: newName.trim() } : b
    )
    handleUpdateTaskSettings({ ...taskSettings, boards: updatedBoards })
  }

  const handleChangeTaskBoardIcon = (boardId: string, icon: string) => {
    const currentBoards = taskSettings.boards && taskSettings.boards.length > 0 ? taskSettings.boards : DEFAULT_BOARDS
    const updatedBoards = currentBoards.map(b =>
      b.id === boardId ? { ...b, icon } : b
    )
    handleUpdateTaskSettings({ ...taskSettings, boards: updatedBoards })
  }

  const handleDeleteTaskBoard = (boardId: string) => {
    if (boardId === 'default') return
    const currentBoards = taskSettings.boards && taskSettings.boards.length > 0 ? taskSettings.boards : DEFAULT_BOARDS
    const updatedBoards = currentBoards.filter(b => b.id !== boardId)
    handleUpdateTaskSettings({ ...taskSettings, boards: updatedBoards })
    if (activeBoardId === boardId) {
      setActiveBoardId('default')
    }
    const updatedTasks = tasks.map(t => (t.boardId === boardId ? { ...t, boardId: 'default' } : t))
    setTasks(updatedTasks)
    saveTasks(updatedTasks, vaultPath || 'default')
  }

  const handleTogglePinTab = (tabId: string) => {
    setTabs(prev =>
      prev.map(tab => (tab.id === tabId ? { ...tab, isPinned: !tab.isPinned } : tab))
    )
  }

  const handleReorderTabs = (sourceId: string, targetId: string) => {
    setTabs(prev => {
      const sourceIndex = prev.findIndex(t => t.id === sourceId)
      const targetIndex = prev.findIndex(t => t.id === targetId)
      if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex) return prev
      const updated = [...prev]
      const [moved] = updated.splice(sourceIndex, 1)
      updated.splice(targetIndex, 0, moved)
      return updated
    })
  }

  const handleCreateTask = (title?: string, initialData?: Partial<TaskItem>) => {
    const newTask: TaskItem = {
      id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      title: title?.trim() || 'Nova Tarefa',
      completed: false,
      statusId: initialData?.statusId || taskSettings.statuses[0]?.id || 'todo',
      priority: initialData?.priority || 'medium',
      tags: initialData?.tags || [],
      description: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      boardId: initialData?.boardId || activeBoardId || 'default',
      ...initialData
    }
    setTasks(prev => {
      const next = [newTask, ...prev]
      saveTasks(next, vaultPath || 'default')
      return next
    })
    setSelectedTaskId(newTask.id)
    return newTask
  }

  const handleUpdateTask = (updatedTask: TaskItem) => {
    setTasks(prev => {
      const next = prev.map(t => (t.id === updatedTask.id ? { ...updatedTask, updatedAt: Date.now() } : t))
      saveTasks(next, vaultPath || 'default')
      return next
    })
  }

  const handleDeleteTask = (taskId: string) => {
    setTasks(prev => {
      const next = prev.filter(t => t.id !== taskId)
      saveTasks(next, vaultPath || 'default')
      return next
    })
    if (selectedTaskId === taskId) {
      setSelectedTaskId(null)
    }
  }

  const handleUpdateTaskSettings = (newSettings: TaskSettings) => {
    setTaskSettings(newSettings)
    saveTaskSettings(newSettings, vaultPath || 'default')
  }

  const handleOpenTasks = () => {
    handleChangeView('tasks')
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

  const handleCreateNote = (folder?: string, initialTitle?: string, type: NoteType = 'note') => {
    const targetFolder = folder || currentNote?.folder || 'Início'
    const mindMapCount = notes.filter(n => n.type === 'mindmap').length
    const drawCount = notes.filter(n => n.type === 'draw').length
    const htmlCount = notes.filter(n => n.type === 'html').length
    const noteCount = notes.filter(n => n.type !== 'draw' && n.type !== 'mindmap' && n.type !== 'html').length
    const title = initialTitle || (
      type === 'mindmap'
        ? `Mapa Mental ${mindMapCount + 1}`
        : type === 'draw'
        ? `Desenho ${drawCount + 1}`
        : type === 'html'
        ? `Página ${htmlCount + 1}.html`
        : `Nota ${noteCount + 1}`
    )

    const defaultHtmlStarter = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-[#0e0e12] text-zinc-100 min-h-screen p-8 flex flex-col items-center justify-center font-sans antialiased">
  <div class="max-w-md w-full bg-[#16161d] border border-zinc-800 rounded-2xl p-6 shadow-2xl space-y-4">
    <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-500/10 border border-orange-500/20 text-orange-400 text-xs font-semibold">
      ⚡ Pyrita HTML
    </div>
    <h1 class="text-2xl font-bold tracking-tight text-white">${title}</h1>
    <p class="text-sm text-zinc-400 leading-relaxed">
      Esta é uma página HTML interativa renderizada no Pyrita. Você pode editar o código diretamente ou pedir ao <strong>Assistente IA</strong> para criar novas seções, estilos e funcionalidades!
    </p>
    <div class="pt-2 flex gap-3">
      <button class="px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-black font-semibold text-xs rounded-xl shadow-md transition-all active:scale-95">
        Botão de Exemplo
      </button>
    </div>
  </div>
</body>
</html>`

    const content = type === 'mindmap'
      ? serializeMindMapDocument(createEmptyMindMapDocument(title))
      : type === 'draw'
      ? serializeDrawDocument(createEmptyDrawDocument(title))
      : type === 'html'
      ? defaultHtmlStarter
      : `Escreva sua nota aqui... Conecte com [[${currentNote?.title || 'Bem-vindo ao Pyrite'}]].\n`

    const newNote: Note = {
      id: `${type}_${Date.now()}`,
      title,
      content,
      folder: targetFolder,
      tags: type === 'mindmap' ? ['mindmap', 'mapa-mental'] : type === 'draw' ? ['draw', 'desenho'] : type === 'html' ? ['html', 'web'] : [],
      type,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    const updated = [newNote, ...notes]
    setNotes(updated)
    saveNotes(updated)
    handleSelectNote(newNote.id, newNote)

    // Electron disk persistence
    if (window.electronAPI?.isElectron && vaultPath) {
      window.electronAPI.saveFile({
        vaultPath,
        folder: targetFolder,
        title: newNote.title,
        content: newNote.content,
        type: newNote.type,
        filePath: newNote.filePath
      }).then(res => {
        if (res.success && res.filePath) {
          newNote.filePath = res.filePath
        }
      })
    }
  }

  // Import external HTML file(s) into vault
  const handleImportHtml = async (targetFolder?: string) => {
    const destFolder = targetFolder || currentNote?.folder || 'Início'
    if (window.electronAPI?.isElectron && vaultPath) {
      try {
        const res = await window.electronAPI.importHtml({
          vaultPath,
          targetFolder: destFolder
        })
        if (res.success && res.files && res.files.length > 0) {
          const newNotes: Note[] = res.files.map((f, i) => ({
            id: `html_import_${Date.now()}_${i}`,
            title: f.title,
            folder: f.folder,
            content: f.content,
            filePath: f.filePath,
            tags: ['html', 'importado'],
            type: 'html',
            createdAt: f.createdAt,
            updatedAt: f.updatedAt
          }))
          const updated = [...newNotes, ...notes]
          setNotes(updated)
          saveNotes(updated)
          if (newNotes[0]) {
            handleSelectNote(newNotes[0].id, newNotes[0])
          }
        }
      } catch (err) {
        console.error('Failed to import HTML in Electron:', err)
      }
      return
    }

    // Web Fallback: HTML File Input
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.html,.htm'
    input.multiple = true
    input.onchange = async () => {
      if (!input.files || input.files.length === 0) return
      const importedNotes: Note[] = []
      for (let i = 0; i < input.files.length; i++) {
        const file = input.files[i]
        const text = await file.text()
        const title = file.name.replace(/\.(html|htm)$/i, '')
        importedNotes.push({
          id: `html_import_${Date.now()}_${i}`,
          title: title || 'Página Importada',
          folder: destFolder,
          content: text,
          tags: ['html', 'importado'],
          type: 'html',
          createdAt: file.lastModified || Date.now(),
          updatedAt: file.lastModified || Date.now()
        })
      }
      if (importedNotes.length > 0) {
        const updated = [...importedNotes, ...notes]
        setNotes(updated)
        saveNotes(updated)
        handleSelectNote(importedNotes[0].id, importedNotes[0])
      }
    }
    input.click()
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
    mindMapViewportCache.delete(noteId)
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
        content: finalNote.content,
        type: finalNote.type,
        filePath: finalNote.filePath
      }).then(res => {
        if (res.success && res.filePath) {
          finalNote.filePath = res.filePath
        }
      })
    }

    setTabs(prev => prev.map(t => t.noteId === finalNote.id ? { ...t, title: finalNote.title, type: finalNote.type } : t))
  }

  const handleSidebarAction = async (action: SidebarAction, target: { note?: Note; folder?: string }, value?: string) => {
    const note = target.note
    const folder = target.folder || ''
    const inside = (f: string) => f === folder || f.startsWith(folder + '/')
    const relative = note ? [note.folder === 'Início' ? '' : note.folder, note.filePath?.split(/[/\\]/).pop() || (note.type === 'html' ? note.title + '.html' : note.title + '.md')].filter(Boolean).join('/') : vaultPath && folder === 'Início' ? '' : folder
    const absolute = note?.filePath || (vaultPath ? vaultPath.replace(/[\\/]$/, '') + '/' + relative : relative)
    const api = window.electronAPI?.isElectron && vaultPath ? window.electronAPI : null
    const check = (result: { success: boolean; error?: string }) => { if (!result.success) throw new Error(result.error || 'Não foi possível alterar o arquivo.') }
    if (action === 'open' && note) {
      const tab = { id: `tab_${crypto.randomUUID()}`, noteId: note.id, title: note.title, type: note.type }
      setTabs(prev => [...prev, tab]); setActiveTabId(tab.id)
      setCurrentNoteId(note.id); setCurrentView('editor'); return
    }
    if (action === 'favorite' && note) { handleToggleFavorite(note.id); return }
    if (action === 'copy-path' || action === 'copy-relative') { await navigator.clipboard.writeText(action === 'copy-relative' ? relative : absolute); return }
    if (action === 'reveal') { if (note?.filePath) await api?.revealInExplorer(note.filePath); else await api?.openInExplorer(absolute); return }
    if (action === 'external') { if (api) check(await api.managePath({ vaultPath: vaultPath!, source: absolute, action: 'open' })); return }
    if (action === 'delete') {
      if (api) check(await api.managePath({ vaultPath: vaultPath!, source: absolute, action: 'delete' }))
      const removed = notes.filter(n => note ? n.id === note.id : inside(n.folder))
      const next = notes.filter(n => !removed.includes(n))
      setNotes(next); saveNotes(next)
      setTabs(prev => prev.filter(t => !removed.some(n => n.id === t.noteId)))
      if (removed.some(n => n.id === currentNoteId)) {
        const fallback = next[0]
        setCurrentNoteId(fallback?.id || '')
        if (fallback) {
          const tab = { id: `tab_${crypto.randomUUID()}`, noteId: fallback.id, title: fallback.title }
          setTabs(prev => [...prev, tab]); setActiveTabId(tab.id); setCurrentView('editor')
        } else { setActiveTabId(''); setCurrentView('editor') }
      }
      if (!note) { const nextFolders = folders.filter(f => !inside(f)); setFolders(nextFolders); saveFolders(nextFolders) }
      return
    }
    const validName = (name: string) => { if (!name.trim() || /[\\/:*?"<>|]/.test(name) || /[. ]$/.test(name) || name === '.' || name === '..' || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) throw new Error('Digite um nome válido, sem caracteres reservados.'); return name.trim() }
    let name = action === 'rename' ? validName(value || '') : note?.title || folder.split('/').pop()!
    const selectedFolder = action === 'move' ? value || '' : note?.folder || folder.split('/').slice(0, -1).join('/')
    const destinationFolder = api && selectedFolder === 'Início' ? '' : selectedFolder
    if (!note && action === 'move' && (destinationFolder === folder || destinationFolder.startsWith(folder + '/'))) throw new Error('Uma pasta não pode ser movida para dentro dela mesma.')
    if (note) {
      const collision = (title: string) => notes.some(n => n.id !== (action === 'copy' ? '' : note.id) && (n.folder || 'Início').toLowerCase() === (destinationFolder || 'Início').toLowerCase() && n.title.toLowerCase() === title.toLowerCase())
      if (action === 'copy') { let count = 1; while (collision(name)) name = note.title + ' - cópia' + (count++ > 1 ? ' ' + (count - 1) : '') }
      if (collision(name)) throw new Error('Já existe uma nota com esse nome na pasta de destino.')
      const changed: Note = { ...note, id: action === 'copy' ? crypto.randomUUID() : note.id, title: name, folder: destinationFolder || 'Início', updatedAt: Date.now(), ...(action === 'copy' ? { createdAt: Date.now(), filePath: undefined } : {}) }
      if (api) {
        if (action !== 'copy' && note.filePath) {
          const destination = vaultPath + '/' + (destinationFolder && destinationFolder !== 'Início' ? destinationFolder + '/' : '') + name + '.md'
          check(await api.managePath({ vaultPath: vaultPath!, source: note.filePath, destination, action: 'move' }))
          changed.filePath = destination
        } else {
          const result = await api.saveFile({ vaultPath: vaultPath!, folder: changed.folder, title: name, content: note.content, exclusive: true })
          check(result); changed.filePath = result.filePath
        }
      }
      const next = action === 'copy' ? [...notes, changed] : notes.map(n => n.id === note.id ? changed : n)
      setNotes(next); saveNotes(next)
      setTabs(prev => prev.map(t => t.noteId === changed.id ? { ...t, title: name } : t))
      return
    }
    const exists = (path: string) => folders.some(f => f.toLowerCase() === path.toLowerCase()) || notes.some(n => n.folder.toLowerCase() === path.toLowerCase())
    const join = (n: string) => [destinationFolder, n].filter(Boolean).join('/')
    if (action === 'copy') { let count = 1; while (exists(join(name))) name = folder.split('/').pop()! + ' - cópia' + (count++ > 1 ? ' ' + (count - 1) : '') }
    const destination = join(name)
    if (destination === folder) return
    if (exists(destination)) throw new Error('Já existe uma pasta com esse nome no destino.')
    if (api) check(await api.managePath({ vaultPath: vaultPath!, source: absolute, destination: vaultPath + '/' + destination, action: action === 'copy' ? 'copy' : 'move' }))
    const remap = (f: string) => destination + f.slice(folder.length)
    const changed = notes.filter(n => inside(n.folder)).map(n => ({ ...n, folder: remap(n.folder), ...(action === 'copy' ? { id: crypto.randomUUID(), createdAt: Date.now() } : {}), filePath: api && n.filePath ? vaultPath + '/' + remap(n.folder) + '/' + n.filePath.split(/[\\/]/).pop() : undefined }))
    const next = action === 'copy' ? [...notes, ...changed] : notes.map(n => changed.find(c => c.id === n.id) || n)
    const affectedFolders = Array.from(new Set([folder, ...folders.filter(inside)]))
    const nextFolders = action === 'copy' ? [...folders, ...affectedFolders.map(remap)] : [...folders.filter(f => !inside(f)), ...affectedFolders.map(remap)]
    setNotes(next); saveNotes(next); setFolders(nextFolders); saveFolders(nextFolders)
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
      if (entry.kind === 'file' && (entry.name.endsWith('.md') || entry.name.endsWith('.draw.json') || entry.name.endsWith('.draw.md') || entry.name.endsWith('.mindmap.json') || entry.name.endsWith('.mindmap.md') || entry.name.endsWith('.html') || entry.name.endsWith('.htm'))) {
        const file = await entry.getFile()
        const text = await file.text()
        const title = entry.name.replace(/\.(draw\.json|draw\.md|mindmap\.json|mindmap\.md|html|htm|md)$/i, '')
        const isMindMap = isMindMapContent(text) || entry.name.endsWith('.mindmap.json') || entry.name.endsWith('.mindmap.md')
        const isDraw = isDrawContent(text) || entry.name.endsWith('.draw.json') || entry.name.endsWith('.draw.md')
        const isHtml = entry.name.endsWith('.html') || entry.name.endsWith('.htm')
        collectedNotes.push({
          id: `local_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          title,
          content: text,
          folder: currentPath || dirHandle.name,
          tags: isMindMap ? ['mindmap', 'mapa-mental'] : isDraw ? ['draw', 'desenho'] : isHtml ? ['html', 'web'] : extractTags(text),
          type: isMindMap ? 'mindmap' : isDraw ? 'draw' : isHtml ? 'html' : 'note',
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
              type: (isMindMapContent(f.content) || f.filePath?.endsWith('.mindmap.json') || f.filePath?.endsWith('.mindmap.md'))
              ? 'mindmap'
              : (isDrawContent(f.content) || f.filePath?.endsWith('.draw.json') || f.filePath?.endsWith('.draw.md'))
              ? 'draw'
              : (f.filePath?.endsWith('.html') || f.filePath?.endsWith('.htm'))
              ? 'html'
              : 'note',
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
            type: (isMindMapContent(f.content) || f.filePath?.endsWith('.mindmap.json') || f.filePath?.endsWith('.mindmap.md'))
              ? 'mindmap'
              : (isDrawContent(f.content) || f.filePath?.endsWith('.draw.json') || f.filePath?.endsWith('.draw.md'))
              ? 'draw'
              : (f.filePath?.endsWith('.html') || f.filePath?.endsWith('.htm'))
              ? 'html'
              : 'note',
            createdAt: f.createdAt,
            updatedAt: f.updatedAt
          }))
          const loadedFolders = Array.from(new Set(loadedNotes.map(n => n.folder).filter(Boolean)))
          setNotes(loadedNotes)
          setFolders(loadedFolders)
          saveNotes(loadedNotes)
          saveFolders(loadedFolders)
          setTasks(loadTasks(targetPath))
          setTaskSettings(loadTaskSettings(targetPath))
          if (loadedNotes[0]) {
            setCurrentNoteId(loadedNotes[0].id)
            setTabs([{ id: `tab_${loadedNotes[0].id}`, noteId: loadedNotes[0].id, title: loadedNotes[0].title, type: loadedNotes[0].type }])
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
      localStorage.setItem('pyrite_electron_vault_path', targetPath)
      setVaultPath(targetPath)
      setTasks(loadTasks(targetPath))
      setTaskSettings(loadTaskSettings(targetPath))
      setCurrentView('editor')
    } catch (err) {
      console.error('Error switching vault in Electron:', err)
      throw err
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

  const handleOpenMindMap = () => {
    const existingMindMap = notes.find(n => n.type === 'mindmap')
    if (existingMindMap) {
      handleSelectNote(existingMindMap.id, existingMindMap)
    } else {
      handleCreateNote(undefined, 'Novo Mapa Mental', 'mindmap')
    }
  }

  return (
    <div className={`app-outer-shell flex flex-col w-screen h-screen ${settings.themeMode === 'light' ? 'light' : ''} bg-[#0f0f12] text-zinc-100 overflow-hidden font-sans relative`}>
      {/* Global Tactile Noise Texture Layer (Present by default in both Dark and Light modes) */}
      <div className="pyrita-noise-layer pointer-events-none" />

      {/* 1. Main Workspace Layout */}
      <div className="app-workspace-layout flex flex-1 overflow-hidden relative bg-[#09090b]">
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
          isConversationsOpen={isAiConversationsOpen}
          onToggleConversations={() => {
            setIsAiOpen(true)
            setIsAiConversationsOpen(o => !o)
          }}
          isMindMapActive={currentView === 'editor' && currentNote?.type === 'mindmap'}
          onOpenMindMap={handleOpenMindMap}
          themeMode={settings.themeMode}
          onToggleTheme={() => handleUpdateSettings({ ...settings, themeMode: settings.themeMode === 'light' ? 'dark' : 'light' })}
        />

        {/* Left Sidebar (Hierarchical Subfolders & Notes Tree) */}
        <Sidebar
          notes={notes}
          folders={folders}
          currentNoteId={currentNoteId}
          vaultPath={vaultPath}
          currentView={currentView}
          taskBoards={taskBoards}
          activeBoardId={activeBoardId}
          tasks={tasks}
          onSelectNote={handleSelectNote}
          onManage={handleSidebarAction}
          onCreateNote={handleCreateNote}
          onCreateFolder={handleCreateFolder}
          onDeleteNote={handleDeleteNote}
          onToggleFavorite={handleToggleFavorite}
          onOpenDailyNote={handleOpenDailyNote}
          onOpenLocalFolder={handleOpenLocalFolder}
          onOpenInExplorer={handleOpenInExplorer}
          onOpenVaultSwitcher={() => setIsVaultSwitcherOpen(true)}
          onOpenTasks={handleOpenTasks}
          onRefreshVault={() => handleRefreshVault()}
          onImportHtml={handleImportHtml}
          onSelectTaskBoard={handleSelectTaskBoard}
          onCreateTaskBoard={handleCreateTaskBoard}
          onRenameTaskBoard={handleRenameTaskBoard}
          onChangeTaskBoardIcon={handleChangeTaskBoardIcon}
          onDeleteTaskBoard={handleDeleteTaskBoard}
          isOpen={isLeftSidebarOpen}
        />

        {/* AI Agent Panel - Opens beside main sidebar, to the left of the content (like reference image) */}
        {isAiOpen && (
          <AiAssistant
            vaultPath={vaultPath || undefined}
            currentNote={currentNote}
            allNotes={notes}
            onConnectNote={handleConnectNote}
            onAddTag={handleAddTag}
            onInsertSnippet={handleInsertSnippet}
            onCreateNote={(folder, initialTitle, initialContent, forcedType) => {
              const isHtml = forcedType === 'html' || initialTitle?.toLowerCase().endsWith('.html') || initialTitle?.toLowerCase().endsWith('.htm') || /<!DOCTYPE\s+html|<html/i.test(initialContent || '')
              const isMind = !isHtml && (forcedType === 'mindmap' || isMindMapContent(initialContent))
              const targetFolder = folder || currentNote?.folder || 'Início'
              const mindMapCount = notes.filter(n => n.type === 'mindmap').length
              const htmlCount = notes.filter(n => n.type === 'html').length
              const noteCount = notes.filter(n => n.type !== 'draw' && n.type !== 'mindmap' && n.type !== 'html').length
              const title = initialTitle || (isMind ? `Mapa Mental ${mindMapCount + 1}` : isHtml ? `Página ${htmlCount + 1}.html` : `Nota ${noteCount + 1}`)
              const type: NoteType = isHtml ? 'html' : isMind ? 'mindmap' : 'note'
              const content = isMind
                ? serializeMindMapDocument(parseMindMapDocument(initialContent, title))
                : (initialContent || `Escreva sua nota aqui... Conecte com [[${currentNote?.title || 'Bem-vindo ao Pyrite'}]].\n`)

              const newNote: Note = {
                id: `${type}_${Date.now()}`,
                title,
                content,
                folder: targetFolder,
                tags: isHtml ? ['html', 'web'] : isMind ? ['mindmap', 'mapa-mental'] : [],
                type,
                createdAt: Date.now(),
                updatedAt: Date.now()
              }
              const updated = [newNote, ...notes]
              setNotes(updated)
              saveNotes(updated)
              handleSelectNote(newNote.id, newNote)

              if (window.electronAPI?.isElectron && vaultPath) {
                window.electronAPI.saveFile({
                  vaultPath,
                  folder: targetFolder,
                  title: newNote.title,
                  content: newNote.content,
                  type: newNote.type,
                  filePath: newNote.filePath
                }).then(res => {
                  if (res.success && res.filePath) {
                    newNote.filePath = res.filePath
                  }
                })
              }
            }}
            onUpdateNote={handleUpdateNote}
            tasks={tasks}
            taskSettings={taskSettings}
            activeBoardId={activeBoardId}
            taskBoards={taskBoards}
            onCreateTask={handleCreateTask}
            onUpdateTask={handleUpdateTask}
            onDeleteTask={handleDeleteTask}
            onOpenTasks={handleOpenTasks}
            isConversationsOpen={isAiConversationsOpen}
            onToggleConversations={() => setIsAiConversationsOpen(o => !o)}
            onClose={() => setIsAiOpen(false)}
          />
        )}

        {/* Central View Area with Workspace Tab Header */}
        <main
          className={`app-main-pane flex-1 my-2 overflow-hidden relative flex flex-col ${
            currentView === 'graph'
              ? 'bg-[#010103] rounded-tl-2xl rounded-bl-none border-t border-l border-b-0 shadow-none'
              : 'bg-[#0f0f12] rounded-l-2xl border-y border-l shadow-lg'
          } border-zinc-800/80 ${
            isAiOpen ? '' : 'ml-1.5'
          }`}
        >
          {/* Obsidian Tab Header - Stays across full top of central section */}
          <TabHeader
            tabs={tabs}
            activeTabId={activeTabId}
            onSelectTab={handleSelectTab}
            onCloseTab={handleCloseTab}
            onTogglePinTab={handleTogglePinTab}
            onNewTab={() => handleCreateNote()}
            currentView={currentView}
            displayMode={editorDisplayMode}
            onChangeDisplayMode={setEditorDisplayMode}
            onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
            onOpenSettings={() => setIsSettingsOpen(true)}
            onExportVault={handleExportVault}
            onReorderTabs={handleReorderTabs}
          />

          {/* Page area below Header: Contains Editor/Graph/Canvas and the RightSidebar (Sumário) */}
          <div className="flex-1 flex overflow-hidden relative">
            <div className="flex-1 overflow-hidden relative">
              {currentView === 'editor' && (tabs.length === 0 || !currentNote) && (
                <div className="w-full h-full flex flex-col items-center justify-center text-center p-8 select-none">
                  <div className="w-14 h-14 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 flex items-center justify-center text-zinc-500 mb-4 shadow-sm">
                    <FileText className="w-6 h-6 stroke-[1.5]" />
                  </div>
                  <h3 className="text-sm font-semibold text-zinc-300 mb-1">
                    Nenhuma aba aberta
                  </h3>
                  <p className="text-xs text-zinc-500 max-w-sm mb-4 leading-relaxed">
                    Selecione uma nota na barra lateral para visualizá-la ou clique abaixo para criar uma nova.
                  </p>
                  <button
                    onClick={() => handleCreateNote()}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all shadow-xs cursor-pointer hover:bg-[var(--accent-glow)] hover:scale-105 active:scale-95"
                    style={{
                      backgroundColor: 'var(--accent-glow-subtle, rgba(197, 155, 39, 0.12))',
                      color: 'var(--accent, #d4af37)'
                    }}
                  >
                    <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>Criar nova nota</span>
                  </button>
                </div>
              )}

              {currentView === 'editor' && tabs.length > 0 && currentNote && (
                currentNote.type === 'mindmap' ? (
                  <MindMapEditor
                    key={currentNote.id}
                    note={currentNote}
                    onUpdateNote={handleUpdateNote}
                  />
                ) : currentNote.type === 'draw' ? (
                  <DrawEditor
                    key={currentNote.id}
                    note={currentNote}
                    onUpdateNote={handleUpdateNote}
                  />
                ) : currentNote.type === 'html' ? (
                  <HtmlEditor
                    key={currentNote.id}
                    note={currentNote}
                    onUpdateNote={handleUpdateNote}
                    themeMode={settings.themeMode}
                  />
                ) : (
                  <Editor
                    key={currentNote.id}
                    note={currentNote}
                    allNotes={notes}
                    displayMode={editorDisplayMode}
                    onUpdateNote={handleUpdateNote}
                    onNavigate={handleNavigate}
                    settings={settings}
                    isRightSidebarOpen={isRightSidebarOpen}
                    onToggleRightSidebar={() => setIsRightSidebarOpen(o => !o)}
                  />
                )
              )}

              {(currentView === 'graph' || tabs.some(t => t.noteId === '__graph__')) && (
                <div className={currentView === 'graph' ? 'w-full h-full bg-[#010103]' : 'hidden'}>
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
                  currentNoteId={currentNoteId}
                  vaultPath={vaultPath || undefined}
                  onSelectNote={handleSelectNote}
                  onCreateDraw={(folder, title) => handleCreateNote(folder, title, 'draw')}
                  onUpdateNote={handleUpdateNote}
                />
              )}

              {currentView === 'tasks' && (
                <TasksView
                  tasks={tasks}
                  settings={taskSettings}
                  allNotes={notes}
                  selectedTaskId={selectedTaskId}
                  activeBoardId={activeBoardId}
                  taskBoards={taskBoards}
                  onSelectTaskBoard={handleSelectTaskBoard}
                  onSelectTask={(task) => setSelectedTaskId(task ? task.id : null)}
                  onCreateTask={handleCreateTask}
                  onUpdateTask={handleUpdateTask}
                  onDeleteTask={handleDeleteTask}
                  onUpdateSettings={handleUpdateTaskSettings}
                  onOpenNote={(noteId: string) => handleSelectNote(noteId)}
                />
              )}
            </div>

            {/* Right Sidebar (Backlinks, Outline, Tags) - Height limited to page below header */}
            {currentView !== 'tasks' && (
              <RightSidebar
                currentNote={currentNote}
                allNotes={notes}
                onSelectNote={handleSelectNote}
                isOpen={isRightSidebarOpen}
              />
            )}
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
        onCreateDraw={(folder, title) => handleCreateNote(folder, title, 'draw')}
        onChangeViewMode={handleChangeView}
        onOpenAi={() => setIsAiOpen(true)}
        onOpenLocalFolder={handleOpenLocalFolder}
        onOpenVaultSwitcher={() => setIsVaultSwitcherOpen(true)}
        onToggleTheme={() => handleUpdateSettings({ ...settings, themeMode: settings.themeMode === 'light' ? 'dark' : 'light' })}
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
