const fs = require('node:fs')
const path = require('node:path')

function parseSemver(versionStr) {
  const clean = String(versionStr || '').replace(/^v/, '').trim()
  const [core] = clean.split(/[-+]/)
  const parts = core.split('.').map(n => parseInt(n, 10) || 0)
  while (parts.length < 3) parts.push(0)
  return parts
}

function compareSemver(a, b) {
  const pa = parseSemver(a)
  const pb = parseSemver(b)
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i]
  }
  return 0
}

function formatBytes(bytes) {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(2)} KB`
  }
  return `${bytes} B`
}

function cleanupReleases(options = {}) {
  const root = options.root || path.resolve(__dirname, '..')
  const pkgPath = path.join(root, 'package.json')
  const pkg = fs.existsSync(pkgPath) ? JSON.parse(fs.readFileSync(pkgPath, 'utf8')) : {}

  const configuredLimit = options.maxKept || pkg.releaseSettings?.maxKeptReleases || pkg.build?.maxKeptReleases || 5
  const maxKept = Math.max(1, Number(configuredLimit) || 5)
  const outputDirName = pkg.build?.directories?.output || 'release'
  const releaseDir = path.resolve(root, outputDirName)

  if (!fs.existsSync(releaseDir)) {
    console.log(`[cleanup-releases] Diretório '${outputDirName}' não existe. Nada a limpar.`)
    return { freedBytes: 0, deletedFiles: 0, keptVersions: [] }
  }

  const productName = pkg.build?.productName || 'Pyrite'
  const escapedName = productName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const fileRegex = new RegExp(`^(?:${escapedName}|Pyrita|Pyrite)\\s+Setup\\s+(\\d+\\.\\d+(?:\\.\\d+)?(?:-[0-9A-Za-z.-]+)?)\\..+$`, 'i')

  const files = fs.readdirSync(releaseDir)
  const versionToFileMap = new Map()

  for (const file of files) {
    const match = file.match(fileRegex)
    if (match) {
      const version = match[1]
      if (!versionToFileMap.has(version)) {
        versionToFileMap.set(version, [])
      }
      versionToFileMap.get(version).push(file)
    }
  }

  const allVersions = Array.from(versionToFileMap.keys()).sort((a, b) => compareSemver(b, a))

  if (allVersions.length <= maxKept) {
    console.log(`[cleanup-releases] Total de releases (${allVersions.length}) não excede o limite configurado (${maxKept}). Nada a apagar.`)
    return { freedBytes: 0, deletedFiles: 0, keptVersions: allVersions }
  }

  const keptVersions = allVersions.slice(0, maxKept)
  const versionsToDelete = allVersions.slice(maxKept)

  console.log(`[cleanup-releases] Mantendo as ${keptVersions.length} versões mais recentes: ${keptVersions.join(', ')}`)
  console.log(`[cleanup-releases] Removendo ${versionsToDelete.length} versões antigas (limite: ${maxKept})...`)

  let freedBytes = 0
  let deletedFiles = 0

  for (const version of versionsToDelete) {
    const versionFiles = versionToFileMap.get(version) || []
    for (const fileName of versionFiles) {
      const filePath = path.join(releaseDir, fileName)
      try {
        const stat = fs.statSync(filePath)
        freedBytes += stat.size
        fs.unlinkSync(filePath)
        deletedFiles++
      } catch (err) {
        console.warn(`[cleanup-releases] Aviso: não foi possível remover ${fileName}:`, err.message)
      }
    }
  }

  console.log(`[cleanup-releases] Concluído! ${deletedFiles} arquivo(s) removido(s). Espaço liberado: ${formatBytes(freedBytes)}.`)
  return { freedBytes, deletedFiles, keptVersions, versionsToDelete }
}

if (require.main === module) {
  const args = process.argv.slice(2)
  let maxKept = null
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--keep' && args[i + 1]) {
      maxKept = Number(args[i + 1])
    }
  }
  cleanupReleases(maxKept ? { maxKept } : {})
}

module.exports = { cleanupReleases, parseSemver, compareSemver }
