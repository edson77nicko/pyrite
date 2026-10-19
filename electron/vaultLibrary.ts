import * as fs from 'node:fs/promises'
import path from 'node:path'
import { constants } from 'node:fs'

interface LibraryOptions { settingsPath: string; defaultRootPath: string }

function validateName(value: string): string {
  const name = value.trim()
  if (!name || name === '.' || name === '..' || /[\\/:*?"<>|\x00-\x1f]/.test(name) || /[. ]$/.test(value) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) {
    throw new Error('Digite um nome de cofre válido, sem barras ou caracteres reservados.')
  }
  return name
}

function inside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate)
  return !relative || (relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative))
}

async function exists(file: string): Promise<boolean> {
  try { await fs.lstat(file); return true }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error }
}

async function canonicalDestination(directory: string): Promise<string> {
  const absolute = path.resolve(directory)
  let ancestor = absolute
  while (!await exists(ancestor)) ancestor = path.dirname(ancestor)
  return path.resolve(await fs.realpath(ancestor), path.relative(ancestor, absolute))
}

/** Copies physical data, never retaining links back to the original vault. */
async function copyDirectory(source: string, destination: string, sourceRoot: string, ancestors: Set<string>): Promise<void> {
  const real = await fs.realpath(source)
  if (!inside(sourceRoot, real)) throw new Error(`O cofre contém um link para fora da pasta original: ${source}`)
  if (ancestors.has(real)) throw new Error(`O cofre contém um link circular: ${source}`)
  const nextAncestors = new Set(ancestors).add(real)
  for (const entry of await fs.readdir(source, { withFileTypes: true })) {
    const input = path.join(source, entry.name)
    const output = path.join(destination, entry.name)
    const resolved = await fs.realpath(input)
    if (!inside(sourceRoot, resolved)) throw new Error(`O cofre contém um link para fora da pasta original: ${input}`)
    const stat = await fs.stat(input)
    if (stat.isDirectory()) {
      await fs.mkdir(output)
      await copyDirectory(input, output, sourceRoot, nextAncestors)
      await fs.utimes(output, stat.atime, stat.mtime)
    } else if (stat.isFile()) {
      await fs.copyFile(input, output, constants.COPYFILE_EXCL)
      await fs.chmod(output, stat.mode | 0o200)
      await fs.utimes(output, stat.atime, stat.mtime)
    } else throw new Error(`Não foi possível copiar este tipo de arquivo: ${input}`)
  }
}

export function createVaultLibrary({ settingsPath, defaultRootPath }: LibraryOptions) {
  const pending = new Set<string>()
  const getSettings = async () => {
    try {
      const saved = JSON.parse(await fs.readFile(settingsPath, 'utf8'))
      if (typeof saved.rootPath === 'string' && path.isAbsolute(saved.rootPath)) return { rootPath: saved.rootPath }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error
    }
    return { rootPath: path.resolve(defaultRootPath) }
  }
  return {
    getSettings,
    async setRoot(rootPath: string) {
      if (!path.isAbsolute(rootPath)) throw new Error('Escolha uma pasta raiz válida.')
      const real = await fs.realpath(rootPath)
      if (!(await fs.stat(real)).isDirectory()) throw new Error('O destino precisa ser uma pasta.')
      await fs.mkdir(path.dirname(settingsPath), { recursive: true })
      const temporary = settingsPath + '.tmp'
      await fs.writeFile(temporary, JSON.stringify({ rootPath: real }, null, 2), 'utf8')
      await fs.rename(temporary, settingsPath)
      return { rootPath: real }
    },
    async listManagedVaults() {
      const { rootPath } = await getSettings()
      if (!await exists(rootPath)) return []
      const entries = await fs.readdir(rootPath, { withFileTypes: true })
      return Promise.all(entries.filter(entry => entry.isDirectory() && !entry.name.startsWith('.')).map(async entry => {
        const vaultPath = path.join(rootPath, entry.name)
        const stat = await fs.stat(vaultPath)
        return { id: `pyrita-${entry.name}`, name: entry.name, path: vaultPath, lastOpened: stat.birthtimeMs || stat.mtimeMs }
      }))
    },
    async createVault(parentPath: string, vaultName: string) {
      const name = validateName(vaultName)
      if (!path.isAbsolute(parentPath)) throw new Error('Escolha uma pasta de destino válida.')
      await fs.mkdir(parentPath, { recursive: true })
      const parent = await fs.realpath(parentPath)
      const destination = path.join(parent, name)
      if (await exists(destination)) throw new Error('Já existe uma pasta com esse nome. Escolha outro nome para o cofre.')
      await fs.mkdir(destination)
      return { vaultPath: destination }
    },
    async duplicateVault(sourcePath: string, vaultName: string) {
      const name = validateName(vaultName)
      if (!path.isAbsolute(sourcePath)) throw new Error('Escolha a pasta do cofre original.')
      const source = await fs.realpath(sourcePath)
      if (!(await fs.stat(source)).isDirectory()) throw new Error('O cofre original precisa ser uma pasta.')
      const { rootPath } = await getSettings()
      const plannedRoot = await canonicalDestination(rootPath)
      const plannedTarget = path.join(plannedRoot, name)
      if (inside(source, plannedTarget)) throw new Error('A cópia deve ficar fora da pasta do cofre original. Escolha outra pasta raiz.')
      const key = process.platform === 'win32' ? plannedTarget.toLowerCase() : plannedTarget
      if (pending.has(key)) throw new Error('Uma cópia com esse nome já está em andamento.')
      pending.add(key)
      let staging: string | undefined
      let managedRoot: string | undefined
      try {
        await fs.mkdir(rootPath, { recursive: true })
        managedRoot = await fs.realpath(rootPath)
        const destination = path.join(managedRoot, name)
        if (inside(source, destination)) throw new Error('A cópia deve ficar fora da pasta do cofre original.')
        if (await exists(destination)) throw new Error('Já existe uma pasta com esse nome. Escolha outro nome para a cópia.')
        staging = await fs.mkdtemp(path.join(managedRoot, '.pyrita-copy-'))
        await copyDirectory(source, staging, source, new Set())
        if (await exists(destination)) throw new Error('Uma pasta com esse nome foi criada durante a cópia. Escolha outro nome.')
        await fs.rename(staging, destination)
        staging = undefined
        return { vaultPath: destination }
      } finally {
        // Only discard this operation's private staging folder inside the managed root.
        if (staging && managedRoot && path.dirname(staging) === managedRoot && path.basename(staging).startsWith('.pyrita-copy-')) await fs.rm(staging, { recursive: true, force: true })
        pending.delete(key)
      }
    }
  }
}
