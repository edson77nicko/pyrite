const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { execFileSync, execSync } = require('node:child_process')
const pkg = require('../package.json')
const root = path.resolve(__dirname, '..')
const { owner, repo } = pkg.build.publish
const repository = `${owner}/${repo}`
const tag = `v${pkg.version}`

function git(...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim()
}

function getToken() {
  if (process.env.GH_TOKEN || process.env.GITHUB_TOKEN) return process.env.GH_TOKEN || process.env.GITHUB_TOKEN
  const credentials = execFileSync('git', ['credential', 'fill'], {
    cwd: root, input: 'protocol=https\nhost=github.com\n', encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore']
  })
  const token = credentials.split('\n').find(line => line.startsWith('password='))?.slice(9).trim()
  if (!token) throw new Error('Autenticação do GitHub indisponível.')
  return token
}

async function publish() {
  const token = getToken()
  const api = async (endpoint, options = {}) => {
    const response = await fetch(endpoint.startsWith('https://') ? endpoint : `https://api.github.com/repos/${repository}${endpoint}`, {
      ...options,
      headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'Pyrita-Release', Accept: 'application/vnd.github+json', ...options.headers }
    })
    if (!response.ok) throw new Error(`GitHub HTTP ${response.status}: ${(await response.json()).message || response.statusText}`)
    return response.status === 204 ? null : response.json()
  }
  if (git('status', '--porcelain')) throw new Error('Faça commit de todas as alterações antes de publicar.')
  const commit = git('rev-parse', 'HEAD')
  const remoteTag = git('ls-remote', 'origin', `refs/tags/${tag}`, `refs/tags/${tag}^{}`).split('\n')
  if (!remoteTag.some(line => line.startsWith(commit + '\t'))) throw new Error(`Envie o commit e a tag ${tag} ao GitHub antes de publicar.`)
  const notes = fs.readFileSync(path.join(root, 'releases', `${tag}.md`), 'utf8')
  const releases = await api('/releases?per_page=100')
  let release = releases.find(item => item.tag_name === tag)
  if (release && !release.draft) throw new Error(`${tag} já está publicada. Crie uma nova versão para o próximo update.`)
  if (!process.argv.includes('--skip-build')) execSync('npm run build:win -- --publish never', { cwd: root, stdio: 'inherit' })
  const directory = path.join(root, pkg.build.directories.output)
  const metadataPath = path.join(directory, 'latest.yml')
  const metadata = fs.readFileSync(metadataPath, 'utf8')
  const field = name => metadata.match(new RegExp(`^${name}:\\s*(.+)$`, 'm'))?.[1].trim().replace(/^['"]|['"]$/g, '')
  if (field('version') !== pkg.version) throw new Error('latest.yml não corresponde à versão do projeto.')
  const installer = path.join(directory, `${pkg.build.productName} Setup ${pkg.version}.exe`)
  const installerName = field('path')
  if (!installerName || path.basename(installerName) !== installerName) throw new Error('Nome do instalador inválido no latest.yml.')
  const digest = crypto.createHash('sha512').update(fs.readFileSync(installer)).digest('base64')
  if (digest !== field('sha512')) throw new Error('O hash do instalador não corresponde ao latest.yml.')
  if (fs.statSync(installer).size !== Number(metadata.match(/^\s+size:\s*(\d+)/m)?.[1])) throw new Error('O tamanho do instalador não corresponde ao latest.yml.')
  const assets = [
    { file: installer, name: installerName, type: 'application/octet-stream' },
    { file: installer + '.blockmap', name: installerName + '.blockmap', type: 'application/octet-stream' },
    { file: metadataPath, name: 'latest.yml', type: 'text/yaml' }
  ]
  for (const asset of assets) if (!fs.existsSync(asset.file)) throw new Error(`Artefato ausente: ${asset.name}`)
  const json = body => ({ headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!release) release = await api('/releases', { method: 'POST', ...json({ tag_name: tag, target_commitish: commit, name: `Pyrita ${tag}`, body: notes, draft: true, prerelease: false }) })
  console.log(`Preparando ${tag}: instalador e metadata validados. Enviando arquivos ao rascunho...`)
  for (const asset of assets) {
    const existing = release.assets.find(item => item.name === asset.name)
    if (existing) await api(`/releases/assets/${existing.id}`, { method: 'DELETE' })
    const size = fs.statSync(asset.file).size
    const uploaded = await api(`https://uploads.github.com/repos/${repository}/releases/${release.id}/assets?name=${encodeURIComponent(asset.name)}`, {
      method: 'POST', headers: { 'Content-Type': asset.type, 'Content-Length': String(size) }, body: fs.createReadStream(asset.file), duplex: 'half'
    })
    if (uploaded.state !== 'uploaded' || uploaded.size !== size) throw new Error(`Upload incompleto: ${asset.name}`)
    console.log(`Enviado: ${asset.name} (${size} bytes)`)
  }
  const draft = await api(`/releases/${release.id}`)
  for (const asset of assets) {
    if (!draft.assets.some(item => item.name === asset.name && item.state === 'uploaded' && item.size === fs.statSync(asset.file).size)) throw new Error(`Verificação final falhou: ${asset.name}`)
  }
  await api(`/releases/${release.id}`, { method: 'PATCH', ...json({ draft: false, prerelease: false, make_latest: 'true', name: `Pyrita ${tag}`, body: notes }) })
  const publicResponse = await fetch(`https://api.github.com/repos/${repository}/releases/latest`, { headers: { 'User-Agent': 'Pyrita-Release-Verify' } })
  if (!publicResponse.ok) throw new Error(`Não foi possível verificar a release pública: HTTP ${publicResponse.status}`)
  const latest = await publicResponse.json()
  if (latest.tag_name !== tag || latest.draft || latest.prerelease) throw new Error('A versão publicada não está marcada como latest estável.')
  const metadataAsset = latest.assets.find(asset => asset.name === 'latest.yml')
  const remoteMetadata = await fetch(metadataAsset.browser_download_url, { headers: { 'User-Agent': 'Pyrita-Release-Verify' } })
  const normalizeYaml = s => s.replace(/\r\n/g, '\n').trim()
  if (!remoteMetadata.ok || normalizeYaml(await remoteMetadata.text()) !== normalizeYaml(metadata)) throw new Error('A metadata pública não corresponde ao instalador publicado.')
  console.log(`Publicada e verificada: ${latest.html_url}`)
  console.log(`Atualização automática disponível: ${tag}. Assets: ${latest.assets.map(asset => asset.name).join(', ')}`)
}

publish().catch(error => { console.error(`Publicação interrompida: ${error.message}`); process.exitCode = 1 })
