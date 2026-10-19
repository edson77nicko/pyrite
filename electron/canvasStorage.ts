import fs from 'node:fs/promises'
import path from 'node:path'
import { isCanvasDocument, type CanvasDocument } from '../src/utils/canvasBoards'
const queues = new Map<string, Promise<unknown>>()
async function location(vaultPath: string, create: boolean) {
  if (!path.isAbsolute(vaultPath)) throw new Error('Cofre inválido.')
  const root = await fs.realpath(vaultPath)
  const directory = path.join(root, '.pyrita')
  if (create) await fs.mkdir(directory, { recursive: true })
  const realDirectory = await fs.realpath(directory)
  if (path.dirname(realDirectory) !== root) throw new Error('A pasta de quadros deve ficar dentro do cofre.')
  return path.join(realDirectory, 'canvas.json')
}
export async function readCanvas(vaultPath: string): Promise<CanvasDocument | null> {
  try {
    const file = await location(vaultPath, false)
    const stat = await fs.lstat(file)
    if (!stat.isFile()) throw new Error('Arquivo de quadros inválido.')
    const document: unknown = JSON.parse(await fs.readFile(file, 'utf8'))
    if (!isCanvasDocument(document)) throw new Error('O arquivo de quadros não é válido. O original foi preservado.')
    return document
  } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error }
}
export async function writeCanvas(vaultPath: string, document: CanvasDocument): Promise<void> {
  if (!isCanvasDocument(document)) throw new Error('Não foi possível salvar: quadro inválido.')
  const key = path.resolve(vaultPath).toLowerCase()
  const operation = (queues.get(key) || Promise.resolve()).catch(() => {}).then(async () => {
    const file = await location(vaultPath, true)
    const temporary = file + '.tmp'
    await fs.writeFile(temporary, JSON.stringify(document, null, 2), 'utf8')
    await fs.rename(temporary, file)
  })
  queues.set(key, operation)
  try { await operation } finally { if (queues.get(key) === operation) queues.delete(key) }
}
