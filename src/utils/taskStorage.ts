import type { TaskItem, TaskSettings } from '../types/tasks'

const TASKS_STORAGE_KEY = 'pyrite_vault_tasks'
const TASK_SETTINGS_STORAGE_KEY = 'pyrite_vault_task_settings'

export const DEFAULT_TASK_SETTINGS: TaskSettings = {
  statuses: [
    { id: 'inbox', name: 'Inbox', color: '#71717a' },
    { id: 'in_progress', name: 'Em Andamento', color: '#3b82f6' },
    { id: 'scheduled', name: 'Agendado', color: '#8b5cf6' },
    { id: 'review', name: 'Revisão', color: '#f59e0b' },
    { id: 'completed', name: 'Concluído', color: '#10b981', isCompleted: true }
  ],
  properties: [
    { id: 'prop_status', name: 'Status', type: 'status' },
    { id: 'prop_priority', name: 'Prioridade', type: 'priority' },
    { id: 'prop_deadline', name: 'Prazo', type: 'date' },
    { id: 'prop_context', name: 'Contexto', type: 'context' },
    { id: 'prop_tags', name: 'Tags', type: 'text' }
  ]
}

const todayStr = new Date().toISOString().slice(0, 10)
const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10)

export const INITIAL_TASKS: TaskItem[] = [
  {
    id: 'task_1',
    title: 'First task',
    completed: false,
    statusId: 'inbox',
    priority: 'medium',
    date: tomorrow,
    deadline: todayStr,
    contextNoteId: 'note-welcome',
    contextNoteTitle: 'Bem-vindo ao Pyrita',
    tags: ['planejamento', 'foco'],
    description: '### Objetivos desta tarefa\n- [ ] Levantar requisitos principais\n- [ ] Conectar com a nota de contexto vinculada\n- [ ] Definir entregáveis da semana\n\nEssa tarefa foi estruturada com suporte a propriedades e vinculação de notas locais.',
    createdAt: Date.now() - 3600000 * 5,
    updatedAt: Date.now()
  },
  {
    id: 'task_2',
    title: 'Estruturar pipeline de conhecimento',
    completed: false,
    statusId: 'in_progress',
    priority: 'high',
    date: todayStr,
    deadline: tomorrow,
    contextNoteId: 'note-knowledge-graph',
    contextNoteTitle: 'Grafos de Conhecimento',
    tags: ['metodologia', 'segundo-cerebro'],
    description: 'Revisar conexões e organizar o mapa de links bidirecionais entre os tópicos centrais.',
    createdAt: Date.now() - 3600000 * 12,
    updatedAt: Date.now()
  },
  {
    id: 'task_3',
    title: 'Análise de arquitetura local-first',
    completed: false,
    statusId: 'scheduled',
    priority: 'urgent',
    date: tomorrow,
    deadline: tomorrow,
    contextNoteId: 'note-obsidian-re',
    contextNoteTitle: 'Arquitetura do Obsidian',
    tags: ['engenharia', 'desempenho'],
    description: 'Avaliar integridade do sistema de arquivos e tempo de inicialização dos vaults.',
    createdAt: Date.now() - 3600000 * 24,
    updatedAt: Date.now()
  },
  {
    id: 'task_4',
    title: 'Revisar checklist e métricas de conversão',
    completed: true,
    statusId: 'completed',
    priority: 'low',
    date: todayStr,
    deadline: todayStr,
    contextNoteId: 'note-quiz-checklist',
    contextNoteTitle: 'Checklist do Quiz',
    tags: ['marketing'],
    description: 'Métricas analisadas e aprovadas para o fechamento do ciclo.',
    createdAt: Date.now() - 3600000 * 48,
    updatedAt: Date.now()
  }
]

export function loadTasks(vaultKey = 'default'): TaskItem[] {
  try {
    const key = `${TASKS_STORAGE_KEY}_${vaultKey}`
    const saved = localStorage.getItem(key)
    if (saved) {
      const parsed = JSON.parse(saved)
      if (Array.isArray(parsed)) return parsed
    }
  } catch (err) {
    console.warn('[TaskStorage] Erro ao carregar tarefas:', err)
  }
  // Se for o cofre padrão e nunca foi iniciado, cria as tarefas iniciais de demonstração
  if (vaultKey === 'default') {
    return INITIAL_TASKS
  }
  return []
}

export function saveTasks(tasks: TaskItem[], vaultKey = 'default'): void {
  try {
    const key = `${TASKS_STORAGE_KEY}_${vaultKey}`
    localStorage.setItem(key, JSON.stringify(tasks))
  } catch (err) {
    console.warn('[TaskStorage] Erro ao salvar tarefas:', err)
  }
}

export function loadTaskSettings(vaultKey = 'default'): TaskSettings {
  try {
    const key = `${TASK_SETTINGS_STORAGE_KEY}_${vaultKey}`
    const saved = localStorage.getItem(key)
    if (saved) {
      const parsed = JSON.parse(saved)
      if (parsed && Array.isArray(parsed.statuses) && Array.isArray(parsed.properties)) {
        return parsed
      }
    }
  } catch (err) {
    console.warn('[TaskStorage] Erro ao carregar configurações de tarefas:', err)
  }
  return DEFAULT_TASK_SETTINGS
}

export function saveTaskSettings(settings: TaskSettings, vaultKey = 'default'): void {
  try {
    const key = `${TASK_SETTINGS_STORAGE_KEY}_${vaultKey}`
    localStorage.setItem(key, JSON.stringify(settings))
  } catch (err) {
    console.warn('[TaskStorage] Erro ao salvar configurações de tarefas:', err)
  }
}
