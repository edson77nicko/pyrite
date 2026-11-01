import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import type { MultiAgentStoreState } from '../src/types/agents'

const queues = new Map<string, Promise<unknown>>()

export function computeContentHash(content: string): string {
  return crypto.createHash('sha256').update(content || '', 'utf8').digest('hex')
}

/**
 * Confinamento rigoroso no Windows/macOS/Linux (P0):
 * Rejeita `..`, caminhos fora do cofre, links simbólicos/junctions apontando para fora do cofre.
 */
export function resolveConfinedPath(vaultPath: string, candidatePath: string): string {
  if (!vaultPath || !path.isAbsolute(vaultPath)) {
    throw new Error('Cofre não autorizado ou caminho inválido.')
  }
  const root = fsSync.realpathSync(vaultPath)
  const resolved = path.isAbsolute(candidatePath)
    ? path.resolve(candidatePath)
    : path.resolve(root, candidatePath.replace(/\//g, path.sep))

  const relative = path.relative(root, resolved)
  if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) {
    throw new Error('Acesso negado: caminho fora do cofre autorizado.')
  }

  let ancestor = resolved
  while (!fsSync.existsSync(ancestor)) {
    const parent = path.dirname(ancestor)
    if (parent === ancestor) break
    ancestor = parent
  }

  const realAncestor = fsSync.realpathSync(ancestor)
  const realRelative = path.relative(root, realAncestor)
  if (realRelative === '..' || realRelative.startsWith('..' + path.sep) || path.isAbsolute(realRelative)) {
    throw new Error('Acesso negado: link simbólico ou junction aponta para fora do cofre.')
  }

  return resolved
}

async function getAgentsStoreLocation(vaultPath: string, create: boolean): Promise<string> {
  if (!path.isAbsolute(vaultPath)) throw new Error('Cofre inválido.')
  const root = await fs.realpath(vaultPath)
  const pyriteDir = path.join(root, '.pyrite')
  if (create) {
    await fs.mkdir(pyriteDir, { recursive: true })
  }
  if (fsSync.existsSync(pyriteDir)) {
    const realDir = await fs.realpath(pyriteDir)
    if (path.dirname(realDir) !== root) {
      throw new Error('A pasta .pyrite deve residir estritamente dentro do cofre.')
    }
  }
  return path.join(pyriteDir, 'multiagents.json')
}

export async function readMultiAgentStore(vaultPath: string): Promise<MultiAgentStoreState | null> {
  try {
    const file = await getAgentsStoreLocation(vaultPath, false)
    const stat = await fs.lstat(file)
    if (!stat.isFile()) return null
    const raw = await fs.readFile(file, 'utf8')
    const parsed = JSON.parse(raw) as MultiAgentStoreState
    return reconcileInterruptedRunsOnBoot(parsed)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
}

/**
 * Reconciliação de inicialização inspirada no BootRecovery do OpenBot:
 * Execuções deixadas em `running` ou `queued` por fechamento abrupto passam para `interrupted`
 * de forma conservadora (nunca repetindo efeitos colaterais incertos automaticamente).
 */
function reconcileInterruptedRunsOnBoot(state: MultiAgentStoreState): MultiAgentStoreState {
  if (!state || !Array.isArray(state.runs)) return state
  let changed = false
  const runs = state.runs.map(run => {
    if (run.status === 'running') {
      changed = true
      return {
        ...run,
        status: 'interrupted' as const,
        error: 'O Pyrite foi reiniciado antes que esta execução atingisse um estado final confirmado.',
        updatedAt: Date.now()
      }
    }
    return run
  })

  const mailboxQueue = (state.mailboxQueue || []).map(item => {
    if (item.status === 'running') {
      changed = true
      return {
        ...item,
        status: 'interrupted' as const,
        updatedAt: Date.now()
      }
    }
    return item
  })

  return changed ? { ...state, runs, mailboxQueue } : state
}

export async function writeMultiAgentStore(
  vaultPath: string,
  state: MultiAgentStoreState
): Promise<{ success: boolean; revisionHash: string; updatedAt: number }> {
  const key = path.resolve(vaultPath).toLowerCase()
  let revisionHash = ''
  let updatedAt = Date.now()

  const operation = (queues.get(key) || Promise.resolve())
    .catch(() => {})
    .then(async () => {
      const file = await getAgentsStoreLocation(vaultPath, true)
      const serialized = JSON.stringify(state, null, 2)
      revisionHash = computeContentHash(serialized)
      updatedAt = Date.now()
      const tempFile = `${file}.${Date.now()}.tmp`
      await fs.writeFile(tempFile, serialized, 'utf8')
      await fs.rename(tempFile, file)
    })

  queues.set(key, operation)
  try {
    await operation
    return { success: true, revisionHash, updatedAt }
  } finally {
    if (queues.get(key) === operation) {
      queues.delete(key)
    }
  }
}
