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

#### 🗺️ Reinvenção Completa do Grafo de Conhecimento (Adeus padrão Obsidian & Plástico Brilhante):
- **Acabamento Dark Matte Architectural**: As esferas com reflexos e brilho plástico foram totalmente eliminadas em favor de superfícies foscas em ardósia com micro-bordas sutis (\`1px solid rgba(255,255,255,0.12)\`) e chips planos.
- **Modo 1: Atlas Topográfico (Ilhas & Continentes)**: As notas agrupam-se por pasta formando territórios e arquipélagos com contornos poligonais suaves (*Convex Hull* dinâmico), relevo em camadas e identificador de setor (\`// SETOR\`).
- **Modo 2: Circuito Neural (Blueprint Cyber-Cartography)**: Diagrama arquitetural de precisão com malha técnica milimétrica, nós como micro-processadores e trilhas de dados ortogonais (em ângulos retos) com pontos de junção.
- **Modo 3: Radar Ecosfera (Gravitação Concêntrica)**: Anéis concêntricos de profundidade (\`RNG 01\`, \`RNG 02\`) com a nota ativa no epicentro e feixe de varredura rotativo que mapeia a distância de cada conexão.
- **Cápsulas Arquiteturais com Level-of-Detail (LOD)**: Notas exibidas como cápsulas elegantes com título legível, ponto indicador da pasta e contador numérico discreto. Ao afastar o zoom, recolhem-se para micro-chips geométricos limpos (\`◇\`).
- **Inspector HUD Arquitetural no Topo Direito**: Painel lateral com rota de navegação (\`VAULT // PASTA\`), coordenadas cartográficas (\`X/Y\`), resumo do conteúdo e pílulas clicáveis das notas conectadas para navegação instantânea.
- **Clique Confiável & Sem Poluição**: O clique responde imediatamente em qualquer resolução/DPR e os textos não poluem mais a tela o tempo todo.`
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
