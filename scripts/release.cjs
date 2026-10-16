const { execSync } = require('child_process');
const pkg = require('../package.json');

function getGitHubToken() {
  try {
    const creds = execSync('git credential fill', {
      input: 'protocol=https\nhost=github.com\n',
      encoding: 'utf-8'
    });
    const line = creds.split('\n').find(l => l.startsWith('password='));
    return line ? line.replace('password=', '').trim() : null;
  } catch (e) {
    console.error('Failed to get token from git credential helper', e);
    return null;
  }
}

async function publish() {
  const token = getGitHubToken();
  if (!token) {
    console.error('No GitHub token found!');
    process.exit(1);
  }

  const version = pkg.version;
  const tag = `v${version}`;

  console.log(`GitHub token found! Preparing release for ${tag}...`);
  process.env.GH_TOKEN = token;
  process.env.GITHUB_TOKEN = token;

  // 1. Build & Publish with electron-builder
  console.log('Running build and electron-builder...');
  execSync('npm run build', { stdio: 'inherit', env: process.env });
  execSync('npx electron-builder --win --x64 -p always', { stdio: 'inherit', env: process.env });

  console.log('Build and upload complete. Ensuring release is published (draft: false)...');

  // 2. Patch draft to false on GitHub
  const listRes = await fetch('https://api.github.com/repos/edson77nicko/pyrite/releases', {
    headers: {
      Authorization: `token ${token}`,
      'User-Agent': 'Pyrita-Release-Agent',
      Accept: 'application/vnd.github.v3+json'
    }
  });

  const releases = await listRes.json();
  const rel = Array.isArray(releases) ? releases.find(r => r.tag_name === tag) : null;

  if (rel) {
    console.log(`Found release ${tag} (ID: ${rel.id}, current draft: ${rel.draft}). Publishing...`);
    const patchRes = await fetch(`https://api.github.com/repos/edson77nicko/pyrite/releases/${rel.id}`, {
      method: 'PATCH',
      headers: {
        Authorization: `token ${token}`,
        'User-Agent': 'Pyrita-Release-Agent',
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        draft: false,
        name: `Pyrita ${tag}`,
        body: `### Novidades no Pyrita ${tag}:

#### ✨ Eliminação da Interferência Visual e Redesenho Premium do Grafo:
- **Zero Poluição / Sem Ruído de Rádio**: Eliminados os blocos pontilhados e textos repetitivos de depuração que poluíam cofres grandes com centenas de notas.
- **Filtro de Diretórios no Scanner de Cofre**: O leitor de notas agora ignora automaticamente diretórios não-relacionados como \`node_modules\`, \`dist\`, \`build\` e ocultos, prevenindo centenas de falsas notas.
- **Constelação Sináptica (Matte Gems)**: Cada nó é desenhado como uma gema geométrica fosca com aro fino na cor da pasta e núcleo sólido. Nós centrais com muitas conexões ganham anéis orbitais sutis (estilo astronômico).
- **Rótulos Contextuais Sob Demanda**: Os textos das notas agora **não** poluem mais a tela permanentemente. Eles aparecem com elegância flutuante apenas para a nota ativa, para o nó sob o cursor (hover) e seus vizinhos diretos, e ao buscar por termos.
- **Nebulosas Ambientes de Pasta**: As pastas formam arquipélagos espaciais naturais, com um brilho ambiente fosco e suave ao fundo, sem nenhuma borda dura ou traço pontilhado.
- **Clique Instantâneo e Preciso**: Detecção radial de clique e hover aprimorada, garantindo transição imediata para qualquer nota ao clicar.`
      })
    });
    const updated = await patchRes.json();
    console.log(`Release status: ${patchRes.status}, draft: ${updated.draft}, tag: ${updated.tag_name}`);
  } else {
    console.warn(`Release ${tag} not found in list, checking latest endpoint...`);
  }

  // 3. Verify public release
  const checkRes = await fetch('https://api.github.com/repos/edson77nicko/pyrite/releases/latest', {
    headers: { 'User-Agent': 'Pyrita-Check' }
  });
  const latest = await checkRes.json();
  console.log('Public Latest Release:', latest.tag_name, '| Assets:', latest.assets ? latest.assets.map(a => a.name).join(', ') : 'none');
}

publish().catch(err => {
  console.error('Release failed:', err);
  process.exit(1);
});
