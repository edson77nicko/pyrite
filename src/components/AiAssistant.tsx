import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import type { Note, NoteType, AgentProfileVersion, MultiAgentStoreState } from '../types'
import type {
  AgentSpecialistRole,
  WorkflowDefinition,
  WorkflowNode,
  WorkflowEdge,
  WorkflowNodeKind,
  TeamDefinition,
  TeamMemberNode,
  TeamEdge,
  SquadPipelineStep
} from '../types/agents'
import type { TaskItem, TaskSettings, SubTask, TaskBoard } from '../types/tasks'
import { executeAgentRun, resolveNoteByIdOrFallback, updateAgentProfileWithVersion } from '../utils/multiAgentEngine'
import { mindMapToMarkdownOutline, parseMindMapDocument, serializeMindMapDocument, isMindMapContent, cleanNodeTitle } from '../utils/mindMapUtils'
import { MarkdownRenderer } from './MarkdownRenderer'
import { AiSettingsModal } from './AiSettingsModal'
import { FolderTreePicker } from './FolderTreePicker'
import { AgentIcon } from './AgentIcon'
import { renderDynamicIcon } from './IconPickerPopover'
import {
  Sparkles,
  Bot,
  User,
  X,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Loader2,
  KeyRound,
  Folder,
  FolderPlus,
  Check,
  Settings,
  PenLine,
  Copy,
  MessageSquare,
  Plus,
  Trash2,
  Pencil,
  Mic,
  Square,
  Search,
  FileText,
  Clock,
  CheckCircle2,
  FilePlus
} from 'lucide-react'

export type AgentRuleMode = 'analyst' | 'editor'

export interface NotePatchItem {
  search: string
  replace: string
}

export interface NoteEditAction {
  id: string
  type: 'patch' | 'replace'
  targetTitle: string
  targetType: NoteType
  patches: NotePatchItem[]
  replaceContent?: string
  applied: boolean
  appliedAt?: number
  discarded?: boolean
}

export interface ChatMessage {
  id: string
  sender: 'ai' | 'user'
  text: string
  isActionable?: boolean
  isAudio?: boolean
  proposedEdit?: NoteEditAction
}

export interface AgentSpecialty {
  id: string
  name: string
  shortName: string
  badgeColor: string
  icon: string
  tagline: string
  systemDirective: string
  presets: { label: string; prompt: string }[]
}

export function sanitizeHtmlContent(raw: string): string {
  if (!raw) return ''
  let content = raw.trim()

  // 1. Remove markdown code block fences if present at top
  content = content.replace(/^```(?:html|htm|xml)?\s*\n?/i, '')

  // 2. Locate the real start of the HTML document (strip greetings/explanations before <!DOCTYPE or <html)
  const docTypeIdx = content.search(/<!DOCTYPE\s+html/i)
  const htmlTagIdx = content.search(/<html/i)

  let startIdx = -1
  if (docTypeIdx !== -1) {
    startIdx = docTypeIdx
  } else if (htmlTagIdx !== -1) {
    startIdx = htmlTagIdx
  }

  if (startIdx !== -1) {
    content = content.substring(startIdx)
  }

  // 3. Locate the real end of the HTML document (</html>) and cut off trailing chat text
  const endHtmlIdx = content.toLowerCase().lastIndexOf('</html>')
  if (endHtmlIdx !== -1) {
    content = content.substring(0, endHtmlIdx + '</html>'.length)
  } else {
    // If </html> is missing (e.g. truncated stream), strip any markdown trailing fence
    content = content.replace(/\n?```\s*$/i, '')
  }

  return content.trim()
}

export function applyPatches(
  originalContent: string,
  patches: NotePatchItem[]
): { success: boolean; newContent: string; appliedCount: number; failedCount: number } {
  let content = originalContent
  let appliedCount = 0
  let failedCount = 0

  for (const patch of patches) {
    const search = patch.search
    const replace = patch.replace

    if (!search && !replace) continue

    // If search is empty, append to the end
    if (!search) {
      content = content ? `${content.trimEnd()}\n\n${replace}` : replace
      appliedCount++
      continue
    }

    // 1. Exact match
    if (content.includes(search)) {
      content = content.replace(search, replace)
      appliedCount++
      continue
    }

    // 2. Normalized line endings (\r\n vs \n)
    const normSearch = search.replace(/\r\n/g, '\n')
    const normContent = content.replace(/\r\n/g, '\n')
    if (normContent.includes(normSearch)) {
      const idx = normContent.indexOf(normSearch)
      content = normContent.substring(0, idx) + replace.replace(/\r\n/g, '\n') + normContent.substring(idx + normSearch.length)
      appliedCount++
      continue
    }

    // 3. Trimmed search match
    const trimmedSearch = search.trim()
    if (trimmedSearch && content.includes(trimmedSearch)) {
      content = content.replace(trimmedSearch, replace.trim())
      appliedCount++
      continue
    }

    // 4. Line-by-line whitespace-tolerant match
    const searchLines = search.split(/\r?\n/).map(l => l.trimEnd()).filter(Boolean)
    if (searchLines.length > 0) {
      const contentLines = content.split(/\r?\n/)
      let foundStart = -1
      for (let i = 0; i <= contentLines.length - searchLines.length; i++) {
        let match = true
        for (let j = 0; j < searchLines.length; j++) {
          if (contentLines[i + j].trimEnd() !== searchLines[j]) {
            match = false
            break
          }
        }
        if (match) {
          foundStart = i
          break
        }
      }

      if (foundStart !== -1) {
        contentLines.splice(foundStart, searchLines.length, ...replace.split(/\r?\n/))
        content = contentLines.join('\n')
        appliedCount++
        continue
      }
    }

    failedCount++
  }

  return {
    success: appliedCount > 0,
    newContent: content,
    appliedCount,
    failedCount
  }
}

export function parseNoteEditActions(
  text: string,
  targetTitle: string,
  targetType: NoteType = 'note'
): {
  displayText: string
  patchAction: NoteEditAction | null
} {
  if (!text) return { displayText: '', patchAction: null }

  let patchAction: NoteEditAction | null = null
  let cleanText = text

  // 1. Check for <<<PATCH_NOTE>>> with SEARCH / REPLACE
  const patchRegex = /<<<(?:PATCH_NOTE|patch_note)>>>([\s\S]*?)(?:<<<(?:END_PATCH_NOTE|end_patch_note)>>>|$)/i
  const patchChunkRegex = /<<<<<<< SEARCH\s*\n?([\s\S]*?)\n?=======\s*\n?([\s\S]*?)\n?>>>>>>>/g

  const patchMatch = text.match(patchRegex)
  if (patchMatch && patchMatch[1]) {
    const rawChunks = patchMatch[1]
    const patches: NotePatchItem[] = []
    let chunk
    while ((chunk = patchChunkRegex.exec(rawChunks)) !== null) {
      if (chunk[1] !== undefined || chunk[2] !== undefined) {
        patches.push({
          search: chunk[1] || '',
          replace: chunk[2] || ''
        })
      }
    }

    if (patches.length > 0) {
      patchAction = {
        id: `edit_${Date.now()}`,
        type: 'patch',
        targetTitle,
        targetType,
        patches,
        applied: false
      }
    }
  }

  // 2. Check for <<<REPLACE_NOTE>>>
  if (!patchAction) {
    const replaceRegex = /<<<(?:REPLACE_NOTE|replace_note)>>>([\s\S]*?)(?:<<<(?:END_REPLACE_NOTE|end_replace_note)>>>|$)/i
    const replaceMatch = text.match(replaceRegex)
    if (replaceMatch && replaceMatch[1] && replaceMatch[1].trim()) {
      patchAction = {
        id: `edit_${Date.now()}`,
        type: 'replace',
        targetTitle,
        targetType,
        patches: [],
        replaceContent: replaceMatch[1].trim(),
        applied: false
      }
    }
  }

  // Strip delimiters from displayed text
  cleanText = cleanText
    .replace(/<<<(?:PATCH_NOTE|patch_note)>>>[\s\S]*?(?:<<<(?:END_PATCH_NOTE|end_patch_note)>>>|$)/gi, '')
    .replace(/<<<(?:REPLACE_NOTE|replace_note)>>>[\s\S]*?(?:<<<(?:END_REPLACE_NOTE|end_replace_note)>>>|$)/gi, '')
    .trim()

  return { displayText: cleanText, patchAction }
}

export interface ParsedTaskAction {
  action: 'create' | 'update' | 'delete'
  title: string
  priority?: 'urgent' | 'high' | 'medium' | 'low' | 'none'
  deadline?: string
  tags?: string[]
  subtasks?: string[]
  description?: string
  boardId?: string
}

export function parseMessageTaskActions(text: string): { displayText: string; actions: ParsedTaskAction[] } {
  const actions: ParsedTaskAction[] = []
  if (!text || !text.includes('```task-action')) {
    return { displayText: text || '', actions }
  }

  const regex = /```task-action\s*([\s\S]*?)\s*```/g
  let match
  while ((match = regex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1])
      if (parsed && parsed.title) {
        actions.push({
          action: parsed.action || 'create',
          title: parsed.title,
          priority: parsed.priority || 'medium',
          deadline: parsed.deadline,
          tags: Array.isArray(parsed.tags) ? parsed.tags : [],
          subtasks: Array.isArray(parsed.subtasks) ? parsed.subtasks : [],
          description: parsed.description || '',
          boardId: parsed.boardId || undefined
        })
      }
    } catch (e) {
      console.warn('Falha ao processar bloco task-action:', e)
    }
  }

  const displayText = text.replace(/```task-action\s*[\s\S]*?\s*```/g, '').trim()
  return { displayText, actions }
}

export interface ParsedAgentAction {
  action: 'create' | 'update'
  id?: string
  name: string
  icon?: string
  color?: string
  specialistRole?: AgentSpecialistRole
  roleDescription?: string
  systemDirective?: string
  tone?: string
  rules?: string[]
}

export interface ParsedWorkflowAction {
  action: 'create' | 'update'
  id?: string
  name: string
  description?: string
  nodes?: Array<{
    id?: string
    kind?: string
    label?: string
    config?: Record<string, any>
  }>
  edges?: Array<{
    id?: string
    sourceNodeId?: string
    targetNodeId?: string
    branch?: string
    label?: string
  }>
}

export interface ParsedSquadAction {
  action: 'create' | 'update'
  id?: string
  name: string
  description?: string
  objective?: string
  coordinatorAgentId?: string
  pipeline?: Array<{
    agentId: string
    roleInSquad?: string
    customPrompt?: string
    expectedOutput?: 'note' | 'tasks' | 'html' | 'text'
  }>
}

export function parseMasterActions(text: string): {
  displayText: string
  taskActions: ParsedTaskAction[]
  agentActions: ParsedAgentAction[]
  workflowActions: ParsedWorkflowAction[]
  squadActions: ParsedSquadAction[]
} {
  const taskActions: ParsedTaskAction[] = []
  const agentActions: ParsedAgentAction[] = []
  const workflowActions: ParsedWorkflowAction[] = []
  const squadActions: ParsedSquadAction[] = []

  if (!text) {
    return { displayText: '', taskActions, agentActions, workflowActions, squadActions }
  }

  // Parse task-action
  if (text.includes('```task-action')) {
    const regex = /```task-action\s*([\s\S]*?)\s*```/g
    let match
    while ((match = regex.exec(text)) !== null) {
      try {
        const parsed = JSON.parse(match[1])
        if (parsed && parsed.title) {
          taskActions.push({
            action: parsed.action || 'create',
            title: parsed.title,
            priority: parsed.priority || 'medium',
            deadline: parsed.deadline,
            tags: Array.isArray(parsed.tags) ? parsed.tags : [],
            subtasks: Array.isArray(parsed.subtasks) ? parsed.subtasks : [],
            description: parsed.description || '',
            boardId: parsed.boardId || undefined
          })
        }
      } catch (e) {
        console.warn('Falha ao processar bloco task-action:', e)
      }
    }
  }

  // Parse agent-action
  if (text.includes('```agent-action')) {
    const regex = /```agent-action\s*([\s\S]*?)\s*```/g
    let match
    while ((match = regex.exec(text)) !== null) {
      try {
        const parsed = JSON.parse(match[1])
        if (parsed && parsed.name) {
          agentActions.push({
            action: parsed.action || 'create',
            id: parsed.id,
            name: parsed.name,
            icon: parsed.icon || '🤖',
            color: parsed.color || '#6366f1',
            specialistRole: parsed.specialistRole || 'custom',
            roleDescription: parsed.roleDescription || '',
            systemDirective: parsed.systemDirective || '',
            tone: parsed.tone || '',
            rules: Array.isArray(parsed.rules) ? parsed.rules : []
          })
        }
      } catch (e) {
        console.warn('Falha ao processar bloco agent-action:', e)
      }
    }
  }

  // Parse workflow-action
  if (text.includes('```workflow-action')) {
    const regex = /```workflow-action\s*([\s\S]*?)\s*```/g
    let match
    while ((match = regex.exec(text)) !== null) {
      try {
        const parsed = JSON.parse(match[1])
        if (parsed && parsed.name) {
          workflowActions.push({
            action: parsed.action || 'create',
            id: parsed.id,
            name: parsed.name,
            description: parsed.description || '',
            nodes: Array.isArray(parsed.nodes) ? parsed.nodes : [],
            edges: Array.isArray(parsed.edges) ? parsed.edges : []
          })
        }
      } catch (e) {
        console.warn('Falha ao processar bloco workflow-action:', e)
      }
    }
  }

  // Parse squad-action
  if (text.includes('```squad-action')) {
    const regex = /```squad-action\s*([\s\S]*?)\s*```/g
    let match
    while ((match = regex.exec(text)) !== null) {
      try {
        const parsed = JSON.parse(match[1])
        if (parsed && parsed.name) {
          squadActions.push({
            action: parsed.action || 'create',
            id: parsed.id,
            name: parsed.name,
            description: parsed.description || '',
            objective: parsed.objective || parsed.description || '',
            coordinatorAgentId: parsed.coordinatorAgentId,
            pipeline: Array.isArray(parsed.pipeline) ? parsed.pipeline : []
          })
        }
      } catch (e) {
        console.warn('Falha ao processar bloco squad-action:', e)
      }
    }
  }

  const displayText = text
    .replace(/```task-action\s*[\s\S]*?\s*```/g, '')
    .replace(/```agent-action\s*[\s\S]*?\s*```/g, '')
    .replace(/```workflow-action\s*[\s\S]*?\s*```/g, '')
    .replace(/```squad-action\s*[\s\S]*?\s*```/g, '')
    .replace(/<<<(?:PATCH_NOTE|patch_note)>>>[\s\S]*?(?:<<<(?:END_PATCH_NOTE|end_patch_note)>>>|$)/gi, '')
    .replace(/<<<(?:REPLACE_NOTE|replace_note)>>>[\s\S]*?(?:<<<(?:END_REPLACE_NOTE|end_replace_note)>>>|$)/gi, '')
    .trim()

  return { displayText, taskActions, agentActions, workflowActions, squadActions }
}

export function parseThoughtBlocks(text: string): { thoughts: string[]; cleanText: string } {
  const thoughts: string[] = []
  if (!text) return { thoughts, cleanText: '' }

  const thoughtRegex = /<(?:thought|think)>([\s\S]*?)<\/(?:thought|think)>/gi
  let match
  while ((match = thoughtRegex.exec(text)) !== null) {
    if (match[1] && match[1].trim()) {
      thoughts.push(match[1].trim())
    }
  }

  const cleanText = text.replace(/<(?:thought|think)>[\s\S]*?<\/(?:thought|think)>/gi, '').trim()
  return { thoughts, cleanText }
}

export const CollapsibleThought: React.FC<{ thought: string }> = ({ thought }) => {
  const [isOpen, setIsOpen] = useState(false)
  return (
    <div className="my-1">
      <button
        type="button"
        onClick={() => setIsOpen(o => !o)}
        className="flex items-center gap-1.5 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer text-xs py-0.5 select-none group"
      >
        <span className="group-hover:text-zinc-200">Processo de raciocínio</span>
        <ChevronRight className={`w-3 h-3 text-zinc-500 group-hover:text-zinc-400 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`} />
      </button>
      {isOpen && (
        <div className="mt-1 ml-1 pl-3 border-l border-zinc-800 text-[11px] text-zinc-400 font-mono whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto custom-chat-scrollbar">
          {thought}
        </div>
      )}
    </div>
  )
}

export const DiffProposalCard: React.FC<{
  edit: NoteEditAction
  onApply: () => void
  onDiscard: () => void
}> = ({ edit, onApply, onDiscard }) => {
  const [isExpanded, setIsExpanded] = useState(true)

  return (
    <div className="mt-2 rounded-xl border border-zinc-800/90 bg-[#121319] overflow-hidden text-xs shadow-md">
      {/* Header Bar */}
      <div className="flex items-center justify-between px-3.5 py-2.5 bg-zinc-900/70 border-b border-zinc-800/80">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-5 h-5 rounded-md bg-[var(--accent)]/15 text-[var(--accent)] flex items-center justify-center shrink-0">
            <Pencil className="w-3 h-3" />
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-zinc-200 text-xs truncate">
              Sugestão de Edição em "{edit.targetTitle}"
            </div>
            <div className="text-[10px] text-zinc-500 font-mono">
              {edit.type === 'patch'
                ? `Edição Cirúrgica (${edit.patches.length} ${edit.patches.length === 1 ? 'trecho' : 'trechos'})`
                : 'Substituição de Conteúdo'}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 ml-2">
          {edit.applied ? (
            <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
              <Check className="w-3 h-3 stroke-[2.5]" />
              <span>Aplicado na nota</span>
            </span>
          ) : edit.discarded ? (
            <span className="text-[10px] font-medium text-zinc-500 bg-zinc-800/60 px-2 py-0.5 rounded-full">
              Descartado
            </span>
          ) : (
            <span className="text-[10px] font-medium text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
              Pendente de Aprovação
            </span>
          )}

          <button
            type="button"
            onClick={() => setIsExpanded(o => !o)}
            className="text-zinc-500 hover:text-zinc-300 p-0.5 cursor-pointer transition-colors"
            title={isExpanded ? 'Recolher pré-visualização' : 'Expandir pré-visualização'}
          >
            <ChevronRight className={`w-3.5 h-3.5 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`} />
          </button>
        </div>
      </div>

      {/* Diff Preview Body */}
      {isExpanded && (
        <div className="p-3 bg-[#0d0e12] space-y-2.5 max-h-72 overflow-y-auto custom-chat-scrollbar">
          {edit.type === 'patch' ? (
            edit.patches.map((patch, idx) => (
              <div key={idx} className="space-y-1.5 border border-zinc-800/80 rounded-lg p-2 bg-zinc-950/40">
                {edit.patches.length > 1 && (
                  <div className="text-[9px] font-mono text-zinc-500">
                    TRECHO #{idx + 1}
                  </div>
                )}
                {/* Search / Before (Red) */}
                {patch.search && (
                  <div className="p-2 rounded bg-rose-950/20 border border-rose-900/30 text-rose-300 font-mono text-[11px] whitespace-pre-wrap leading-relaxed select-text">
                    <div className="text-[9px] font-bold text-rose-400 uppercase tracking-wider mb-0.5 select-none">
                      - Original (Será substituído):
                    </div>
                    {patch.search}
                  </div>
                )}
                {/* Replace / After (Green) */}
                <div className="p-2 rounded bg-emerald-950/20 border border-emerald-900/30 text-emerald-300 font-mono text-[11px] whitespace-pre-wrap leading-relaxed select-text">
                  <div className="text-[9px] font-bold text-emerald-400 uppercase tracking-wider mb-0.5 select-none">
                    + Novo Conteúdo:
                  </div>
                  {patch.replace}
                </div>
              </div>
            ))
          ) : (
            <div className="p-2.5 rounded-lg bg-emerald-950/20 border border-emerald-900/30 text-emerald-300 font-mono text-[11px] whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto custom-chat-scrollbar select-text">
              <div className="text-[9px] font-bold text-emerald-400 uppercase tracking-wider mb-1 select-none">
                + Novo Conteúdo Completo:
              </div>
              {edit.replaceContent}
            </div>
          )}
        </div>
      )}

      {/* Footer Actions (Only when not applied and not discarded) */}
      {!edit.applied && !edit.discarded && (
        <div className="px-3.5 py-2 bg-zinc-900/50 border-t border-zinc-800/60 flex items-center justify-between gap-2">
          <span className="text-[10px] text-zinc-500">
            Deseja gravar esta alteração no arquivo agora?
          </span>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onDiscard}
              className="px-2.5 py-1 rounded-lg text-[11px] font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              Descartar
            </button>

            <button
              type="button"
              onClick={onApply}
              className="px-3 py-1 rounded-lg text-[11px] font-semibold bg-emerald-500 hover:bg-emerald-600 text-zinc-950 transition-colors shadow-sm flex items-center gap-1.5 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Aplicar na Nota</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

interface TaskActionsCollapsibleProps {
  messageId: string
  actions: ParsedTaskAction[]
  executedTaskActions: Record<string, boolean>
  tasks?: TaskItem[]
  onExecute: (act: ParsedTaskAction, key: string) => void
  onOpenTasks?: () => void
  taskBoards?: TaskBoard[]
  defaultBoardId?: string
}

export const TaskActionsCollapsible: React.FC<TaskActionsCollapsibleProps> = ({
  messageId,
  actions,
  executedTaskActions,
  tasks = [],
  onExecute,
  onOpenTasks,
  taskBoards = [],
  defaultBoardId
}) => {
  const [isOpen, setIsOpen] = useState(false)

  const targetBoardId = actions[0]?.boardId || defaultBoardId || 'default'
  const board = taskBoards.find(b => b.id === targetBoardId)
  const boardName = board?.name || 'Geral'

  const total = actions.length
  const isTaskExecuted = (act: ParsedTaskAction, idx: number) => {
    const key = `${messageId}_${idx}`
    if (executedTaskActions[key]) return true
    if (tasks && tasks.some(t => t.title.trim().toLowerCase() === act.title.trim().toLowerCase())) {
      return true
    }
    return false
  }

  const completedCount = actions.filter((act, idx) => isTaskExecuted(act, idx)).length
  const allDone = completedCount >= total

  return (
    <div className="my-1.5 text-xs">
      <div className="flex items-center gap-2 py-0.5 group">
        <button
          type="button"
          onClick={() => setIsOpen(o => !o)}
          className="flex items-center gap-1.5 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer text-xs select-none min-w-0"
        >
          <span className="truncate">
            {allDone
              ? `Criou ${total} ${total === 1 ? 'tarefa' : 'tarefas'} no projeto "${boardName}"`
              : `Processou ${completedCount}/${total} tarefas em "${boardName}"`}
          </span>
          <ChevronRight className={`w-3 h-3 text-zinc-500 group-hover:text-zinc-400 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`} />
        </button>

        {onOpenTasks && (
          <button
            type="button"
            onClick={onOpenTasks}
            className="text-[11px] text-zinc-500 hover:text-[var(--accent)] flex items-center gap-0.5 ml-auto shrink-0 transition-colors cursor-pointer"
            title="Abrir quadro de tarefas"
          >
            <span>Ver no quadro</span>
            <span>→</span>
          </button>
        )}
      </div>

      {isOpen && (
        <div className="mt-1 ml-1 pl-3 border-l border-zinc-800 space-y-1 py-1 max-h-56 overflow-y-auto custom-chat-scrollbar">
          {actions.map((act, idx) => {
            const isDone = isTaskExecuted(act, idx)

            return (
              <div
                key={idx}
                className="flex items-center justify-between gap-2 text-[11px] py-0.5 text-zinc-300 hover:text-zinc-100"
              >
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  <span className="text-emerald-400 shrink-0 text-xs">✓</span>
                  <span className="truncate font-medium">{act.title}</span>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {act.priority && act.priority !== 'none' && (
                    <span className={`text-[9px] font-mono px-1 py-0.2 rounded ${
                      act.priority === 'urgent'
                        ? 'bg-rose-500/20 text-rose-300'
                        : act.priority === 'high'
                        ? 'bg-amber-500/20 text-amber-300'
                        : 'bg-zinc-800 text-zinc-400'
                    }`}>
                      {act.priority}
                    </span>
                  )}
                  {act.subtasks && act.subtasks.length > 0 && (
                    <span className="text-[10px] text-zinc-500 font-mono hidden sm:inline">
                      {act.subtasks.length} subtarefas
                    </span>
                  )}
                  {!isDone && (
                    <button
                      type="button"
                      onClick={() => onExecute(act, `${messageId}_${idx}`)}
                      className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 cursor-pointer transition-colors"
                    >
                      + Criar
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export const AgentActionsCollapsible: React.FC<{
  actions: ParsedAgentAction[]
  onOpenAgent: (agentId?: string) => void
}> = ({ actions, onOpenAgent }) => {
  const [isOpen, setIsOpen] = useState(false)
  const total = actions.length
  if (total === 0) return null
  const first = actions[0]

  return (
    <div className="my-1.5 text-xs">
      <div className="flex items-center gap-2 py-0.5 group">
        <button
          type="button"
          onClick={() => setIsOpen(o => !o)}
          className="flex items-center gap-1.5 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer text-xs select-none min-w-0"
        >
          <span className="truncate">
            {total === 1 ? `Criou agente "${first.name}" na equipe` : `Criou ${total} agentes na equipe`}
          </span>
          <ChevronRight className={`w-3 h-3 text-zinc-500 group-hover:text-zinc-400 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`} />
        </button>

        <button
          type="button"
          onClick={() => onOpenAgent(first.id)}
          className="text-[11px] text-zinc-500 hover:text-indigo-300 flex items-center gap-0.5 ml-auto shrink-0 transition-colors cursor-pointer"
        >
          <span>Abrir na equipe</span>
          <span>→</span>
        </button>
      </div>

      {isOpen && (
        <div className="mt-1 ml-1 pl-3 border-l border-zinc-800 space-y-2 py-1 max-h-56 overflow-y-auto custom-chat-scrollbar">
          {actions.map((act, idx) => (
            <div key={idx} className="text-[11px] space-y-1">
              <div className="flex items-center gap-1.5">
                <span>{act.icon || '🤖'}</span>
                <span className="font-medium text-zinc-200">{act.name}</span>
                {act.specialistRole && (
                  <span className="px-1 py-0.2 rounded text-[9px] font-mono bg-zinc-800 text-zinc-400">
                    {act.specialistRole}
                  </span>
                )}
              </div>
              {act.roleDescription && (
                <p className="text-zinc-400 text-[10px] leading-relaxed pl-5">{act.roleDescription}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export const WorkflowActionsCollapsible: React.FC<{
  actions: ParsedWorkflowAction[]
  onOpenWorkflow: (workflowId?: string) => void
}> = ({ actions, onOpenWorkflow }) => {
  const [isOpen, setIsOpen] = useState(false)
  const total = actions.length
  if (total === 0) return null
  const first = actions[0]
  const stagesCount = first.nodes?.length || 0

  return (
    <div className="my-1.5 text-xs">
      <div className="flex items-center gap-2 py-0.5 group">
        <button
          type="button"
          onClick={() => setIsOpen(o => !o)}
          className="flex items-center gap-1.5 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer text-xs select-none min-w-0"
        >
          <span className="truncate">
            {total === 1
              ? `Criou fluxo "${first.name}" (${stagesCount} etapas)`
              : `Criou ${total} fluxos no Flow Canvas`}
          </span>
          <ChevronRight className={`w-3 h-3 text-zinc-500 group-hover:text-zinc-400 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`} />
        </button>

        <button
          type="button"
          onClick={() => onOpenWorkflow(first.id)}
          className="text-[11px] text-zinc-500 hover:text-emerald-300 flex items-center gap-0.5 ml-auto shrink-0 transition-colors cursor-pointer"
        >
          <span>Abrir Flow</span>
          <span>→</span>
        </button>
      </div>

      {isOpen && (
        <div className="mt-1 ml-1 pl-3 border-l border-zinc-800 space-y-2 py-1 max-h-56 overflow-y-auto custom-chat-scrollbar">
          {actions.map((wf, idx) => (
            <div key={idx} className="text-[11px] space-y-1">
              <div className="font-medium text-zinc-200">{wf.name}</div>
              {wf.description && <p className="text-zinc-400 text-[10px]">{wf.description}</p>}
              {wf.nodes && wf.nodes.length > 0 && (
                <div className="flex flex-wrap items-center gap-1 pt-0.5">
                  {wf.nodes.map((node, ni) => (
                    <React.Fragment key={ni}>
                      <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-[10px] text-zinc-300">
                        {node.label || node.kind || `Nó ${ni + 1}`}
                      </span>
                      {ni < (wf.nodes?.length || 0) - 1 && <span className="text-zinc-600 text-[10px]">→</span>}
                    </React.Fragment>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export const SquadActionsCollapsible: React.FC<{
  actions: ParsedSquadAction[]
  onOpenSquad: (squadId?: string) => void
}> = ({ actions, onOpenSquad }) => {
  const [isOpen, setIsOpen] = useState(false)
  const total = actions.length
  if (total === 0) return null
  const first = actions[0]
  const membersCount = first.pipeline?.length || 0

  return (
    <div className="my-1.5 text-xs">
      <div className="flex items-center gap-2 py-0.5 group">
        <button
          type="button"
          onClick={() => setIsOpen(o => !o)}
          className="flex items-center gap-1.5 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer text-xs select-none min-w-0"
        >
          <span className="truncate">
            {total === 1
              ? `Criou squad "${first.name}" (${membersCount} especialistas)`
              : `Criou ${total} squads na equipe`}
          </span>
          <ChevronRight className={`w-3 h-3 text-zinc-500 group-hover:text-zinc-400 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`} />
        </button>

        <button
          type="button"
          onClick={() => onOpenSquad(first.id)}
          className="text-[11px] text-zinc-500 hover:text-amber-300 flex items-center gap-0.5 ml-auto shrink-0 transition-colors cursor-pointer"
        >
          <span>Abrir Squads</span>
          <span>→</span>
        </button>
      </div>

      {isOpen && (
        <div className="mt-1 ml-1 pl-3 border-l border-zinc-800 space-y-1.5 py-1 max-h-56 overflow-y-auto custom-chat-scrollbar">
          {actions.map((sq, idx) => (
            <div key={idx} className="text-[11px] space-y-1">
              <div className="font-medium text-zinc-200">{sq.name}</div>
              {sq.description && <p className="text-zinc-400 text-[10px]">{sq.description}</p>}
              {sq.pipeline && sq.pipeline.length > 0 && (
                <div className="space-y-0.5 pt-0.5">
                  {sq.pipeline.map((step, si) => (
                    <div key={si} className="text-[10px] text-zinc-400 flex items-center gap-1">
                      <span className="text-amber-400">#{si + 1}</span>
                      <span>{step.roleInSquad || step.agentId}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export interface QuickPreset {
  label: string
  prompt: string
  category: string
}

export const MASTER_QUICK_PRESETS: QuickPreset[] = [
  { label: '🔗 Conexões no Vault', prompt: 'Analise o contexto e sugira conexões semânticas com outras ideias do cofre, indicando links bidirecionais [[...]].', category: 'Conhecimento' },
  { label: '🧩 Mapa Conceitual', prompt: 'Crie um mapa mental conceitual com as ideias centrais presentes neste contexto.', category: 'Visual' },
  { label: '🏷️ Taxonomia & Tags', prompt: 'Sugira uma taxonomia de tags e categorias para organizar este material no cofre.', category: 'Organização' },
  { label: '📋 Resumo Executivo', prompt: 'Gere um resumo executivo em tópicos com os pontos mais importantes do contexto.', category: 'Síntese' },
  { label: '✨ Melhorar Redação', prompt: 'Reescreva e aprimore o texto do contexto com maior elegância, fluidez e clareza.', category: 'Escrita' },
  { label: '⚡ Criar Workflow', prompt: 'Crie um fluxo de trabalho visual estruturado no Flow Canvas para este objetivo.', category: 'Flow' },
  { label: '👥 Criar Squad', prompt: 'Crie um squad colaborativo com especialistas para executar este projeto em pipeline.', category: 'Equipe' },
  { label: '🎯 Decompor em Tarefas', prompt: 'Analise o contexto atual e crie um plano de execução estruturado com tarefas acionáveis e subtarefas detalhadas.', category: 'Projetos' }
]

export interface AgentConversation {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  specialtyId: string
  ruleMode?: string
  messages: ChatMessage[]
  linkedBoardId?: string
}

interface AiAssistantProps {
  vaultPath?: string
  currentNote?: Note
  allNotes: Note[]
  onConnectNote: (targetTitle: string) => void
  onAddTag: (tag: string) => void
  onInsertSnippet?: (snippet: string) => void
  onCreateNote?: (folder?: string, initialTitle?: string, initialContent?: string, type?: NoteType) => void
  onUpdateNote?: (note: Note) => void
  tasks?: TaskItem[]
  taskSettings?: TaskSettings
  activeBoardId?: string
  taskBoards?: TaskBoard[]
  onCreateTask?: (initialTitle?: string, initialData?: Partial<TaskItem>) => void
  onUpdateTask?: (task: TaskItem) => void
  onDeleteTask?: (taskId: string) => void
  onOpenTasks?: () => void
  teamAgents?: AgentProfileVersion[]
  multiAgentStore?: MultiAgentStoreState
  onUpdateAgentStore?: (nextStore: MultiAgentStoreState) => void
  onOpenTeamAgentsView?: () => void
  isConversationsOpen?: boolean
  onToggleConversations?: () => void
  onClose: () => void
}

export const AiAssistant: React.FC<AiAssistantProps> = ({
  vaultPath,
  currentNote,
  allNotes,
  onConnectNote,
  onAddTag: _onAddTag,
  onInsertSnippet,
  onCreateNote,
  onUpdateNote,
  tasks,
  taskSettings,
  activeBoardId,
  taskBoards = [],
  onCreateTask,
  onUpdateTask,
  onDeleteTask,
  onOpenTasks,
  teamAgents = [],
  multiAgentStore,
  onUpdateAgentStore,
  onOpenTeamAgentsView,
  isConversationsOpen: externalConversationsOpen,
  onToggleConversations,
  onClose
}) => {
  const vaultKey = useMemo(() => (vaultPath ? encodeURIComponent(vaultPath).replace(/%/g, '_') : 'default'), [vaultPath])
  const storageKeyConversations = `pyrite_ai_conversations_v2_${vaultKey}`
  const legacyStorageKeyConversations = `pyrita_ai_conversations_v2_${vaultKey}`
  const storageKeyActiveConvId = `pyrite_ai_active_conv_id_${vaultKey}`
  const legacyStorageKeyActiveConvId = `pyrita_ai_active_conv_id_${vaultKey}`
  const effectiveNote = currentNote || allNotes[0] || {
    id: 'vault-root',
    title: 'Meu Vault',
    content: '',
    folder: 'Início',
    tags: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  }

  // Resizable width state with localStorage persistence
  const [panelWidth, setPanelWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('pyrite_ai_width') || localStorage.getItem('pyrita_ai_width')
      return saved ? Number(saved) : 380
    } catch {
      return 380
    }
  })
  const [isDragging, setIsDragging] = useState(false)

  // AI Configuration Modal & Active Provider State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [activeProvider, setActiveProvider] = useState<string>('openrouter')
  const [activeModel, setActiveModel] = useState<string>('google/gemini-2.5-flash')
  const [hasActiveKey, setHasActiveKey] = useState<boolean>(false)
  const [isMultimodalActive, setIsMultimodalActive] = useState<boolean>(true)
  const [isGenerating, setIsGenerating] = useState<boolean>(false)
  const [autoApplyEdits, setAutoApplyEdits] = useState<boolean>(() => {
    try {
      return localStorage.getItem('pyrite_ai_auto_apply_edits') === 'true'
    } catch {
      return false
    }
  })

  // Local conversations sidebar open state
  const [isLocalConversationsOpen, setIsLocalConversationsOpen] = useState<boolean>(false)
  const showConversationsSidebar = externalConversationsOpen ?? isLocalConversationsOpen

  // Renaming state for conversations
  const [editingConvId, setEditingConvId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')

  // Selected Team Agent or Squad in Global Chat (OpenBot Agent/Squad Switcher)
  const [selectedTeamAgentId, setSelectedTeamAgentId] = useState<string>(() => {
    try {
      return localStorage.getItem('pyrite_ai_selected_team_agent_id') || ''
    } catch {
      return ''
    }
  })
  const [selectedSquadId, setSelectedSquadId] = useState<string>(() => {
    try {
      return localStorage.getItem('pyrite_ai_selected_squad_id') || ''
    } catch {
      return ''
    }
  })
  const [isTeamAgentMenuOpen, setIsTeamAgentMenuOpen] = useState(false)
  const teamAgentMenuRef = useRef<HTMLDivElement | null>(null)
  const selectedTeamAgent = useMemo(
    () => teamAgents.find(a => a.id === selectedTeamAgentId) || null,
    [teamAgents, selectedTeamAgentId]
  )
  const selectedSquad = useMemo(
    () => (multiAgentStore?.teams || []).find(s => s.id === selectedSquadId) || null,
    [multiAgentStore?.teams, selectedSquadId]
  )

  // Feedback notifications for 1-click actions
  const [insertedNotice, setInsertedNotice] = useState<string | null>(null)
  const [copiedNotice, setCopiedNotice] = useState<string | null>(null)
  const [toastNotice, setToastNotice] = useState<string | null>(null)
  const [executedTaskActions, setExecutedTaskActions] = useState<Record<string, boolean>>({})

  const navigateToTeamSection = (section: 'agents' | 'squads' | 'workflows', targetId?: string) => {
    try {
      localStorage.setItem('pyrite_myteam_active_section', section)
      if (section === 'agents' && targetId) {
        localStorage.setItem('pyrite_myteam_selected_agent_id', targetId)
      } else if (section === 'workflows' && targetId) {
        localStorage.setItem('pyrite_myteam_selected_workflow_id', targetId)
      } else if (section === 'squads' && targetId) {
        localStorage.setItem('pyrite_myteam_selected_team_id', targetId)
      }
      window.dispatchEvent(
        new CustomEvent('pyrite-open-team-item', {
          detail: {
            section,
            agentId: section === 'agents' ? targetId : undefined,
            workflowId: section === 'workflows' ? targetId : undefined,
            teamId: section === 'squads' ? targetId : undefined
          }
        })
      )
    } catch {}
    onOpenTeamAgentsView?.()
  }

  const handleExecuteTaskAction = (act: ParsedTaskAction, key: string) => {
    if (act.action === 'delete' && onDeleteTask) {
      const existing = tasks?.find(t => t.title.toLowerCase() === act.title.toLowerCase())
      if (existing) {
        onDeleteTask(existing.id)
        setExecutedTaskActions(prev => ({ ...prev, [key]: true }))
        return
      }
    }

    if (act.action === 'update' && onUpdateTask) {
      const existing = tasks?.find(t => t.title.toLowerCase() === act.title.toLowerCase())
      if (existing) {
        onUpdateTask({
          ...existing,
          priority: (act.priority as any) || existing.priority,
          deadline: act.deadline || existing.deadline,
          tags: act.tags?.length ? act.tags : existing.tags,
          description: act.description || existing.description,
          updatedAt: Date.now()
        })
        setExecutedTaskActions(prev => ({ ...prev, [key]: true }))
        return
      }
    }

    if (!onCreateTask) return
    const subtasksList: SubTask[] = (act.subtasks || []).map(stTitle => ({
      id: 'st_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6),
      title: stTitle,
      completed: false,
      createdAt: Date.now()
    }))

    const targetBoardId = act.boardId || activeConversation?.linkedBoardId || activeBoardId || 'default'
    onCreateTask(act.title, {
      priority: (act.priority as any) || 'medium',
      deadline: act.deadline,
      tags: act.tags || [],
      subtasks: subtasksList,
      description: act.description || '',
      boardId: targetBoardId
    })

    setExecutedTaskActions(prev => ({ ...prev, [key]: true }))
  }

  // Context Selection States (Note, Folder & Additional Tagged Notes)
  const [isNoteContextActive, setIsNoteContextActive] = useState<boolean>(true)
  const [selectedFolderContext, setSelectedFolderContext] = useState<string | null>(null)
  const [isFolderPickerOpen, setIsFolderPickerOpen] = useState(false)
  const [extraContextNotes, setExtraContextNotes] = useState<Note[]>([])

  // Autocomplete / Search Popups for '/' (skills) and '@' (notes)
  const [slashSearchOpen, setSlashSearchOpen] = useState(false)
  const [slashQuery, setSlashQuery] = useState('')
  const [atSearchOpen, setAtSearchOpen] = useState(false)
  const [atQuery, setAtQuery] = useState('')

  // Audio Recording State for Multimodal Models
  const [isRecording, setIsRecording] = useState(false)
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const recordingTimerRef = useRef<any>(null)

  const boardMenuRef = useRef<HTMLDivElement | null>(null)
  const folderPickerRef = useRef<HTMLDivElement | null>(null)
  const folderPopupRef = useRef<HTMLDivElement | null>(null)
  const [completionIndex, setCompletionIndex] = useState(0)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)

  // Conversations History State with localStorage persistence per vault
  const [conversations, setConversations] = useState<AgentConversation[]>(() => {
    try {
      const saved = localStorage.getItem(storageKeyConversations) || localStorage.getItem(legacyStorageKeyConversations) || (vaultKey === 'default' ? (localStorage.getItem('pyrite_ai_conversations_v2') || localStorage.getItem('pyrita_ai_conversations_v2')) : null)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed) && parsed.length > 0) return parsed
      }
    } catch {}
    return [
      {
        id: 'conv_initial',
        title: 'Conversa Inicial',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        specialtyId: 'architect',
        ruleMode: 'analyst',
        messages: [
          {
            id: 'm1',
            sender: 'ai',
            text: `Olá! Sou o **Agente de IA do Pyrite**.\n\nEstou pronto para analisar sua nota ativa e pastas selecionadas com raciocínio profundo.`
          }
        ]
      }
    ]
  })

  const [activeConversationId, setActiveConversationId] = useState<string>(() => {
    try {
      const savedId = localStorage.getItem(storageKeyActiveConvId) || localStorage.getItem(legacyStorageKeyActiveConvId) || (vaultKey === 'default' ? (localStorage.getItem('pyrite_ai_active_conv_id') || localStorage.getItem('pyrita_ai_active_conv_id')) : null)
      return savedId || conversations[0]?.id || 'conv_initial'
    } catch {
      return conversations[0]?.id || 'conv_initial'
    }
  })

  // Reload conversations when switching vaults
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKeyConversations) || localStorage.getItem(legacyStorageKeyConversations) || (vaultKey === 'default' ? (localStorage.getItem('pyrite_ai_conversations_v2') || localStorage.getItem('pyrita_ai_conversations_v2')) : null)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed) && parsed.length > 0) {
          setConversations(parsed)
          const savedId = localStorage.getItem(storageKeyActiveConvId) || localStorage.getItem(legacyStorageKeyActiveConvId) || (vaultKey === 'default' ? (localStorage.getItem('pyrite_ai_active_conv_id') || localStorage.getItem('pyrita_ai_active_conv_id')) : null)
          setActiveConversationId(savedId || parsed[0].id)
          return
        }
      }
    } catch {}

    const fresh: AgentConversation = {
      id: `conv_${Date.now()}`,
      title: 'Conversa Inicial',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      specialtyId: 'architect',
      ruleMode: 'analyst',
      messages: [
        {
          id: 'm1',
          sender: 'ai',
          text: `Olá! Sou o **Agente de IA do Pyrite**.\n\nEstou pronto para analisar sua nota ativa e pastas selecionadas com raciocínio profundo.`
        }
      ]
    }
    setConversations([fresh])
    setActiveConversationId(fresh.id)
  }, [storageKeyConversations, legacyStorageKeyConversations, storageKeyActiveConvId, legacyStorageKeyActiveConvId, vaultKey])

  // Synchronize active conversation with messages state
  const activeConversation = useMemo(() => {
    return conversations.find(c => c.id === activeConversationId) || conversations[0]
  }, [conversations, activeConversationId])

  const [isBoardMenuOpen, setIsBoardMenuOpen] = useState(false)

  const handleSetLinkedBoardId = (boardId: string | undefined) => {
    setConversations(prev =>
      prev.map(c => (c.id === activeConversationId ? { ...c, linkedBoardId: boardId, updatedAt: Date.now() } : c))
    )
  }

  const effectiveBoardId = activeConversation?.linkedBoardId || activeBoardId || 'default'
  const currentLinkedBoard = useMemo(() => {
    return taskBoards.find(b => b.id === effectiveBoardId)
  }, [taskBoards, effectiveBoardId])

  const messages = activeConversation?.messages || []

  const chatFeedRef = useRef<HTMLDivElement | null>(null)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const isNearBottomRef = useRef<boolean>(true)

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    if (chatFeedRef.current) {
      chatFeedRef.current.scrollTo({
        top: chatFeedRef.current.scrollHeight,
        behavior
      })
    } else if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior, block: 'end' })
    }
  }, [])

  const handleChatScroll = () => {
    if (!chatFeedRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = chatFeedRef.current
    isNearBottomRef.current = scrollHeight - scrollTop - clientHeight < 150
  }

  // Scroll immediately to bottom on mount and when conversation is selected/opened
  useEffect(() => {
    isNearBottomRef.current = true
    const scrollInstant = () => {
      scrollToBottom('auto')
    }
    scrollInstant()
    const raf = requestAnimationFrame(scrollInstant)
    const t1 = setTimeout(scrollInstant, 50)
    const t2 = setTimeout(scrollInstant, 150)
    const t3 = setTimeout(scrollInstant, 300)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
    }
  }, [activeConversationId, scrollToBottom])

  // Follow stream/messages smoothly when updated or generating
  useEffect(() => {
    if (chatFeedRef.current && (isNearBottomRef.current || isGenerating)) {
      chatFeedRef.current.scrollTop = chatFeedRef.current.scrollHeight
    }
  }, [messages, isGenerating])

  // Content resize and DOM mutation auto-scroll tracker
  useEffect(() => {
    const el = chatFeedRef.current
    if (!el) return

    const handleResize = () => {
      if (isNearBottomRef.current || isGenerating) {
        el.scrollTop = el.scrollHeight
      }
    }

    const observer = new ResizeObserver(handleResize)
    observer.observe(el)

    const mutationObserver = new MutationObserver(handleResize)
    mutationObserver.observe(el, { childList: true, subtree: true, characterData: true })

    return () => {
      observer.disconnect()
      mutationObserver.disconnect()
    }
  }, [isGenerating])

  const setMessages = (updateFn: (prev: ChatMessage[]) => ChatMessage[]) => {
    setConversations(prevConvs => {
      return prevConvs.map(c => {
        if (c.id === activeConversationId) {
          const newMessages = updateFn(c.messages)
          return {
            ...c,
            messages: newMessages,
            updatedAt: Date.now()
          }
        }
        return c
      })
    })
  }

  // Persist conversations to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(storageKeyConversations, JSON.stringify(conversations))
      localStorage.setItem(storageKeyActiveConvId, activeConversationId)
    } catch (err) {
      console.error('Failed to save conversations:', err)
    }
  }, [conversations, activeConversationId, storageKeyConversations, storageKeyActiveConvId])

  // New Conversation Creator
  const handleStartNewConversation = () => {
    const newConv: AgentConversation = {
      id: `conv_${Date.now()}`,
      title: 'Nova Conversa',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      specialtyId: selectedTeamAgentId || 'master',
      messages: [
        {
          id: `msg_${Date.now()}`,
          sender: 'ai',
          text: `Olá! Sou o Assistente Mestre do Pyrite. Como posso ajudar você agora? Digite uma pergunta, peça para criar ou editar notas, gerenciar tarefas, criar agentes ou fluxos visuais, use \`/\` para skills ou \`@\` para somar notas ao contexto.`
        }
      ]
    }
    setConversations(prev => [newConv, ...prev])
    setActiveConversationId(newConv.id)
    if (onToggleConversations && externalConversationsOpen) {
      onToggleConversations()
    } else {
      setIsLocalConversationsOpen(false)
    }
  }

  const handleDeleteConversation = (convId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setConversations(prev => {
      const remaining = prev.filter(c => c.id !== convId)
      if (remaining.length === 0) {
        const fresh: AgentConversation = {
          id: `conv_${Date.now()}`,
          title: 'Nova Conversa',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          specialtyId: selectedTeamAgentId || 'master',
          messages: [
            {
              id: `msg_${Date.now()}`,
              sender: 'ai',
              text: `Conversas anteriores excluídas. Iniciando novo chat.`
            }
          ]
        }
        setActiveConversationId(fresh.id)
        return [fresh]
      }
      if (activeConversationId === convId) {
        setActiveConversationId(remaining[0].id)
      }
      return remaining
    })
  }

  const handleStartRename = (conv: AgentConversation, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingConvId(conv.id)
    setEditingTitle(conv.title)
  }

  const handleSaveRename = (convId: string, e?: React.FormEvent | React.MouseEvent) => {
    if (e) e.stopPropagation()
    if (editingTitle.trim()) {
      setConversations(prev => prev.map(c => c.id === convId ? { ...c, title: editingTitle.trim() } : c))
    }
    setEditingConvId(null)
  }

  // Compute all available folders with note counts
  const folderList = useMemo(() => {
    const map = new Map<string, number>()
    for (const n of allNotes) {
      const f = n.folder?.trim() || 'Início'
      map.set(f, (map.get(f) || 0) + 1)
    }
    return Array.from(map.entries())
      .map(([folder, count]) => ({ folder, count }))
      .sort((a, b) => a.folder.localeCompare(b.folder))
  }, [allNotes])

  // Click outside listener for dropdown popovers
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (teamAgentMenuRef.current && !teamAgentMenuRef.current.contains(e.target as Node)) {
        setIsTeamAgentMenuOpen(false)
      }
      if (boardMenuRef.current && !boardMenuRef.current.contains(e.target as Node)) {
        setIsBoardMenuOpen(false)
      }
      if (folderPickerRef.current && !folderPickerRef.current.contains(e.target as Node) && !folderPopupRef.current?.contains(e.target as Node)) {
        setIsFolderPickerOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Refresh AI configuration from Electron safeStorage
  const refreshAiConfig = async () => {
    try {
      setAutoApplyEdits(localStorage.getItem('pyrite_ai_auto_apply_edits') === 'true')
    } catch {}
    if (!window.electronAPI?.aiGetAllConfigs) return
    try {
      const data = await window.electronAPI.aiGetAllConfigs()
      const p = (data.activeProvider || 'openrouter').toLowerCase()
      setActiveProvider(p)
      const pConfig = data.providers?.[p]
      if (pConfig) {
        setActiveModel(pConfig.model || 'google/gemini-2.5-flash')
        setHasActiveKey(p === 'ollama' ? true : !!pConfig.hasKey)
        setIsMultimodalActive(pConfig.multimodal !== undefined ? !!pConfig.multimodal : true)
      }
    } catch (err) {
      console.error('Failed to load AI config:', err)
    }
  }

  useEffect(() => {
    refreshAiConfig()
  }, [])

  const [input, setInput] = useState('')
  const [conversationFilter, setConversationFilter] = useState('')

  // Drag handler to resize chat width
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
    const startX = e.clientX
    const startWidth = panelWidth

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX
      const newWidth = Math.min(800, Math.max(290, startWidth + deltaX))
      setPanelWidth(newWidth)
    }

    const handleMouseUp = (upEvent: MouseEvent) => {
      setIsDragging(false)
      const deltaX = upEvent.clientX - startX
      const finalWidth = Math.min(800, Math.max(290, startWidth + deltaX))
      try {
        localStorage.setItem('pyrite_ai_width', String(finalWidth))
      } catch {}
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }

  // Audio Recording Handlers
  const handleStartAudioRecording = async () => {
    if (isRecording) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' })
        stream.getTracks().forEach(t => t.stop())

        const reader = new FileReader()
        reader.readAsDataURL(audioBlob)
        reader.onloadend = () => {
          const result = reader.result as string
          const base64Data = result.includes(',') ? result.split(',')[1] : result
          executePrompt('', base64Data)
        }
      }

      mediaRecorder.start()
      setIsRecording(true)
      setRecordingSeconds(0)

      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds(s => s + 1)
      }, 1000)
    } catch (err: any) {
      console.error('Audio recording failed:', err)
      alert('Não foi possível acessar o microfone: ' + (err.message || 'Permissão negada.'))
    }
  }

  const handleStopAudioRecording = () => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current)
      recordingTimerRef.current = null
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    setIsRecording(false)
  }

  const handleCancelAudioRecording = () => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current)
      recordingTimerRef.current = null
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.onstop = null
      mediaRecorderRef.current.stop()
      mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop())
    }
    audioChunksRef.current = []
    setIsRecording(false)
  }

  // Input change handler supporting `/` (skills) and `@` (notes context)
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value
    setInput(val)
    setCompletionIndex(0)

    // Check for trailing `@query`
    const atMatch = val.match(/@([a-zA-Z0-9\u00C0-\u017F\s_-]*)$/)
    if (atMatch) {
      setAtQuery(atMatch[1].trim())
      setAtSearchOpen(true)
      setSlashSearchOpen(false)
      return
    } else {
      setAtSearchOpen(false)
    }

    // Check for leading `/query`
    const slashMatch = val.match(/^\/([a-zA-Z0-9\u00C0-\u017F\s_-]*)$/)
    if (slashMatch) {
      setSlashQuery(slashMatch[1].trim())
      setSlashSearchOpen(true)
      setAtSearchOpen(false)
      return
    } else {
      setSlashSearchOpen(false)
    }
  }

  // Select an `@` note to inject into context
  const handleSelectAtNote = (note: Note) => {
    if (!extraContextNotes.some(n => n.id === note.id)) {
      setExtraContextNotes(prev => [...prev, note])
    }
    const cleaned = input.replace(/@([a-zA-Z0-9\u00C0-\u017F\s_-]*)$/, '').trim()
    setInput(cleaned)
    setAtSearchOpen(false)
    inputRef.current?.focus()
  }

  // Select a `/` skill or preset to run
  const handleSelectSlashItem = (promptText: string) => {
    setInput(promptText + '\n\n')
    setSlashSearchOpen(false)
    inputRef.current?.focus()
  }

  // Handler to apply proposed edit from DiffProposalCard
  const handleApplyProposedEdit = (messageId: string, edit: NoteEditAction) => {
    if (!onUpdateNote) return

    const target = (effectiveNote.title === edit.targetTitle)
      ? effectiveNote
      : allNotes.find(n => n.title === edit.targetTitle) || effectiveNote

    let newContent = target.content

    if (edit.type === 'patch') {
      const patchRes = applyPatches(target.content, edit.patches)
      newContent = patchRes.newContent
    } else if (edit.type === 'replace' && edit.replaceContent !== undefined) {
      newContent = edit.replaceContent
    }

    const isHtml = target.type === 'html' || target.filePath?.endsWith('.html') || target.filePath?.endsWith('.htm') || /<!DOCTYPE\s+html|<html/i.test(newContent)
    const isMind = !isHtml && (target.type === 'mindmap' || isMindMapContent(target.content) || isMindMapContent(newContent))

    const finalContent = isHtml
      ? sanitizeHtmlContent(newContent)
      : isMind
      ? serializeMindMapDocument(parseMindMapDocument(newContent, target.title))
      : newContent

    onUpdateNote({
      ...target,
      content: finalContent,
      type: isHtml ? 'html' : isMind ? 'mindmap' : target.type,
      updatedAt: Date.now()
    })

    setMessages(prev => prev.map(m => {
      if (m.id === messageId && m.proposedEdit) {
        return {
          ...m,
          proposedEdit: {
            ...m.proposedEdit,
            applied: true,
            discarded: false
          }
        }
      }
      return m
    }))

    const label = isHtml ? 'Arquivo HTML' : isMind ? 'Mapa Mental' : 'Nota'
    setToastNotice(`✨ ${label} "${target.title}" atualizado com sucesso!`)
    setTimeout(() => setToastNotice(null), 4000)
  }

  // Handler to discard proposed edit
  const handleDiscardProposedEdit = (messageId: string) => {
    setMessages(prev => prev.map(m => {
      if (m.id === messageId && m.proposedEdit) {
        return {
          ...m,
          proposedEdit: {
            ...m.proposedEdit,
            discarded: true
          }
        }
      }
      return m
    }))
  }

  // Interactive Vault Chat with Real LLM, Context Injection & Canvas Auto-Update
  const executePrompt = async (raw: string, audioBase64?: string) => {
    if ((!raw.trim() && !audioBase64) || isGenerating) return

    // Auto-name conversation on first user prompt if still default
    if (activeConversation.title === 'Nova Conversa' || activeConversation.title === 'Conversa Inicial') {
      const derivedTitle = raw.replace(/^[#@/\s]+/, '').slice(0, 30).trim() || (audioBase64 ? 'Mensagem de Áudio' : 'Conversa')
      setConversations(prev => prev.map(c => c.id === activeConversationId ? { ...c, title: derivedTitle } : c))
    }

    const userDisplayText = audioBase64
      ? (raw.trim() ? `🎙️ [Áudio]: ${raw.trim()}` : `🎙️ Mensagem de Áudio (${recordingSeconds || 2}s)`)
      : raw

    const userMsg: ChatMessage = {
      id: `msg_${Date.now()}`,
      sender: 'user',
      text: userDisplayText,
      isAudio: !!audioBase64
    }
    setMessages(prev => [...prev, userMsg])
    scrollToBottom('auto')

    // If an API key is configured (or ollama active) and Electron AI is available, execute real LLM call
    if (window.electronAPI?.aiChat && (hasActiveKey || activeProvider === 'ollama')) {
      setIsGenerating(true)
      const loadingId = `loading_${Date.now()}`
      setMessages(prev => [...prev, { id: loadingId, sender: 'ai', text: 'Pensando...' }])

      try {
        let contextBlock = ''

        // 1. Current Note Context (if enabled)
        if (isNoteContextActive && effectiveNote) {
          if (effectiveNote.type === 'mindmap' || isMindMapContent(effectiveNote.content)) {
            const mindMapDoc = parseMindMapDocument(effectiveNote.content, effectiveNote.title)
            const outline = mindMapToMarkdownOutline(mindMapDoc)
            contextBlock += `\n### NOTA ATIVA PRINCIPAL EM CONTEXTO (MAPA MENTAL INTERATIVO):
Título: "${effectiveNote.title}"
Pasta: ${effectiveNote.folder || 'Início'}
Tags: ${effectiveNote.tags?.join(', ') || 'mindmap'}
Tipo: Mapa Mental (Mind Map)
Estrutura Atual do Mapa em Formato Hierárquico:
---
${outline}
---
🚨 INSTRUÇÃO OBRIGATÓRIA PARA EDIÇÃO DESTE MAPA MENTAL:
- O usuário está com este mapa mental aberto na tela.
- Quando ele solicitar para adicionar tópicos, criar etapas, novos ramos, organizar ou expandir este mapa, você DEVE gerar a versão completa atualizada dentro do bloco:
  <<<REPLACE_NOTE>>>
  # ${cleanNodeTitle(effectiveNote.title)}
  ## 1ª Etapa (Ramo Principal)
    - 2ª Etapa (Subtópico)
      - 3ª Etapa (Detalhe/Ação)
  <<<END_REPLACE_NOTE>>>
- TABELA DE CORRESPONDÊNCIA DE ETAPAS:
  * NÓ INICIAL (Centro do Mapa)  -> 1 hashtag: # Tópico Central
  * 1ª ETAPA após o centro        -> 2 hashtags: ## Ramo Principal (OU traço sem recuo: - Ramo Principal)
  * 2ª ETAPA (Subtópicos)         -> 2 espaços de recuo:   - Subtópico (OU 3 hashtags: ### Subtópico)
  * 3ª ETAPA (Detalhes/Ações)     -> 4 espaços de recuo:     - Detalhe (OU 4 hashtags: #### Detalhe)
- REGRAS VITAIS DE SINTAXE:
  * NUNCA use 3 hashtags ('###') na 1ª etapa após o centro! O nó central já é '#'. A 1ª etapa após o centro é '##' (2 hashtags) ou '-'.
  * NUNCA misture traço com hashtag (ex: NUNCA faça '- ### Título' ou '* ### Título'). Se usar traço, escreva texto limpo: '- Título'.
  * NUNCA use asteriscos para definir etapas (ex: NUNCA faça '** Etapa' ou '*** Detalhe') e NUNCA use negrito ('**Título**').
  * Mantenha o '# Tópico Central' e a estrutura que o usuário já tinha, anexando as novas etapas nos ramos corretos.\n`
          } else if (effectiveNote.type === 'html' || effectiveNote.filePath?.endsWith('.html') || effectiveNote.filePath?.endsWith('.htm')) {
            contextBlock += `\n### ARQUIVO HTML ATIVO EM CONTEXTO (DOCUMENTO WEB INTERATIVO):
Título: "${effectiveNote.title}"
Arquivo: ${effectiveNote.filePath || `${effectiveNote.title}.html`}
Pasta: ${effectiveNote.folder || 'Início'}
Tags: ${effectiveNote.tags?.join(', ') || 'html, web'}
Tipo: Documento HTML5 (Renderizado em tempo real no app)
Código-Fonte Atual:
---
${effectiveNote.content || '<!-- Documento HTML vazio -->'}
---
🚨 REGRAS DE OURO PARA EDIÇÃO DESTE ARQUIVO HTML:
1. O usuário está com este arquivo HTML aberto na tela do Pyrite com editor Monaco e visualização ao vivo ao lado do chat.
2. PREFIRA SEMPRE EDIÇÃO CIRÚRGICA <<<PATCH_NOTE>>> (economiza tokens e edita apenas onde necessário):
   Para alterar textos, tags, botões, classes Tailwind, CSS, funções JS ou adicionar trechos pontuais, use:
   <<<PATCH_NOTE>>>
   <<<<<<< SEARCH
   trecho exato do código HTML existente
   =======
   novo trecho modificado
   >>>>>>>
   <<<END_PATCH_NOTE>>>
   Você pode incluir múltiplos blocos SEARCH / REPLACE dentro do mesmo <<<PATCH_NOTE>>> para editar diferentes partes.
3. Se o usuário pedir para reescrever toda a página do zero, criar um layout totalmente novo ou reestruturar o documento inteiro, use o código completo dentro do bloco:
   <<<REPLACE_NOTE>>>
   <!DOCTYPE html>
   <html lang="pt-BR">
   ... (código HTML completo)
   </html>
   <<<END_REPLACE_NOTE>>>
4. REGRA CRÍTICA DE CONTEÚDO:
   - NUNCA insira explicações, saudações ou comentários conversacionais dentro ou antes dos blocos <<<PATCH_NOTE>>> ou <<<REPLACE_NOTE>>> (qualquer texto fora de tags aparece na tela do projeto do usuário!).
   - NUNCA envolva o código em crases markdown (\`\`\`html) dentro dos blocos.
   - Suas explicações amigáveis sobre o que você alterou devem ficar SEMPRE FORA dos blocos, no chat.
5. O Pyrite detectará as alterações, salvará o arquivo e atualizará a visualização em tempo real!\n`
          } else {
            contextBlock += `\n### NOTA ATIVA PRINCIPAL EM CONTEXTO:
Título: "${effectiveNote.title}"
Pasta: ${effectiveNote.folder || 'Início'}
Tags: ${effectiveNote.tags?.join(', ') || 'nenhuma'}
Conteúdo da nota:
---
${effectiveNote.content || '(nota vazia)'}
---
🚨 INSTRUÇÕES MANDATÓRIAS PARA ALTERAR, EDITAR OU INSERIR CONTEÚDO NESTA NOTA:
1. NUNCA jogue o texto modificado nem reescreva a nota toda solta no chat!
2. Para alterações pontuais, correções, acréscimos de tópicos, mudanças de parágrafo ou inserções cirúrgicas:
   USE O BLOCO CIRÚRGICO <<<PATCH_NOTE>>> com SEARCH / REPLACE:
   <<<PATCH_NOTE>>>
   <<<<<<< SEARCH
   trecho exato do texto da nota que será modificado
   =======
   novo trecho com as alterações aplicadas
   >>>>>>>
   <<<END_PATCH_NOTE>>>
   O trecho SEARCH DEVE corresponder exatamente a um trecho existente no conteúdo da nota.
3. Se for uma reformulação completa ou se o usuário pedir para reescrever toda a nota do zero:
   USE O BLOCO:
   <<<REPLACE_NOTE>>>
   (todo o conteúdo novo da nota)
   <<<END_REPLACE_NOTE>>>
4. O Pyrite apresentará a alteração para aprovação do usuário com pré-visualização de diferenças (Diff) ou aplicará diretamente conforme as permissões configuradas. No chat, dê apenas uma breve explicação cordial do que você ajustou.\n`
          }
        }

        // 2. Extra Tagged Notes via `@`
        if (extraContextNotes.length > 0) {
          contextBlock += `\n### NOTAS ADICIONAIS VINCULADAS COMO CONTEXTO (@):\n`
          for (const en of extraContextNotes) {
            contextBlock += `\n--- NOTA CONTEXTUAL: [[${en.title}]] (Pasta: ${en.folder || 'Início'})\n${en.content.slice(0, 4000)}\n`
          }
          contextBlock += `\n---\n`
        }

        // 3. Folder Context (if selected)
        if (selectedFolderContext) {
          const folderNotes = allNotes.filter(
            n => (n.folder?.trim() || 'Início') === selectedFolderContext
          )
          contextBlock += `\n### PASTA COMPLETA EM CONTEXTO: "${selectedFolderContext}" (${folderNotes.length} notas no total)\nUse as informações e dados de todas as notas desta pasta para responder com profundidade e cruzamento de informações:\n`

          let charBudget = 22000
          for (const fn of folderNotes) {
            if (charBudget <= 0) break
            const snippet = fn.content.slice(0, 3500)
            charBudget -= snippet.length
            contextBlock += `\n--- NOTA DA PASTA: [[${fn.title}]] (Tags: ${fn.tags?.join(', ') || 'nenhuma'})\n${snippet}\n`
          }
          contextBlock += `\n---\n`
        }

        if (!isNoteContextActive && !selectedFolderContext && extraContextNotes.length === 0) {
          contextBlock += `\n(Nenhum contexto específico de nota ou pasta ativo no momento. Responda com base no conhecimento geral e visão geral do Vault).\n`
        }

        // Ingest active custom skills from localStorage
        let skillsDirectiveBlock = ''
        try {
          const savedCustomSkills = localStorage.getItem('pyrite_agent_custom_skills_v1') || localStorage.getItem('pyrita_agent_custom_skills_v1')
          if (savedCustomSkills) {
            const parsedCustomSkills: any[] = JSON.parse(savedCustomSkills)
            const activeCustomSkills = parsedCustomSkills.filter(s => s.enabled)
            if (activeCustomSkills.length > 0) {
              const skillTexts: string[] = []
              for (const sk of activeCustomSkills) {
                const filesContent = (sk.files || [])
                  .slice(0, 5)
                  .map((f: any) => `[Arquivo: ${f.name || f.path}]\n${f.content ? f.content.slice(0, 2000) : ''}`)
                  .join('\n\n')
                skillTexts.push(`### HABILIDADE / SKILL ATIVA: "${sk.name}"\nDescrição: ${sk.description || ''}\n${filesContent}`)
              }
              skillsDirectiveBlock = `\n${skillTexts.join('\n\n')}\n`
            }
          }
        } catch {}

        const ruleDirective = `REGRA DE OPERAÇÃO: CRIAÇÃO & EDIÇÃO TOTAL NO COFRE.
- Você é o Assistente Mestre e tem capacidade total de leitura, escrita e estruturação.
- A nota ativa pode ser lida, analisada, reescrita ou editada cirurgicamente quando o usuário solicitar.
- QUANDO O USUÁRIO SOLICITAR PARA MODIFICAR, EDITAR, ACRESCENTAR OU MELHORAR A NOTA OU ARQUIVO ATIVO:
  1. PREFIRA EDIÇÃO CIRÚRGICA <<<PATCH_NOTE>>> para alterações pontuais, correções ou acréscimos:
     <<<PATCH_NOTE>>>
     <<<<<<< SEARCH
     trecho original exato
     =======
     novo trecho modificado
     >>>>>>>
     <<<END_PATCH_NOTE>>>
  2. Use <<<REPLACE_NOTE>>> para mapas mentais ou quando o usuário solicitar expressamente reescrever a nota inteira do zero:
     <<<REPLACE_NOTE>>>
     (todo o conteúdo revisado aqui)
     <<<END_REPLACE_NOTE>>>
  O Pyrite irá detectar esses blocos e oferecer a proposta para aprovação do usuário com diff visual ou aplicar diretamente conforme a configuração de permissão. NUNCA imprima o conteúdo novo ou reescrito solto no chat!
- PARA NOTAS DO TIPO MAPA MENTAL (mindmap) - GUIA DE CRIAÇÃO E EDIÇÃO CORRETA:
  Dentro do bloco <<<REPLACE_NOTE>>>, forneça SEMPRE uma estrutura hierárquica em Markdown Outline rigorosamente formatada:
  1. TABELA DE CORRESPONDÊNCIA DE ETAPAS (SIGA ESTRITAMENTE):
     * NÓ INICIAL (Centro do Mapa)  -> 1 hashtag: # Tópico Central
     * 1ª ETAPA após o centro        -> 2 hashtags: ## Ramo Principal (OU traço sem recuo: - Ramo Principal)
     * 2ª ETAPA (Subtópicos)         -> 2 espaços de recuo:   - Subtópico (OU 3 hashtags: ### Subtópico)
     * 3ª ETAPA (Detalhes/Ações)     -> 4 espaços de recuo:     - Detalhe (OU 4 hashtags: #### Detalhe)
     * 4ª ETAPA (Sub-ações)          -> 6 espaços de recuo:       - Ação Detalhada
  2. REGRAS CRÍTICAS E PROIBIÇÕES VITAIS:
     * A 1ª ETAPA logo após o nó inicial DEVE SER '##' (2 hashtags) ou traço '-', NUNCA '###' (3 hashtags)! Usar 3 hashtags na 1ª etapa quebra a hierarquia da árvore.
     * NUNCA misture traço com hashtag (ex: PROIBIDO escrever '- ### Título' ou '* ### Título'). Se usar traço, escreva direto o texto: '- Título'.
     * NUNCA use asteriscos para definir etapas (ex: PROIBIDO '** Subtópico' ou '*** Detalhe'). Isso NÃO cria a etapa e faz os asteriscos ficarem colados no título do nó.
     * NUNCA use negrito com asteriscos nos títulos (ex: PROIBIDO '**Título**' ou '- **Etapa 1:**'). O editor gráfico já estiliza e formata os nós visualmente. Use sempre texto limpo: '- Etapa 1: Descrição'.
     * Use SEMPRE o hífen '-' como marcador de subtópicos, NUNCA o asterisco '*'.
  3. Checkboxes: use '- [ ] ' ou '- [x] ' para transformar qualquer nó em tarefa interativa.
  4. Exemplo correto de mapa mental:
     # Planejamento Estratégico
     ## Pesquisa de Mercado
       - Análise de Concorrentes
         - Mapeamento de Preços
         - Funcionalidades Principais
       - Entrevistas com Clientes
     ## Execução do Produto
       - [x] Especificação do MVP
       - [ ] Desenvolvimento Frontend
         - Tela de Login
         - Painel de Controle
       - [ ] Testes e Validação
         - Testes de Usabilidade
         - Homologação em Produção
- PARA ARQUIVOS DO TIPO HTML (.html):
  Dentro do bloco <<<REPLACE_NOTE>>>, forneça SEMPRE o código HTML completo atualizado de <!DOCTYPE html> até </html>, com tags semânticas, estilos Tailwind CDN / CSS e scripts.
  REGRA MANDATÓRIA: NUNCA coloque introduções, saudações, explicações ou crases de markdown (\`\`\`html) dentro do bloco <<<REPLACE_NOTE>>>. Apenas o código HTML puro que será executado e renderizado no app.
- REGRA CRÍTICA PARA CRIAÇÃO DE NOVAS NOTAS, MAPAS MENTAIS OU ARQUIVOS HTML:
  Sempre que o usuário pedir para CRIAR, GERAR, SALVAR ou MONTAR uma nova nota, documento, mapa mental ou página HTML (ex: "crie uma página html...", "crie uma landing page...", "crie uma nota sobre...", "gere um mapa mental..."):
  Você DEVE OBRIGATORIAMENTE emitir o bloco executável delimitado no formato exato:
  <<<CREATE_NOTE>>>
  Título: Nome da Página.html (ou Nome da Nota)
  Pasta: Início
  Tipo: html (ou note, ou mindmap)
  Conteúdo:
  (se for html: coloque EXCLUSIVAMENTE o código HTML completo de <!DOCTYPE html> até </html>, sem textos conversacionais e sem crases markdown)
  <<<END_CREATE_NOTE>>>
  NUNCA apenas diga no texto que vai criar sem emitir o bloco <<<CREATE_NOTE>>>, pois este bloco é o comando que cria o arquivo no cofre do usuário!
- Fora dos blocos delimitadores, explique resumidamente no chat o que foi gerado/aprimorado.`

        const specialtyBlock = selectedSquad
          ? (() => {
              const rawPipeline = selectedSquad.pipeline && selectedSquad.pipeline.length > 0
                ? selectedSquad.pipeline
                : selectedSquad.nodes.map((n, idx) => ({
                    id: `step_${n.agentId}`,
                    agentId: n.agentId,
                    roleInSquad: n.roleInTeam === 'coordinator' ? 'Coordenador & Líder' : `Especialista ${idx + 1}`,
                    order: idx + 1,
                    enabled: true,
                    expectedOutput: n.allowedOutputTypes?.[0] || 'text',
                    customPrompt: undefined
                  }))
              const pipeline = rawPipeline.filter(p => p.enabled !== false)
              return `ESQUADRÃO MULTIAGENTE ATIVO (MODO ESTEIRA COLABORATIVA):
Nome do Esquadrão: ${selectedSquad.name}
Missão / Objetivo: ${selectedSquad.objective || selectedSquad.description}
Total de Etapas na Esteira: ${pipeline.length}

SEQUÊNCIA DA ESTEIRA DE EXECUÇÃO:
${pipeline
  .map(p => {
    const ag = teamAgents.find(a => a.id === p.agentId)
    return `Etapa ${p.order}: [${ag?.name || 'Especialista'}] — Função: ${p.roleInSquad} | Saída: ${p.expectedOutput?.toUpperCase() || 'TEXTO'}${p.customPrompt ? `\n   -> Orientação específica da IA: ${p.customPrompt}` : ''}`
  })
  .join('\n')}

DIRETRIZ DE ORQUESTRAÇÃO DO ESQUADRÃO:
- Você é a inteligência coordenadora deste esquadrão multiagente.
- Processe o pedido do usuário executando o encadeamento das etapas acima para entregar um trabalho completo de ponta a ponta.
- Se o objetivo do esquadrão ou de alguma etapa envolver criar componentes web ou interfaces, gere o código HTML responsivo moderno e visualmente incrível em blocos de código html.
- Se o usuário pedir para gerar nota ou documento no cofre, gere o bloco <<<CREATE_NOTE>>>...<<<END_CREATE_NOTE>>>.
- Se houver tarefas e planos de ação a desdobrar, forneça os blocos de ação de tarefa formatados em json.\n`
            })()
          : selectedTeamAgent
          ? `AGENTE DA EQUIPE SELECIONADO PELO USUÁRIO (MODO OPENBOT):
Nome do Agente: ${selectedTeamAgent.name} (${selectedTeamAgent.icon || '🤖'})
Papel / Descrição: ${selectedTeamAgent.roleDescription}
Tom de Voz: ${selectedTeamAgent.workStyle.tone}
Regras de Trabalho Obrigatórias deste Agente:
${selectedTeamAgent.workStyle.rules.map(r => `- ${r}`).join('\n')}
Fontes Vinculadas Autorizadas (${selectedTeamAgent.knowledgeBindings.length}):
${selectedTeamAgent.knowledgeBindings
  .map(b => {
    const resolved = resolveNoteByIdOrFallback(allNotes, b.noteId, b.noteTitle, b.folderPath)
    return resolved
      ? `--- FONTE DO AGENTE [${b.role}]: [[${resolved.title}]] (${resolved.folder})\n${resolved.content.slice(0, 2800)}`
      : `- [${b.role}] ${b.noteTitle || b.folderPath || 'Fonte'}`
  })
  .join('\n\n')}\n`
          : ''

        const artifactsDirective = `DIRETRIZ CRUCIAL SOBRE ARTEFATOS CONCÊNTRICOS (:::kpi, :::timeline, :::comparison, :::card):
- USE COM PARCIMÔNIA E MODERAÇÃO EXTREMA.
- NÃO gere artefatos em conversas rotineiras, explicações conceituais normais ou respostas simples.
- Gere um bloco de artefato APENAS quando a informação for altamente estruturada e tiver real potencial e valor para ser adicionada como um componente visual dentro da nota do usuário (ex: métricas de desempenho para um KPI, etapas cronológicas reais para uma timeline, ou comparação estruturada de decisões).
- Quando a resposta for conceitual, analítica ou textual, responda com formatação Markdown normal limpa, sem blocos :::.
- Quando utilizar artefatos e fizer referências a notas do cofre dentro deles, utilize sempre a sintaxe de link bidirecional [[Nome da Nota]].`

        const currentBoardObj = (taskBoards || []).find(b => b.id === effectiveBoardId)
        const boardName = currentBoardObj?.name || 'Geral'

        const relevantTasks = tasks && tasks.length > 0
          ? tasks.filter(t => (t.boardId || 'default') === effectiveBoardId)
          : []

        const boardContextText = `Aba de tarefas ativa/vinculada a este chat: "${boardName}" (ID: "${effectiveBoardId}").`
        const allBoardsText = taskBoards && taskBoards.length > 0
          ? `Abas de tarefas cadastradas no cofre: ${taskBoards.map(b => `"${b.name}" (id: ${b.id})`).join(', ')}.`
          : ''

        const tasksSummary = relevantTasks.length > 0
          ? `Tarefas na aba "${boardName}" (${relevantTasks.length} tarefas):\n${relevantTasks.slice(0, 30).map(t => `- [${t.completed ? 'x' : ' '}] ${t.title} (Status: ${t.statusId}, Prioridade: ${t.priority}${t.deadline ? `, Prazo: ${t.deadline}` : ''}${t.subtasks && t.subtasks.length > 0 ? `, ${t.subtasks.filter(st => st.completed).length}/${t.subtasks.length} subtarefas` : ''})`).join('\n')}`
          : `Nenhuma tarefa cadastrada na aba "${boardName}" no momento.`

        const statusesList = taskSettings?.statuses?.length
          ? `Status disponíveis: ${taskSettings.statuses.map(s => s.name).join(', ')}.`
          : ''

        const tasksDirective = `DIRETRIZ DE GESTÃO DE PROJETOS E TAREFAS:
- Você é capaz de atuar como gestor de projetos do usuário: planejar entregas, analisar gargalos e decompor objetivos em tarefas acionáveis e subtarefas.
- ${boardContextText}
${allBoardsText ? `- ${allBoardsText}\n` : ''}${statusesList ? `- ${statusesList}\n` : ''}- Quando o usuário solicitar criar tarefas, planejar ou converter uma lista/tabela em tarefas, forneça blocos executáveis formatados com a sintaxe especial:
\`\`\`task-action
{
  "action": "create",
  "title": "Título conciso da tarefa",
  "priority": "high",
  "deadline": "2026-10-25",
  "tags": ["projeto", "foco"],
  "subtasks": ["Passo 1", "Passo 2", "Passo 3"],
  "description": "Breve detalhamento...",
  "boardId": "${effectiveBoardId}"
}
\`\`\`
- REGRA CRÍTICA DE FORMATO: As tarefas são cadastradas AUTOMATICAMENTE pelo Pyrite no projeto selecionado. Portanto, NUNCA replique ou duplique a lista exaustiva de tarefas nem construa tabelas gigantes no texto da resposta markdown do chat quando já incluir os blocos task-action. Forneça apenas um breve resumo executivo (1 a 3 frases) informando o que foi estruturado. O usuário verá as tarefas criadas em formato compacto de uma linha e diretamente no quadro do projeto.`

        const mindMapDirective = `DIRETRIZ DE OURO PARA MAPAS MENTAIS (MINDMAP):
- O Pyrite possui um motor gráfico próprio de mapas mentais interativos.
- A estrutura de um mapa mental é SEMPRE em Markdown Outline:
  # Tópico Central (Nó Inicial - 1 hashtag)
  ## 1ª Etapa (Ramos Principais - 2 hashtags OU traço '-' sem recuo)
    - 2ª Etapa (Subtópicos - 2 espaços de recuo com traço '-' OU 3 hashtags '###')
      - 3ª Etapa (Detalhes/Ações - 4 espaços de recuo com traço '-' OU 4 hashtags '####')
- REGRAS CRÍTICAS DE SINTAXE:
  * A 1ª ETAPA após o nó inicial DEVE SER '##' (2 hashtags) ou traço '-', NUNCA '###' (3 hashtags)!
  * NUNCA misture traço com hashtag (ex: NUNCA escreva '- ### Título').
  * NUNCA use asteriscos ('**', '***') para indicar etapas ou níveis de profundidade, e NUNCA envolva títulos em negrito ('**Título**'). Use apenas texto limpo precedido de traço '-' e indentação correta. O motor gráfico cuida de todo o design e peso visual dos nós.`

        const currentAgentsList = (multiAgentStore?.agents || []).map(
          a => `- ${a.icon || '🤖'} **${a.name}** (id: "${a.id}", função: "${a.specialistRole}"): ${a.roleDescription || a.workStyle?.tone || ''}`
        ).join('\n')

        const currentSquadsList = (multiAgentStore?.teams || []).map(
          t => `- 👥 **${t.name}** (id: "${t.id}"): ${t.description || t.objective || ''} (${t.pipeline?.length || t.nodes?.length || 0} membros)`
        ).join('\n')

        const currentWorkflowsList = (multiAgentStore?.workflows || []).map(
          w => `- ⚡ **${w.name}** (id: "${w.id}", status: "${w.status}"): ${w.description || ''} (${w.nodes?.length || 0} etapas)`
        ).join('\n')

        const ecosystemDirective = `PODERES DE MESTRE DO ASSISTENTE PYRITE (ORQUESTRADOR SUPREMO):
Você é o Assistente Mestre do Pyrite. Você tem visão e comando total sobre TODOS os recursos da ferramenta:
1. Notas e Documentos: notas markdown, mapas mentais interativos, diagramas/canvas e arquivos HTML nativos.
2. Projetos e Tarefas: tarefas, prazos, prioridades, tags e subtarefas em quadros kanban/listas.
3. Agentes Especialistas da Minha Equipe: você conhece todos os agentes, pode usar seus conhecimentos ou CRIAR NOVOS AGENTES especialistas sob demanda!
4. Squads / Equipes: você pode orquestrar e CRIAR novos squads colaborativos encadeando agentes em pipeline.
5. Workflows Visuais (Flow): você pode desenhar e CRIAR fluxos de trabalho visuais completos com nós interligados no canvas (entradas, agentes, chamadas diretas de IA, condições, aprovações humanas, criação de tarefas e entregáveis no cofre).

ECOSSISTEMA ATUAL CADASTRADO NO COFRE DO USUÁRIO:
[Agentes da Equipe]:
${currentAgentsList || 'Nenhum agente cadastrado ainda.'}

[Squads / Equipes de Agentes]:
${currentSquadsList || 'Nenhum squad cadastrado ainda.'}

[Fluxos de Trabalho / Workflows no Flow]:
${currentWorkflowsList || 'Nenhum workflow cadastrado ainda.'}

COMO CRIAR OU EDITAR RECURSOS VIA PROMPT:
Quando o usuário pedir para criar ou configurar um AGENTE ESPECIALISTA:
\`\`\`agent-action
{
  "action": "create",
  "name": "Nome Elegante do Agente",
  "icon": "🎯",
  "color": "#6366f1",
  "specialistRole": "proposal_specialist" | "knowledge_curator" | "project_planner" | "cartographer" | "diagram_designer" | "reviewer" | "coordinator" | "custom",
  "roleDescription": "Descrição das responsabilidades do agente",
  "systemDirective": "Instruções comportamentais detalhadas e diretivas de sistema do agente",
  "tone": "Profissional, analítico...",
  "rules": ["Regra 1", "Regra 2"]
}
\`\`\`

Quando o usuário pedir para criar um FLUXO DE TRABALHO (WORKFLOW) no Flow:
\`\`\`workflow-action
{
  "action": "create",
  "name": "Nome do Fluxo",
  "description": "Objetivo do fluxo...",
  "nodes": [
    {
      "id": "node_1",
      "kind": "input",
      "label": "Gatilho de Entrada",
      "config": { "triggerType": "manual" }
    },
    {
      "id": "node_2",
      "kind": "run_agent",
      "label": "Análise por Agente",
      "config": { "agentId": "id_do_agente_aqui" }
    },
    {
      "id": "node_3",
      "kind": "deliverable",
      "label": "Salvar Entrega",
      "config": {}
    }
  ],
  "edges": [
    { "sourceNodeId": "node_1", "targetNodeId": "node_2" },
    { "sourceNodeId": "node_2", "targetNodeId": "node_3" }
  ]
}
\`\`\`
(Kinds válidos de nós: input, read_note, run_agent, llm, condition, approval, create_task, manage_properties, deliverable, finish)

Quando o usuário pedir para criar um SQUAD (TIME DE AGENTES):
\`\`\`squad-action
{
  "action": "create",
  "name": "Nome do Squad",
  "description": "Objetivo do squad colaborativo",
  "coordinatorAgentId": "id_do_coordenador",
  "pipeline": [
    {
      "agentId": "id_do_agente_1",
      "roleInSquad": "Papel inicial",
      "customPrompt": "Instruções específicas para a etapa 1",
      "expectedOutput": "note"
    },
    {
      "agentId": "id_do_agente_2",
      "roleInSquad": "Revisão e Aprimoramento",
      "customPrompt": "Instruções específicas para a etapa 2",
      "expectedOutput": "note"
    }
  ]
}
\`\`\`

REGRA DE APRESENTAÇÃO LIMPA (PADRÃO GEMINI / ANTIGRAVITY):
O Pyrite executa e cadastra esses agentes, fluxos e squads AUTOMATICAMENTE e exibe cards recolhíveis elegantes de uma linha com botões de navegação direta.
Portanto, NUNCA repita os dados em tabelas massivas ou blocos de código redundantes no texto markdown. Seja conciso, executivo e acolhedor (1 a 4 frases), informando o que você criou e configurou e convidando o usuário a explorar no painel.`

        const systemPrompt = `Você é o Agente de IA do Pyrite, assistente de alto nível para gestão de conhecimento e pensamento (estilo Obsidian) com foco em produtividade e pensamento em rede.

${ecosystemDirective}

${specialtyBlock}
${ruleDirective}
${mindMapDirective}
${artifactsDirective}
${tasksDirective}
${skillsDirectiveBlock}
Contexto de Tarefas no Cofre:
${tasksSummary}

Contexto fornecido pelo usuário:
${contextBlock}

Outras notas disponíveis no cofre: ${allNotes.map(n => n.title).slice(0, 30).join(', ')}.

Diretrizes gerais:
- Responda em português brasileiro com clareza, concisão e utilidade extrema.
- Use formatação Markdown rica (títulos, listas, negrito, etc.).
- Quando fizer perguntas com opções ou alternativas para o usuário escolher com praticidade, utilize o bloco de botões nativo:
  :::buttons [Escolha uma opção]
  - Opção 1 | Prompt enviado ao clicar na Opção 1
  - Opção 2 | Prompt enviado ao clicar na Opção 2
  :::`

        const history = messages
          .filter(m => m.id !== loadingId && !m.text.startsWith('⚠️'))
          .slice(-6)
          .map(m => ({
            role: m.sender === 'user' ? 'user' : 'assistant',
            content: m.text
          }))

        // Prepare user payload: text or multimodal audio
        let userContent: any = raw
        if (audioBase64) {
          userContent = [
            {
              type: 'text',
              text: raw.trim() || 'Por favor, ouça a mensagem de áudio enviada pelo usuário e responda no contexto do Pyrite:'
            },
            {
              type: 'input_audio',
              input_audio: {
                data: audioBase64,
                format: 'wav'
              }
            }
          ]
        }

        const payloadMessages = [
          { role: 'system', content: systemPrompt },
          ...history,
          { role: 'user', content: userContent }
        ]

        const res = await window.electronAPI.aiChat({
          provider: activeProvider,
          model: activeModel,
          messages: payloadMessages,
          temperature: 0.7
        })

        setMessages(prev => prev.filter(m => m.id !== loadingId))

        if (res.success && res.text) {
          let responseText = res.text

          // Check for Note / HTML Edits (Surgical <<<PATCH_NOTE>>> or Full <<<REPLACE_NOTE>>>)
          let activeProposedEdit: NoteEditAction | undefined = undefined

          if (onUpdateNote) {
            const { displayText: parsedCleanText, patchAction } = parseNoteEditActions(
              responseText,
              effectiveNote.title,
              effectiveNote.type
            )

            let resolvedEdit = patchAction
            const isTargetHtml = effectiveNote.type === 'html' || effectiveNote.filePath?.endsWith('.html') || effectiveNote.filePath?.endsWith('.htm') || effectiveNote.title.toLowerCase().endsWith('.html')

            // Fallback for HTML documents if delimiters were omitted by the model:
            if (!resolvedEdit && isTargetHtml) {
              const htmlCodeBlockMatch = responseText.match(/```(?:html|htm)?\s*([\s\S]*?(?:<!DOCTYPE\s+html|<html)[\s\S]*?<\/html>[\s\S]*?)\s*```/i)
                || responseText.match(/(<!DOCTYPE\s+html[\s\S]*?<\/html>)/i)
                || responseText.match(/(<html[\s\S]*?<\/html>)/i)

              if (htmlCodeBlockMatch && htmlCodeBlockMatch[1] && htmlCodeBlockMatch[1].trim()) {
                resolvedEdit = {
                  id: `edit_${Date.now()}`,
                  type: 'replace',
                  targetTitle: effectiveNote.title,
                  targetType: 'html',
                  patches: [],
                  replaceContent: htmlCodeBlockMatch[1].trim(),
                  applied: false
                }
                responseText = responseText.replace(htmlCodeBlockMatch[0], '').trim()
              }
            }

            if (resolvedEdit) {
              if (autoApplyEdits) {
                // Direct Autonomous Apply Mode
                let updatedContent = effectiveNote.content
                if (resolvedEdit.type === 'patch') {
                  const patchRes = applyPatches(effectiveNote.content, resolvedEdit.patches)
                  updatedContent = patchRes.newContent
                } else if (resolvedEdit.type === 'replace' && resolvedEdit.replaceContent !== undefined) {
                  updatedContent = resolvedEdit.replaceContent
                }

                const isHtml = isTargetHtml || /<!DOCTYPE\s+html|<html/i.test(updatedContent)
                const isMind = !isHtml && (effectiveNote.type === 'mindmap' || isMindMapContent(effectiveNote.content) || isMindMapContent(updatedContent))
                const baseDoc = (!isHtml && (effectiveNote.type === 'mindmap' || isMindMapContent(effectiveNote.content)))
                  ? parseMindMapDocument(effectiveNote.content, effectiveNote.title)
                  : undefined

                const finalContent = isHtml
                  ? sanitizeHtmlContent(updatedContent)
                  : isMind
                  ? serializeMindMapDocument(parseMindMapDocument(updatedContent, effectiveNote.title, baseDoc))
                  : updatedContent

                onUpdateNote({
                  ...effectiveNote,
                  content: finalContent,
                  type: isHtml ? 'html' : isMind ? 'mindmap' : effectiveNote.type,
                  updatedAt: Date.now()
                })

                resolvedEdit.applied = true
                activeProposedEdit = resolvedEdit
                const label = isHtml ? 'Arquivo HTML' : isMind ? 'Mapa Mental' : 'Nota'
                setToastNotice(`✨ ${label} "${effectiveNote.title}" atualizado pelo Agente!`)
                setTimeout(() => setToastNotice(null), 4000)
              } else {
                // Draft / Suggestion Proposal Mode (Default - requests permission)
                resolvedEdit.applied = false
                activeProposedEdit = resolvedEdit
              }

              responseText = parsedCleanText
            }

            // Clean any leftover raw HTML code blocks from chat text
            if (isTargetHtml) {
              responseText = responseText.replace(/```(?:html|htm)?\s*<!DOCTYPE[\s\S]*?<\/html>\s*```/gi, '').trim()
              responseText = responseText.replace(/```(?:html|htm)?\s*<html[\s\S]*?<\/html>\s*```/gi, '').trim()
            }
          }

          // Check for Note / MindMap / HTML Creation <<<CREATE_NOTE>>>
          if (onCreateNote) {
            const createRegex = /<<<(?:CREATE_NOTE|create_note)>>>([\s\S]*?)(?:<<<(?:END_CREATE_NOTE|end_create_note)>>>|$)/i
            const codeBlockRegex = /```(?:create-note|create_note|note-action)\s*([\s\S]*?)\s*```/i

            let blockText: string | null = null
            let matchedRaw: string | null = null

            const match1 = responseText.match(createRegex)
            if (match1 && match1[1] && match1[1].trim()) {
              blockText = match1[1].trim()
              matchedRaw = match1[0]
            } else {
              const match2 = responseText.match(codeBlockRegex)
              if (match2 && match2[1] && match2[1].trim()) {
                blockText = match2[1].trim()
                matchedRaw = match2[0]
              }
            }

            // Fallback Intent Detection: user explicitly asked to create a note/html and AI responded with content without delimiters
            if (!blockText) {
              const userPromptLower = raw.toLowerCase()
              const userWantsHtml = /\b(?:html|p[áa]gina|pagina|site|landing\s*page|dashboard|web|jogo)\b/i.test(userPromptLower) && /<!DOCTYPE\s+html|<html/i.test(responseText)
              const userWantsNewNote = userWantsHtml || /\b(?:crie|criar|gere|gerar|salve|salvar|monte|montar|faça|fazer|desenvolva|desenvolver)\s+(?:uma\s+)?(?:nova\s+)?(?:nota|mapa|documento|p[áa]gina|pagina|site|landing|tela|dashboard|jogo|html)\b/i.test(userPromptLower)

              if (userWantsNewNote) {
                const headingMatch = responseText.match(/(?:^|\n)#\s+([^\n]+)/)
                const titleFieldMatch = responseText.match(/(?:^|\n)T[íi]tulo:\s*([^\n]+)/i)
                const titleTagMatch = responseText.match(/<title>([^<]+)<\/title>/i)
                const extractedTitle = (headingMatch ? headingMatch[1] : titleFieldMatch ? titleFieldMatch[1] : titleTagMatch ? titleTagMatch[1] : '').replace(/[\[\]]/g, '').trim()

                const isHtml = userWantsHtml || /<!DOCTYPE\s+html|<html/i.test(responseText)
                const noteTitle = extractedTitle || (isHtml ? 'Página Web' : '')

                if (noteTitle && responseText.length > 40) {
                  const isMind = !isHtml && (/\bmapa\b/i.test(userPromptLower) || isMindMapContent(responseText))
                  const cleanContent = responseText
                    .replace(/^(?:Claro[!,.]?|Com certeza[!,.]?|Vou criar[^\n]*|Aqui est[áa][^\n]*)\s*\n+/i, '')
                    .trim()

                  blockText = `Título: ${noteTitle}\nPasta: Início\nTipo: ${isHtml ? 'html' : isMind ? 'mindmap' : 'note'}\nConteúdo:\n${cleanContent}`
                }
              }
            }

            if (blockText) {
              let title = 'Novo Conteúdo'
              let folder = 'Início'
              let type = 'note'
              let content = blockText

              const titleM = blockText.match(/Título:\s*(.+)/i)
              if (titleM) title = titleM[1].trim()

              const folderM = blockText.match(/Pasta:\s*(.+)/i)
              if (folderM) folder = folderM[1].trim()

              const typeM = blockText.match(/Tipo:\s*(.+)/i)
              if (typeM) type = typeM[1].trim().toLowerCase()

              const contentM = blockText.match(/Conteúdo:\s*([\s\S]*)/i)
              if (contentM) content = contentM[1].trim()

              title = title.replace(/[\[\]]/g, '').trim() || 'Nova Nota'

              const isHtml = type === 'html' || title.toLowerCase().endsWith('.html') || title.toLowerCase().endsWith('.htm') || /<!DOCTYPE\s+html|<html/i.test(content)
              if (isHtml && (!title || title === 'Novo Conteúdo' || title === 'Nova Nota')) {
                const titleTagMatch = content.match(/<title>([^<]+)<\/title>/i)
                if (titleTagMatch && titleTagMatch[1] && titleTagMatch[1].trim()) {
                  title = titleTagMatch[1].trim()
                } else {
                  title = 'Página Web'
                }
              }
              if (isHtml && !title.toLowerCase().endsWith('.html') && !title.toLowerCase().endsWith('.htm')) {
                title = `${title}.html`
              }

              const isMind = !isHtml && (type === 'mindmap' || isMindMapContent(content))
              const finalContent = isHtml
                ? sanitizeHtmlContent(content)
                : isMind
                ? serializeMindMapDocument(parseMindMapDocument(content, title))
                : content

              onCreateNote(folder, title, finalContent, isHtml ? 'html' : isMind ? 'mindmap' : 'note')
              const label = isHtml ? 'Arquivo HTML' : isMind ? 'Mapa Mental' : 'Nota'
              setToastNotice(`✨ ${label} "${title}" criada com sucesso!`)
              setTimeout(() => setToastNotice(null), 4000)

              if (matchedRaw) {
                responseText = responseText.replace(
                  matchedRaw,
                  `> ✨ **${label} [[${title}]] criada com sucesso no seu cofre!**\n`
                ).trim()
              } else {
                responseText = `> ✨ **${label} [[${title}]] criada com sucesso no seu cofre!**\n\n` + responseText
              }

              // If it's an HTML file, clean any redundant raw HTML code blocks from chat
              if (isHtml) {
                responseText = responseText.replace(/```(?:html|htm)?\s*<!DOCTYPE[\s\S]*?<\/html>\s*```/gi, '').trim()
                responseText = responseText.replace(/```(?:html|htm)?\s*<html[\s\S]*?<\/html>\s*```/gi, '').trim()
              }
            }
          }

          const newAiId = `ai_${Date.now()}`
          const { taskActions: autoActions, agentActions: autoAgentActions, workflowActions: autoWfActions, squadActions: autoSquadActions } = parseMasterActions(responseText)
          if (autoActions.length > 0 && onCreateTask) {
            const targetBoardId = autoActions[0].boardId || activeConversation?.linkedBoardId || activeBoardId || 'default'
            const boardObj = taskBoards.find(b => b.id === targetBoardId)
            const targetBoardName = boardObj?.name || 'Geral'

            autoActions.forEach((act, idx) => {
              const key = `${newAiId}_${idx}`
              handleExecuteTaskAction(act, key)
            })

            setToastNotice(`✨ ${autoActions.length} ${autoActions.length === 1 ? 'tarefa criada' : 'tarefas criadas'} em "${targetBoardName}"!`)
            setTimeout(() => setToastNotice(null), 4000)
          }

          if (multiAgentStore && onUpdateAgentStore && (autoAgentActions.length > 0 || autoWfActions.length > 0 || autoSquadActions.length > 0)) {
            let nextStore = { ...multiAgentStore }

            // 1. Process agent actions
            for (const act of autoAgentActions) {
              const agentId = act.id || `agent-${act.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || Date.now()}`
              const existingAgent = nextStore.agents.find(a => a.id === agentId)
              const newAgent: AgentProfileVersion = {
                id: agentId,
                version: existingAgent ? existingAgent.version + 1 : 1,
                name: act.name,
                icon: act.icon || '🤖',
                color: act.color || '#6366f1',
                specialistRole: act.specialistRole || 'custom',
                roleDescription: act.roleDescription || `Especialista em ${act.name}`,
                workStyle: {
                  tone: act.tone || 'Profissional, objetivo e analítico',
                  rules: act.rules && act.rules.length > 0 ? act.rules : ['Operar com foco em resultados e qualidade máxima.'],
                  requiredQuestions: [],
                  guardrails: []
                },
                knowledgeBindings: existingAgent?.knowledgeBindings || [],
                allowedActions: ['read_context', 'prepare_draft', 'propose_patch', 'create_tasks'],
                deliverables: existingAgent?.deliverables || {
                  targetFolder: 'Agentes',
                  namingPattern: '{agente} - {data}',
                  outputTypes: ['note', 'tasks', 'mindmap', 'draw'],
                  requireApprovalForExisting: false
                },
                aiConfig: existingAgent?.aiConfig || { useDefault: true },
                limits: existingAgent?.limits || {
                  maxDurationSec: 180,
                  maxSteps: 10,
                  maxSubtasks: 6,
                  maxDelegationDepth: 2,
                  allowDelegation: true
                },
                triggerMode: 'on_demand',
                state: 'available',
                createdAt: existingAgent?.createdAt || Date.now(),
                updatedAt: Date.now()
              }
              nextStore = updateAgentProfileWithVersion(nextStore, newAgent)
              act.id = agentId
            }

            // 2. Process workflow actions
            for (const act of autoWfActions) {
              const wfId = act.id || `wf_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`
              const rawNodes = act.nodes || []
              const nodes: WorkflowNode[] = rawNodes.length > 0
                ? rawNodes.map((n, idx) => ({
                    id: n.id || `node_${idx + 1}`,
                    kind: (n.kind as WorkflowNodeKind) || (idx === 0 ? 'input' : idx === rawNodes.length - 1 ? 'deliverable' : 'run_agent'),
                    label: n.label || `Etapa ${idx + 1}`,
                    position: { x: 80 + idx * 260, y: 220 },
                    config: n.config || {}
                  }))
                : [
                    { id: 'n1', kind: 'input', label: 'Início', position: { x: 80, y: 220 }, config: { triggerType: 'manual' } },
                    { id: 'n2', kind: 'run_agent', label: 'Executar Agente', position: { x: 340, y: 220 }, config: {} },
                    { id: 'n3', kind: 'deliverable', label: 'Saída', position: { x: 600, y: 220 }, config: {} }
                  ]

              let edges: WorkflowEdge[] = act.edges && act.edges.length > 0
                ? act.edges.map((e, idx) => ({
                    id: e.id || `edge_${idx + 1}`,
                    sourceNodeId: e.sourceNodeId || nodes[Math.max(0, idx)]?.id || '',
                    targetNodeId: e.targetNodeId || nodes[Math.min(nodes.length - 1, idx + 1)]?.id || '',
                    branch: (e.branch as any) || 'default',
                    label: e.label
                  }))
                : nodes.slice(0, -1).map((curr, idx) => ({
                    id: `edge_${idx + 1}`,
                    sourceNodeId: curr.id,
                    targetNodeId: nodes[idx + 1].id,
                    branch: 'default'
                  }))

              const currentWfs = nextStore.workflows || []
              const existingWf = currentWfs.find(w => w.id === wfId)
              const newWf: WorkflowDefinition = {
                id: wfId,
                version: existingWf ? existingWf.version + 1 : 1,
                status: 'published',
                active: true,
                name: act.name,
                description: act.description || '',
                nodes,
                edges,
                createdAt: existingWf?.createdAt || Date.now(),
                updatedAt: Date.now()
              }

              const nextWorkflows = existingWf
                ? currentWfs.map(w => w.id === wfId ? newWf : w)
                : [newWf, ...currentWfs]
              nextStore = { ...nextStore, workflows: nextWorkflows }
              act.id = wfId
            }

            // 3. Process squad actions
            for (const act of autoSquadActions) {
              const squadId = act.id || `squad_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`
              const pipeline: SquadPipelineStep[] = (act.pipeline || []).map((step, idx) => ({
                id: `step_${idx + 1}`,
                agentId: step.agentId || nextStore.agents[0]?.id || 'agent-proposal-specialist',
                roleInSquad: step.roleInSquad || `Etapa ${idx + 1}`,
                order: idx,
                enabled: true,
                customPrompt: step.customPrompt || '',
                expectedOutput: step.expectedOutput || 'note'
              }))

              const coordinatorId = act.coordinatorAgentId || pipeline[0]?.agentId || nextStore.agents[0]?.id || 'agent-team-coordinator'

              const nodes: TeamMemberNode[] = pipeline.map((step, idx) => ({
                id: `member_${idx + 1}`,
                agentId: step.agentId,
                position: { x: 100 + idx * 260, y: 200 },
                roleInTeam: idx === 0 ? 'coordinator' : 'specialist',
                contextScope: ['request_context', 'project_context'],
                allowedOutputTypes: ['note', 'tasks']
              }))

              const edges: TeamEdge[] = nodes.slice(0, -1).map((curr, idx) => ({
                id: `edge_${idx + 1}`,
                sourceNodeId: curr.id,
                targetNodeId: nodes[idx + 1].id,
                relation: 'delegates_to'
              }))

              const currentTeams = nextStore.teams || []
              const existingTeam = currentTeams.find(t => t.id === squadId)
              const newTeam: TeamDefinition = {
                id: squadId,
                version: existingTeam ? existingTeam.version + 1 : 1,
                name: act.name,
                description: act.description || '',
                objective: act.objective || act.description || '',
                coordinatorAgentId: coordinatorId,
                nodes,
                edges,
                pipeline,
                maxParallelSubtasks: 3,
                createdAt: existingTeam?.createdAt || Date.now(),
                updatedAt: Date.now()
              }

              const nextTeams = existingTeam
                ? currentTeams.map(t => t.id === squadId ? newTeam : t)
                : [newTeam, ...currentTeams]
              nextStore = { ...nextStore, teams: nextTeams }
              act.id = squadId
            }

            onUpdateAgentStore(nextStore)

            const createdParts: string[] = []
            if (autoAgentActions.length > 0) createdParts.push(`${autoAgentActions.length} ${autoAgentActions.length === 1 ? 'agente' : 'agentes'}`)
            if (autoWfActions.length > 0) createdParts.push(`${autoWfActions.length} ${autoWfActions.length === 1 ? 'fluxo' : 'fluxos'}`)
            if (autoSquadActions.length > 0) createdParts.push(`${autoSquadActions.length} ${autoSquadActions.length === 1 ? 'squad' : 'squads'}`)
            setToastNotice(`✨ Ecossistema atualizado: ${createdParts.join(', ')} criados com sucesso!`)
            setTimeout(() => setToastNotice(null), 4500)
          }

          setMessages(prev => [...prev, { id: newAiId, sender: 'ai', text: responseText, proposedEdit: activeProposedEdit }])
        } else {
          setMessages(prev => [
            ...prev,
            {
              id: `ai_${Date.now()}`,
              sender: 'ai',
              text: `⚠️ **Erro na resposta do provedor (${activeProvider.toUpperCase()}):**\n${res.error || 'Falha ao processar solicitação.'}\n\n*Clique no ícone de configurações acima para ajustar modelo ou chave.*`,
              isActionable: true
            }
          ])
        }
      } catch (err: any) {
        setMessages(prev => prev.filter(m => m.id !== loadingId))
        setMessages(prev => [
          ...prev,
          {
            id: `ai_${Date.now()}`,
            sender: 'ai',
            text: `⚠️ **Erro de conexão:** ${err.message || 'Não foi possível contatar o provedor.'}`
          }
        ])
      } finally {
        setIsGenerating(false)
      }
      return
    }

    // Fallback: If a Team Agent is selected and no API key is configured, run the deterministic Multi-Agent Engine!
    if (selectedTeamAgent && multiAgentStore) {
      setIsGenerating(true)
      try {
        const activeTeam = (multiAgentStore.teams || []).find(t =>
          t.nodes.some(n => n.agentId === selectedTeamAgent.id)
        )
        const activeProj = multiAgentStore.projects[0] || undefined
        const run = await executeAgentRun({
          agent: selectedTeamAgent,
          allAgents: multiAgentStore.agents,
          teamDefinition: activeTeam,
          allNotes,
          allProjects: multiAgentStore.projects,
          projectContext: activeProj,
          prompt: raw,
          extraRequestNotes: isNoteContextActive && effectiveNote?.id ? [effectiveNote] : [],
          isTestRun: false
        })
        const outputMd = run.changeSet?.operations[0]?.contentPreview || ''
        const replyMarkdown = run.clarifyingQuestions?.length
          ? `### ❓ Perguntas de Esclarecimento (${selectedTeamAgent.name})\n\n${run.clarifyingQuestions.map(q => `- **${q}**`).join('\n')}\n\n---\n\n${outputMd}`
          : outputMd || `Execução concluída por **${selectedTeamAgent.name}**.`
        setMessages(prev => [
          ...prev,
          {
            id: `ai_${Date.now()}`,
            sender: 'ai',
            text: replyMarkdown
          }
        ])
      } catch (err: any) {
        setMessages(prev => [
          ...prev,
          {
            id: `ai_${Date.now()}`,
            sender: 'ai',
            text: `⚠️ **Erro ao executar ${selectedTeamAgent.name}:** ${err?.message || 'Falha interna.'}`
          }
        ])
      } finally {
        setIsGenerating(false)
      }
      return
    }

    // Fallback: If no API key configured
    setTimeout(() => {
      setMessages(prev => [
        ...prev,
        {
          id: `ai_${Date.now()}`,
          sender: 'ai',
          text: `Chave de API do **${activeProvider.toUpperCase()}** não está configurada.\n\nConfigure sua chave no ícone de configurações para conversar com a IA em tempo real, ou selecione um **Agente da Minha Equipe** no topo deste chat para conversar diretamente usando o motor local do cofre!`,
          isActionable: true
        }
      ])
    }, 300)
  }

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isGenerating) return
    const text = input.trim()
    setInput('')
    setSlashSearchOpen(false)
    setAtSearchOpen(false)
    executePrompt(text)
  }


  // Filtered notes for `@` autocomplete
  const filteredAtNotes = useMemo(() => {
    if (!atSearchOpen) return []
    const q = atQuery.toLowerCase()
    return allNotes
      .filter(n => n.title.toLowerCase().includes(q) || (n.folder && n.folder.toLowerCase().includes(q)))
      .slice(0, 6)
  }, [allNotes, atQuery, atSearchOpen])

  // Filtered skills and presets for `/` autocomplete
  const filteredSlashItems = useMemo(() => {
    if (!slashSearchOpen) return []
    const q = slashQuery.toLowerCase()
    const list: { label: string; prompt: string; category: string }[] = []

    for (const p of MASTER_QUICK_PRESETS) {
      if (p.label.toLowerCase().includes(q) || p.prompt.toLowerCase().includes(q)) {
        list.push({ label: p.label, prompt: p.prompt, category: p.category })
      }
    }

    // Include custom skills
    try {
      const savedCustomSkills = localStorage.getItem('pyrite_agent_custom_skills_v1') || localStorage.getItem('pyrita_agent_custom_skills_v1')
      if (savedCustomSkills) {
        const parsed: any[] = JSON.parse(savedCustomSkills)
        for (const sk of parsed) {
          if (sk.name.toLowerCase().includes(q) || (sk.description && sk.description.toLowerCase().includes(q))) {
            list.push({
              label: `📁 ${sk.name}`,
              prompt: `Aplicar habilidade "${sk.name}": analise o contexto conforme esta especialidade e seus arquivos.`,
              category: 'Custom Skill'
            })
          }
        }
      }
    } catch {}

    return list.slice(0, 8)
  }, [slashSearchOpen, slashQuery])

  // Filtered conversations list for the drawer
  const filteredConversations = useMemo(() => {
    if (!conversationFilter.trim()) return conversations
    const q = conversationFilter.toLowerCase()
    return conversations.filter(c => c.title.toLowerCase().includes(q))
  }, [conversations, conversationFilter])

  return (
    <div
      style={{ width: `${panelWidth}px` }}
      className="app-ai-assistant-panel my-2 mx-1.5 bg-[#0e0e12] border border-zinc-800/80 rounded-2xl flex flex-col select-none shrink-0 text-xs z-10 relative overflow-hidden shadow-2xl shadow-black/50"
    >
      {/* Toast Notification Banner (e.g. Note updated as canvas) */}
      {toastNotice && (
        <div className="absolute top-11 left-3 right-3 z-50 bg-[var(--accent)] text-zinc-950 px-3 py-2 rounded-xl font-semibold text-xs shadow-xl flex items-center justify-between animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-1.5 truncate">
            <Sparkles className="w-4 h-4 shrink-0" />
            <span className="truncate">{toastNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setToastNotice(null)}
            className="text-zinc-950 hover:opacity-75 cursor-pointer ml-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* 1. TOP HEADER: AGENT / SQUAD SELECTOR & ACTION ICONS */}
      <div className="h-10 px-3 border-b border-zinc-800/80 bg-[#0e0e12] flex items-center justify-between shrink-0 gap-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          {/* OpenBot Team Agent / Squad Selector: Talk to any agent or squad right inside the global chat */}
          {((teamAgents && teamAgents.length > 0) || (multiAgentStore?.teams && multiAgentStore.teams.length > 0)) && (
            <div ref={teamAgentMenuRef} className="relative min-w-0 max-w-[140px]">
              <button
                type="button"
                onClick={() => setIsTeamAgentMenuOpen(o => !o)}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border text-xs transition-all cursor-pointer shadow-sm max-w-[140px] overflow-hidden ${
                  selectedSquad || selectedTeamAgent
                    ? 'bg-[var(--accent)]/15 border-[var(--accent)]/40 text-[var(--accent)] font-semibold'
                    : 'bg-zinc-900 border-zinc-700/70 hover:border-zinc-500 text-zinc-200'
                }`}
              >
                {selectedSquad ? (
                  <div className="w-3.5 h-3.5 text-[var(--accent)] shrink-0 flex items-center justify-center">
                    {renderDynamicIcon(selectedSquad.icon || 'Users', 'w-3.5 h-3.5 text-[var(--accent)]')}
                  </div>
                ) : selectedTeamAgent ? (
                  <AgentIcon variant={selectedTeamAgent.icon} size={15} className="shrink-0 rounded-xs" />
                ) : (
                  <span className="text-xs leading-none">✨</span>
                )}
                <span className="truncate text-[11px] min-w-0 flex-1">
                  {selectedSquad ? selectedSquad.name : selectedTeamAgent ? selectedTeamAgent.name : 'Agente Geral'}
                </span>
                {selectedSquad && (
                  <span className="text-[9px] px-1 rounded bg-[var(--accent)]/20 text-[var(--accent)] shrink-0 font-mono">
                    Eq
                  </span>
                )}
                <ChevronDown className="w-3 h-3 text-zinc-500 shrink-0" />
              </button>

              {isTeamAgentMenuOpen && (
                <div className="absolute top-9 left-0 z-50 w-72 bg-[#101117] border border-zinc-700/80 rounded-xl p-1.5 shadow-2xl space-y-1.5 animate-in fade-in zoom-in-95 duration-100">
                  <div className="px-2 py-1 text-[10px] font-mono text-zinc-400 border-b border-zinc-800 flex items-center justify-between">
                    <span>SELECIONAR DESTINATÁRIO</span>
                    {onOpenTeamAgentsView && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsTeamAgentMenuOpen(false)
                          onOpenTeamAgentsView()
                        }}
                        className="text-[10px] text-[var(--accent)] hover:underline cursor-pointer"
                      >
                        Abrir Equipe →
                      </button>
                    )}
                  </div>

                  {/* 1. Assistente Geral */}
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedTeamAgentId('')
                      setSelectedSquadId('')
                      try {
                        localStorage.setItem('pyrite_ai_selected_team_agent_id', '')
                        localStorage.setItem('pyrite_ai_selected_squad_id', '')
                      } catch {}
                      setIsTeamAgentMenuOpen(false)
                    }}
                    className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center justify-between text-xs transition-colors cursor-pointer ${
                      !selectedTeamAgent && !selectedSquad
                        ? 'bg-[var(--accent)]/15 border border-[var(--accent)]/30 text-white font-semibold'
                        : 'text-zinc-300 hover:bg-zinc-850'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span>✨</span>
                      <div className="truncate">
                        <div className="truncate text-[11px]">Assistente Geral do Cofre</div>
                        <div className="text-[9px] text-zinc-500 truncate">Especialidades & Co-Autor</div>
                      </div>
                    </div>
                    {!selectedTeamAgent && !selectedSquad && <Check className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />}
                  </button>

                  <div className="max-h-64 overflow-y-auto space-y-2 pr-0.5 custom-scrollbar">
                    {/* 2. Seção Esquadrões */}
                    {multiAgentStore?.teams && multiAgentStore.teams.length > 0 && (
                      <div className="space-y-0.5">
                        <div className="px-2 pt-1 pb-0.5 text-[9.5px] font-mono uppercase text-zinc-500 tracking-wider">
                          Esquadrões ({multiAgentStore.teams.length})
                        </div>
                        {multiAgentStore.teams.map(sq => {
                          const isCur = selectedSquad?.id === sq.id
                          const stepCount = sq.pipeline?.length || sq.nodes?.length || 0
                          return (
                            <button
                              key={sq.id}
                              type="button"
                              onClick={() => {
                                setSelectedSquadId(sq.id)
                                setSelectedTeamAgentId('')
                                try {
                                  localStorage.setItem('pyrite_ai_selected_squad_id', sq.id)
                                  localStorage.setItem('pyrite_ai_selected_team_agent_id', '')
                                } catch {}
                                setIsTeamAgentMenuOpen(false)
                              }}
                              className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center justify-between text-xs transition-colors cursor-pointer ${
                                isCur
                                  ? 'bg-[var(--accent)]/15 border border-[var(--accent)]/30 text-white font-semibold'
                                  : 'text-zinc-300 hover:bg-zinc-850'
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="w-5 h-5 rounded-md bg-zinc-800 flex items-center justify-center text-zinc-300 shrink-0">
                                  {renderDynamicIcon(sq.icon || 'Users', 'w-3 h-3 text-zinc-300')}
                                </div>
                                <div className="min-w-0">
                                  <div className="truncate text-[11px] text-zinc-100">{sq.name}</div>
                                  <div className="truncate text-[9px] text-zinc-500">Esteira com {stepCount} especialistas</div>
                                </div>
                              </div>
                              {isCur && <Check className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />}
                            </button>
                          )
                        })}
                      </div>
                    )}

                    {/* 3. Seção Agentes Individuais */}
                    {teamAgents && teamAgents.length > 0 && (
                      <div className="space-y-0.5">
                        <div className="px-2 pt-1 pb-0.5 text-[9.5px] font-mono uppercase text-zinc-500 tracking-wider">
                          Agentes Individuais ({teamAgents.length})
                        </div>
                        {teamAgents.map(ag => {
                          const isCur = selectedTeamAgent?.id === ag.id && !selectedSquad
                          return (
                            <button
                              key={ag.id}
                              type="button"
                              onClick={() => {
                                setSelectedTeamAgentId(ag.id)
                                setSelectedSquadId('')
                                try {
                                  localStorage.setItem('pyrite_ai_selected_team_agent_id', ag.id)
                                  localStorage.setItem('pyrite_ai_selected_squad_id', '')
                                } catch {}
                                setIsTeamAgentMenuOpen(false)
                              }}
                              className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center justify-between text-xs transition-colors cursor-pointer ${
                                isCur
                                  ? 'bg-[var(--accent)]/15 border border-[var(--accent)]/30 text-white font-semibold'
                                  : 'text-zinc-300 hover:bg-zinc-850'
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <AgentIcon variant={ag.icon} size={18} className="shrink-0 rounded-xs" />
                                <div className="min-w-0">
                                  <div className="truncate text-[11px] text-zinc-100">{ag.name}</div>
                                  <div className="truncate text-[9px] text-zinc-500">{ag.roleDescription}</div>
                                </div>
                              </div>
                              {isCur && <Check className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Action Buttons: Conversations Drawer Toggle, Settings Icon, Close */}
        <div className="flex items-center gap-0.5">
          {/* Toggle Conversations History Drawer */}
          <button
            type="button"
            onClick={() => {
              if (onToggleConversations) {
                onToggleConversations()
              } else {
                setIsLocalConversationsOpen(o => !o)
              }
            }}
            className={`p-1.5 rounded-md transition-colors cursor-pointer ${
              showConversationsSidebar
                ? 'bg-[var(--accent)]/20 text-[var(--accent)] border border-[var(--accent)]/40'
                : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60'
            }`}
            title="Histórico de Conversas (ChatGPT / Gemini style)"
          >
            <MessageSquare className="w-3.5 h-3.5" />
          </button>

          {/* Settings Icon Only (No model name in header) */}
          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60 rounded-md transition-colors cursor-pointer relative"
            title="Configurações do Agente (Modelos, Especialidades, Skills)"
          >
            <Settings className="w-3.5 h-3.5" />
            {hasActiveKey || activeProvider === 'ollama' ? (
              <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.8)]" title="Chave configurada e ativa" />
            ) : (
              <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-amber-400" title="Chave não configurada" />
            )}
          </button>

          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 rounded-md transition-colors cursor-pointer"
            title="Fechar Agente"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 2. CONVERSATIONS DRAWER OVERLAY (ChatGPT / Gemini Style with Edit Title) */}
      {showConversationsSidebar && (
        <div className="chat-conversations-drawer absolute inset-0 top-10 z-40 bg-[#0e0f14]/95 backdrop-blur-md flex flex-col p-3 border-r border-zinc-800/90 animate-in fade-in slide-in-from-left duration-200">
          <div className="flex items-center justify-between pb-2 border-b border-zinc-800/70 mb-2">
            <div className="flex items-center gap-1.5">
              <MessageSquare className="w-4 h-4 text-[var(--accent)]" />
              <span className="font-semibold text-zinc-200 text-xs">Conversas Salvas</span>
            </div>
            <button
              type="button"
              onClick={handleStartNewConversation}
              className="px-2.5 py-1 font-bold rounded-lg text-[10px] flex items-center gap-1 cursor-pointer shadow-xs transition-all hover:bg-[var(--accent-glow)]"
              style={{
                backgroundColor: 'var(--accent-glow-subtle, rgba(197, 155, 39, 0.12))',
                color: 'var(--accent, #d4af37)'
              }}
            >
              <Plus className="w-3 h-3 stroke-[3]" />
              <span>Nova Conversa</span>
            </button>
          </div>

          {/* Search conversation */}
          <div className="relative mb-2">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-2" />
            <input
              type="text"
              value={conversationFilter}
              onChange={(e) => setConversationFilter(e.target.value)}
              placeholder="Buscar histórico..."
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-8 pr-2 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-[var(--accent)]/50"
            />
          </div>

          {/* Conversations List */}
          <div className="flex-1 overflow-y-auto space-y-1 custom-chat-scrollbar pr-0.5">
            {filteredConversations.length === 0 ? (
              <div className="text-center py-6 text-zinc-500 text-[11px]">
                Nenhuma conversa encontrada.
              </div>
            ) : (
              filteredConversations.map(conv => {
                const isCur = conv.id === activeConversationId
                const isEditing = editingConvId === conv.id

                if (isEditing) {
                  return (
                    <div
                      key={conv.id}
                      onClick={e => e.stopPropagation()}
                      className="p-1.5 rounded-xl bg-zinc-900 border border-[var(--accent)]/50 flex items-center gap-1"
                    >
                      <input
                        autoFocus
                        type="text"
                        value={editingTitle}
                        onChange={e => setEditingTitle(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleSaveRename(conv.id)
                          if (e.key === 'Escape') setEditingConvId(null)
                        }}
                        className="flex-1 bg-transparent text-xs text-zinc-100 outline-none px-1"
                      />
                      <button
                        type="button"
                        onClick={(e) => handleSaveRename(conv.id, e)}
                        className="p-1 text-emerald-400 hover:text-emerald-300 rounded cursor-pointer"
                        title="Salvar nome"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setEditingConvId(null)
                        }}
                        className="p-1 text-zinc-400 hover:text-zinc-200 rounded cursor-pointer"
                        title="Cancelar"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )
                }

                return (
                  <div
                    key={conv.id}
                    onClick={() => {
                      setActiveConversationId(conv.id)
                      if (onToggleConversations && externalConversationsOpen) {
                        onToggleConversations()
                      } else {
                        setIsLocalConversationsOpen(false)
                      }
                    }}
                    onDoubleClick={(e) => handleStartRename(conv, e)}
                    className={`group w-full text-left p-2 rounded-xl flex items-center justify-between text-xs transition-all cursor-pointer ${
                      isCur
                        ? 'bg-[var(--accent)]/15 border border-[var(--accent)]/30 text-white font-medium'
                        : 'hover:bg-zinc-850/80 text-zinc-300 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <Clock className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[11px] leading-tight">{conv.title}</div>
                        <div className="text-[9px] text-zinc-500 mt-0.5 flex items-center gap-1">
                          <span>{conv.messages.length} msgs</span>
                          <span>•</span>
                          <span>{new Date(conv.updatedAt).toLocaleDateString('pt-BR')}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity ml-1 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => handleStartRename(conv, e)}
                        className="p-1 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-all cursor-pointer"
                        title="Editar nome da conversa"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleDeleteConversation(conv.id, e)}
                        className="p-1 text-zinc-400 hover:text-rose-400 hover:bg-zinc-800 rounded transition-all cursor-pointer"
                        title="Excluir conversa"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between text-[10px] text-zinc-500">
            <span>{conversations.length} conversas salvas</span>
            <button
              type="button"
              onClick={() => {
                if (onToggleConversations && externalConversationsOpen) {
                  onToggleConversations()
                } else {
                  setIsLocalConversationsOpen(false)
                }
              }}
              className="text-zinc-400 hover:text-zinc-200 cursor-pointer"
            >
              Fechar
            </button>
          </div>
        </div>
      )}

      {/* 3. CHAT FEED */}
      <div
        ref={chatFeedRef}
        onScroll={handleChatScroll}
        className="flex-1 overflow-y-auto p-3 custom-chat-scrollbar flex flex-col"
      >
        {messages.length === 0 ? (
          <div className="m-auto flex flex-col items-center justify-center text-center p-4 text-zinc-500 space-y-2">
            <div className="w-10 h-10 rounded-2xl bg-zinc-900/80 border border-zinc-800 flex items-center justify-center text-lg shadow-inner">
              ✨
            </div>
            <div className="space-y-0.5">
              <p className="text-xs font-medium text-zinc-300">Como posso ajudar você hoje?</p>
              <p className="text-[11px] text-zinc-500">Pergunte sobre suas notas, planeje projetos ou crie tarefas.</p>
            </div>
          </div>
        ) : (
          <div className="mt-auto space-y-3 pt-1">
            {messages.map(m => (
              <div
                key={m.id}
                className={`flex flex-col gap-1 text-xs leading-relaxed ${
                  m.sender === 'user' ? 'items-end' : 'items-start'
                }`}
              >
                <div className="text-[10px] text-zinc-500 font-medium px-1 flex items-center gap-1">
                  {m.sender === 'ai' ? (
                    <>
                      <Bot className="w-3 h-3 text-[var(--accent)]" />
                      <span>{selectedSquad ? selectedSquad.name : selectedTeamAgent ? selectedTeamAgent.name : 'Assistente'}</span>
                    </>
                  ) : (
                    <>
                      <User className="w-3 h-3 text-zinc-400" />
                      <span>Você</span>
                    </>
                  )}
                </div>

                {/* Seamless Typography: Transparent container for AI, Speech bubble for User */}
                {m.sender === 'user' ? (
                  <div className="chat-user-bubble p-2.5 rounded-2xl bg-zinc-800/90 text-zinc-100 rounded-br-xs max-w-[90%] shadow-sm">
                    {m.text}
                  </div>
                ) : (
                  (() => {
                    const { thoughts, cleanText: thoughtFreeText } = parseThoughtBlocks(m.text)
                    const { displayText, taskActions, agentActions, workflowActions, squadActions } = parseMasterActions(thoughtFreeText)

                    return (
                      <div className="w-full text-zinc-200 px-1 py-1 space-y-2">
                        {m.text === 'Pensando...' ? (
                          <div className="flex items-center gap-2 py-1 text-zinc-400 font-mono text-[11px]">
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--accent)] shrink-0" />
                            <span>Preparando uma resposta para você…</span>
                          </div>
                        ) : (
                          <>
                            {thoughts.map((th, i) => (
                              <CollapsibleThought key={i} thought={th} />
                            ))}

                            {displayText ? (
                              <MarkdownRenderer
                                content={displayText}
                                onNavigate={onConnectNote}
                                onButtonClick={(promptText) => executePrompt(promptText)}
                                onInsertSnippet={onInsertSnippet}
                              />
                            ) : null}

                            {taskActions.length > 0 && (
                              <TaskActionsCollapsible
                                messageId={m.id}
                                actions={taskActions}
                                executedTaskActions={executedTaskActions}
                                tasks={tasks}
                                onExecute={handleExecuteTaskAction}
                                onOpenTasks={onOpenTasks}
                                taskBoards={taskBoards}
                                defaultBoardId={effectiveBoardId}
                              />
                            )}

                            {agentActions.length > 0 && (
                              <AgentActionsCollapsible
                                actions={agentActions}
                                onOpenAgent={(id) => navigateToTeamSection('agents', id)}
                              />
                            )}

                            {workflowActions.length > 0 && (
                              <WorkflowActionsCollapsible
                                actions={workflowActions}
                                onOpenWorkflow={(id) => navigateToTeamSection('workflows', id)}
                              />
                            )}

                            {squadActions.length > 0 && (
                              <SquadActionsCollapsible
                                actions={squadActions}
                                onOpenSquad={(id) => navigateToTeamSection('squads', id)}
                              />
                            )}

                            {m.proposedEdit && (
                              <DiffProposalCard
                                edit={m.proposedEdit}
                                onApply={() => handleApplyProposedEdit(m.id, m.proposedEdit!)}
                                onDiscard={() => handleDiscardProposedEdit(m.id)}
                              />
                            )}
                          </>
                        )}

                      {m.isActionable && (
                        <div className="pt-2 border-t border-zinc-800/60 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setIsSettingsOpen(true)}
                            className="px-3 py-1.5 rounded-xl bg-[var(--accent)] hover:opacity-90 text-zinc-950 font-bold text-xs transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
                          >
                            <KeyRound className="w-3.5 h-3.5" />
                            <span>Configurar Chave & Modelo</span>
                          </button>
                        </div>
                      )}

                      {/* Message Bottom Action Bar: Minimalist style */}
                      {!m.isActionable && m.text !== 'Pensando...' && (
                        <div className="pt-2 border-t border-zinc-800/40 flex items-center justify-between gap-1.5">
                          <div>
                            {onInsertSnippet && (
                              <button
                                type="button"
                                onClick={() => {
                                  onInsertSnippet(displayText)
                                  setInsertedNotice(m.id)
                                  setTimeout(() => setInsertedNotice(null), 3000)
                                }}
                                className="px-2 py-0.5 rounded text-[10px] text-zinc-400 hover:text-zinc-200 border border-zinc-800/80 hover:border-zinc-700 bg-zinc-900/40 transition-colors cursor-pointer flex items-center gap-1 shadow-xs"
                                title="Inserir todo o texto e artefatos desta resposta na nota ativa"
                              >
                                <PenLine className="w-2.5 h-2.5" />
                                <span>{insertedNotice === m.id ? '✓ Inserido!' : 'Inserir resposta na nota'}</span>
                              </button>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5">
                            {onCreateNote && (
                              <button
                                type="button"
                                onClick={() => {
                                  const headingMatch = displayText.match(/(?:^|\n)#\s+([^\n]+)/)
                                  const extractedTitle = (headingMatch ? headingMatch[1] : 'Nova Nota da IA').replace(/[\[\]]/g, '').trim()
                                  const isMind = isMindMapContent(displayText)
                                  const finalContent = isMind
                                    ? serializeMindMapDocument(parseMindMapDocument(displayText, extractedTitle))
                                    : displayText
                                  onCreateNote('Início', extractedTitle, finalContent)
                                  setToastNotice(`✨ ${isMind ? 'Mapa Mental' : 'Nota'} "${extractedTitle}" criada no cofre!`)
                                  setTimeout(() => setToastNotice(null), 4000)
                                }}
                                className="px-2 py-0.5 rounded text-[10px] text-zinc-400 hover:text-[var(--accent)] border border-zinc-800/80 hover:border-[var(--accent)]/50 bg-zinc-900/40 transition-colors cursor-pointer flex items-center gap-1 shadow-xs"
                                title="Criar nova nota no cofre com esta resposta"
                              >
                                <FilePlus className="w-2.5 h-2.5" />
                                <span>Criar como Nota</span>
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(displayText)
                                setCopiedNotice(m.id)
                                setTimeout(() => setCopiedNotice(null), 2000)
                              }}
                              className="px-2 py-0.5 rounded text-[10px] text-zinc-400 hover:text-zinc-200 border border-zinc-800/80 hover:border-zinc-700 bg-zinc-900/40 transition-colors cursor-pointer flex items-center gap-1 shadow-xs"
                              title="Copiar texto em Markdown"
                            >
                              {copiedNotice === m.id ? <Check className="w-2.5 h-2.5 text-emerald-400" /> : <Copy className="w-2.5 h-2.5" />}
                              <span>{copiedNotice === m.id ? 'Copiado!' : 'Copiar'}</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })()
              )}
            </div>
          ))}
          <div ref={messagesEndRef} className="h-px shrink-0" />
        </div>
      )}
      </div>

      {/* 4. MODERN CHAT INPUT CARD WITH '/' (SKILLS) & '@' (NOTES) AUTOCOMPLETE */}
      <form onSubmit={handleSendMessage} className="p-2.5 border-t border-zinc-800/80 bg-[#0c0c0f] flex flex-col gap-1.5 relative">
        {/* Floating Autocomplete for '@' (Notes Context) */}
        {atSearchOpen && filteredAtNotes.length > 0 && (
          <div className="absolute bottom-full left-2.5 right-2.5 mb-2 bg-[#12131a] border border-zinc-700/80 rounded-xl p-1.5 shadow-2xl z-50 space-y-0.5 max-h-56 overflow-y-auto custom-chat-scrollbar animate-in fade-in zoom-in-95 duration-100">
            <div className="px-2 py-1 text-[10px] font-mono text-zinc-400 border-b border-zinc-800 flex items-center justify-between">
              <span>SOMAR NOTA AO CONTEXTO (@)</span>
              <span className="text-[9px] text-zinc-500">{filteredAtNotes.length} opções</span>
            </div>
            {filteredAtNotes.map(n => (
              <button
                key={n.id}
                type="button"
                onClick={() => handleSelectAtNote(n)}
                className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-zinc-800/80 text-zinc-200 flex items-center justify-between text-xs cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-1.5 truncate">
                  <FileText className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                  <span className="truncate font-medium">{n.title}</span>
                </div>
                <span className="text-[10px] text-zinc-500 font-mono shrink-0 ml-1">
                  {n.folder || 'Início'}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Floating Autocomplete for '/' (Skills / Presets) */}
        {slashSearchOpen && filteredSlashItems.length > 0 && (
          <div role="listbox" aria-label="Comandos do agente" className="absolute bottom-full left-2.5 right-2.5 mb-2 bg-[#12131a] border border-zinc-700/80 rounded-xl p-1.5 shadow-2xl z-50 space-y-0.5 max-h-56 overflow-y-auto custom-chat-scrollbar animate-in fade-in zoom-in-95 duration-100">
            <div className="px-2 py-1 text-[10px] font-mono text-zinc-400 border-b border-zinc-800 flex items-center justify-between">
              <span>SKILLS & PRESETS DISPONÍVEIS (/)</span>
              <span className="text-[9px] text-zinc-500">{filteredSlashItems.length} opções</span>
            </div>
            {filteredSlashItems.map((item, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSelectSlashItem(item.prompt)}
                role="option"
                aria-selected={idx === Math.min(completionIndex, filteredSlashItems.length - 1)}
                onMouseEnter={() => setCompletionIndex(idx)}
                className={`w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-zinc-800/80 text-zinc-200 flex items-center justify-between text-xs cursor-pointer transition-colors ${idx === Math.min(completionIndex, filteredSlashItems.length - 1) ? 'bg-white/[0.06]' : ''}`}
              >
                <div className="flex items-center gap-1.5 truncate">
                  <Sparkles className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                  <span className="truncate font-medium">{item.label}</span>
                </div>
                <span className="text-[9px] text-zinc-500 font-mono px-1 py-0.5 rounded bg-zinc-900 border border-zinc-800 shrink-0 ml-1">
                  {item.category}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Project Selector (Moved from header to above chat input) */}
        {taskBoards && taskBoards.length > 0 && (
          <div ref={boardMenuRef} className="relative flex items-center justify-between pb-0.5">
            <button
              type="button"
              onClick={() => setIsBoardMenuOpen(o => !o)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-zinc-100 transition-all cursor-pointer shadow-xs max-w-full"
            >
              <span className="text-[10px] text-zinc-500 font-medium shrink-0">Projeto:</span>
              <div className="flex items-center gap-1.5 truncate">
                {currentLinkedBoard ? (
                  renderDynamicIcon(currentLinkedBoard.icon, "w-3.5 h-3.5 shrink-0", { color: 'var(--accent, #c59b27)' })
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5 text-[var(--accent, #c59b27)] shrink-0" />
                )}
                <span className="truncate font-medium text-[11px] text-zinc-200">
                  {currentLinkedBoard?.name || 'Automático (Aba Ativa)'}
                </span>
              </div>
              <ChevronUp className={`w-3 h-3 text-zinc-500 shrink-0 transition-transform ${isBoardMenuOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* Modal Popover for Project Selector with Project Icons like sidebar */}
            {isBoardMenuOpen && (
              <div className="absolute bottom-full left-0 mb-1.5 z-50 w-64 bg-[#12131a] border border-zinc-700/80 rounded-xl p-1.5 shadow-2xl space-y-1 animate-in fade-in zoom-in-95 duration-100">
                <div className="px-2 py-1 text-[10px] font-mono text-zinc-400 border-b border-zinc-800 flex items-center justify-between">
                  <span>SELECIONAR PROJETO</span>
                  <span className="text-[9px] text-zinc-500">{taskBoards.length} projetos</span>
                </div>
                <div className="max-h-56 overflow-y-auto space-y-0.5 custom-chat-scrollbar">
                  <button
                    type="button"
                    onClick={() => {
                      handleSetLinkedBoardId(undefined)
                      setIsBoardMenuOpen(false)
                    }}
                    className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center justify-between text-xs transition-colors cursor-pointer ${
                      !activeConversation?.linkedBoardId
                        ? 'bg-[var(--accent)]/15 border border-[var(--accent)]/30 text-white font-medium'
                        : 'text-zinc-300 hover:bg-zinc-800/70'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <CheckCircle2 className="w-3.5 h-3.5 text-[var(--accent, #c59b27)] shrink-0" />
                      <span className="truncate text-[11px]">Automático (Aba Ativa)</span>
                    </div>
                    {!activeConversation?.linkedBoardId && <Check className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />}
                  </button>
                  {taskBoards.map(b => {
                    const isCur = activeConversation?.linkedBoardId === b.id
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => {
                          handleSetLinkedBoardId(b.id)
                          setIsBoardMenuOpen(false)
                        }}
                        className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center justify-between text-xs transition-colors cursor-pointer ${
                          isCur
                            ? 'bg-[var(--accent)]/15 border border-[var(--accent)]/30 text-white font-medium'
                            : 'text-zinc-300 hover:bg-zinc-800/70'
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          {renderDynamicIcon(b.icon, "w-3.5 h-3.5 shrink-0", { color: 'var(--accent, #c59b27)' })}
                          <span className="truncate text-[11px]">{b.name}</span>
                        </div>
                        {isCur && <Check className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Input Box Card */}
        <div className="bg-[#141418] border border-zinc-800 focus-within:border-zinc-600 rounded-2xl p-2 transition-all shadow-inner flex flex-col gap-2">
          {/* Audio Recording Live Banner */}
          {isRecording ? (
            <div className="flex items-center justify-between px-2 py-1.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs animate-pulse">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                <span className="font-semibold">Gravando áudio multimodal ({recordingSeconds}s)...</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleCancelAudioRecording}
                  className="px-2 py-0.5 text-[10px] text-zinc-400 hover:text-zinc-200 rounded cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleStopAudioRecording}
                  className="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-lg text-[10px] flex items-center gap-1 cursor-pointer shadow-sm"
                  title="Finalizar e enviar áudio direto ao modelo"
                >
                  <Square className="w-3 h-3 fill-current" />
                  <span>Enviar</span>
                </button>
              </div>
            </div>
          ) : (
            <textarea
              ref={inputRef}
              rows={2}
              aria-label="Mensagem para o agente"
              value={input}
              onChange={handleInputChange}
              placeholder="Pergunte ao Assistente (digite '/' para skills ou '@' para somar notas)..."
              className="agent-message-input w-full bg-transparent px-1 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none"
              onKeyDown={event => {
                if (event.nativeEvent.isComposing) return
                const options = slashSearchOpen ? filteredSlashItems : atSearchOpen ? filteredAtNotes : []
                if ((slashSearchOpen || atSearchOpen) && ['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(event.key)) {
                  if (event.key === 'Escape') { event.preventDefault(); setSlashSearchOpen(false); setAtSearchOpen(false); return }
                  if (event.key === 'Enter' || (options.length && ['ArrowDown', 'ArrowUp', 'Tab'].includes(event.key))) {
                    event.preventDefault()
                    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') setCompletionIndex(index => (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length)
                    else if (options.length) {
                      const index = Math.min(completionIndex, options.length - 1)
                      if (slashSearchOpen) handleSelectSlashItem(filteredSlashItems[index].prompt)
                      else handleSelectAtNote(filteredAtNotes[index])
                    }
                    return
                  }
                }
                if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); handleSendMessage(event) }
              }}
            />
          )}

          {/* Context Control Bar: Note Context + Extra Notes (@) + Folder Context (Hierarchical) */}
          <div className="flex items-center justify-between pt-1 border-t border-zinc-800/40 gap-1.5 flex-wrap">
            <div className="flex items-center gap-1.5 flex-wrap">
              {/* Primary Active Note Context Pill */}
              <div
                className={`ai-context-pill flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border transition-all ${
                  isNoteContextActive
                    ? 'bg-zinc-900 border-[var(--accent)]/40 text-zinc-200'
                    : 'bg-zinc-950/60 border-zinc-800 text-zinc-500 line-through opacity-60'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setIsNoteContextActive(a => !a)}
                  className="flex items-center gap-1 cursor-pointer truncate max-w-[130px]"
                  title={isNoteContextActive ? 'Nota ativa no contexto (clique para alternar)' : 'Nota inativa no contexto (clique para ativar)'}
                >
                  <span className={`font-bold ${isNoteContextActive ? 'text-[var(--accent)]' : 'text-zinc-500'}`}>@</span>
                  <span className="truncate">{effectiveNote.title}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsNoteContextActive(a => !a)}
                  className="text-zinc-500 hover:text-zinc-300 ml-0.5 cursor-pointer"
                  title={isNoteContextActive ? 'Desativar nota do contexto' : 'Ativar nota no contexto'}
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </div>

              {/* Extra Tagged Context Notes (@) */}
              {extraContextNotes.map(en => (
                <div
                  key={en.id}
                  className="ai-extra-note-pill flex items-center gap-1 text-[10px] bg-purple-500/15 border border-purple-500/30 text-purple-200 px-2 py-0.5 rounded-full max-w-[140px] truncate shadow-sm"
                >
                  <span className="font-bold text-purple-400">@</span>
                  <span className="truncate">{en.title}</span>
                  <button
                    type="button"
                    onClick={() => setExtraContextNotes(prev => prev.filter(n => n.id !== en.id))}
                    className="text-purple-400/80 hover:text-purple-100 ml-0.5 cursor-pointer"
                    title="Remover do contexto"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              ))}

              {/* Hierarchical Folder Context Picker */}
              <div ref={folderPickerRef} className="relative">
                {selectedFolderContext ? (
                  <div className="ai-folder-active-pill flex items-center gap-1 text-[10px] bg-amber-500/10 border border-amber-500/30 text-amber-200 px-2 py-0.5 rounded-full max-w-[170px] truncate shadow-sm">
                    <Folder className="w-3 h-3 text-amber-400 shrink-0" />
                    <button
                      type="button"
                      onClick={() => setIsFolderPickerOpen(o => !o)}
                      className="truncate cursor-pointer hover:underline"
                      title={`Pasta "${selectedFolderContext}" ativa como contexto. Clique para trocar.`}
                    >
                      {selectedFolderContext}
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedFolderContext(null)}
                      className="text-amber-400/80 hover:text-amber-200 ml-0.5 cursor-pointer"
                      title="Remover pasta do contexto"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsFolderPickerOpen(o => !o)}
                    className="ai-folder-context-btn flex items-center gap-1 text-[10px] text-zinc-400 hover:text-zinc-200 bg-zinc-900/70 hover:bg-zinc-800/90 border border-dashed border-zinc-700/80 hover:border-zinc-500 px-2 py-0.5 rounded-full transition-all cursor-pointer"
                    title="Adicionar uma pasta inteira do cofre com hierarquia como contexto para a IA"
                  >
                    <FolderPlus className="w-3 h-3 text-zinc-400" />
                    <span>+ Pasta</span>
                  </button>
                )}

                {/* Hierarchical Folder Selection Popover with Subfolder Tree */}
                {isFolderPickerOpen && (
                  <FolderTreePicker
                      anchorRef={folderPickerRef}
                      popupRef={folderPopupRef}
                      folders={folderList}
                      selectedFolder={selectedFolderContext}
                      currentNoteFolder={effectiveNote.folder}
                      onSelectFolder={(f) => {
                        inputRef.current?.focus()
                        setSelectedFolderContext(f)
                        setIsFolderPickerOpen(false)
                      }}
                      onClose={() => setIsFolderPickerOpen(false)}
                    />
                )}
              </div>
            </div>

            {/* Input Action Group: Multimodal Audio Button & Send Button */}
            <div className="flex items-center gap-1.5 ml-auto">
              {/* Multimodal Audio Recording Button */}
              {isMultimodalActive && !isRecording && (
                <button
                  type="button"
                  onClick={handleStartAudioRecording}
                  disabled={isGenerating}
                  className="p-1.5 text-zinc-400 hover:text-rose-400 hover:bg-zinc-800/60 rounded-full transition-colors cursor-pointer"
                  title="Gravar áudio direto para o modelo multimodal (sem transcrição)"
                >
                  <Mic className="w-3.5 h-3.5" />
                </button>
              )}

              {/* Send Message Button */}
              <button
                type="submit"
                disabled={!input.trim() || isGenerating}
                className="w-6 h-6 rounded-full bg-[var(--accent)] hover:opacity-90 disabled:opacity-30 text-zinc-950 font-bold flex items-center justify-center transition-all cursor-pointer shadow-md shadow-black/40 shrink-0"
                title="Enviar mensagem para o Agente"
              >
                <ArrowUp className="w-3.5 h-3.5 stroke-[2.5]" />
              </button>
            </div>
          </div>
        </div>
      </form>

      {/* Unified AI Settings Modal with Left Sidebar (Modelos, Especialidades, Skills) */}
      <AiSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => {
          setIsSettingsOpen(false)
          try {
            setAutoApplyEdits(localStorage.getItem('pyrite_ai_auto_apply_edits') === 'true')
          } catch {}
        }}
        onConfigSaved={refreshAiConfig}
      />

      {/* Vertical Resizable Drag Handle - Completely invisible when idle */}
      <div
        onMouseDown={handleMouseDown}
        onDoubleClick={() => {
          setPanelWidth(380)
          try {
            localStorage.setItem('pyrite_ai_width', '380')
          } catch {}
        }}
        className={`absolute top-0 right-0 w-2 h-full cursor-col-resize select-none z-30 transition-colors ${
          isDragging ? 'bg-[var(--accent)]/80' : 'hover:bg-[var(--accent)]/30'
        }`}
        title="Arraste para redimensionar a largura do chat (duplo clique para restaurar)"
      >
        {isDragging && <div className="w-[1px] h-full bg-[var(--accent)] mx-auto" />}
      </div>
    </div>
  )
}
