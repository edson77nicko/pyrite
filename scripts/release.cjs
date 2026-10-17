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

#### ✨ Ajuste Fino na Singularidade:
- **Redução do Brilho e Halos das Estrelas**: A coroa difusa (*PSF halo*) e os raios de difração óptica foram refinados e reduzidos proporcionalmente, resultando em pontos estelares nítidos, elegantes e com proporções astronômicas reais do telescópio Hubble.

#### 🤖 Especialidades do Agente de IA:
- **5 Perfis Especializados com Raciocínio Dedicado**:
  1. 🧠 **Arquiteto de Conhecimento**: Mapeamento conceitual, conexões do Vault, links bidirecionais [[...]] e taxonomias.
  2. ✍️ **Redator & Síntese**: Refinamento de escrita, clareza, fluidez, expansão de ideias e resumos executivos.
  3. 📊 **Estrategista & Artefatos**: Geração de componentes concêntricos visuais nativos (:::kpi, :::timeline, :::comparison, :::card) e planos de ação.
  4. 🔬 **Analista Crítico & Socrático**: Questionamento socrático, auditoria de riscos, trade-offs e premissas ocultas.
  5. 💻 **Engenheiro & Técnico**: Especificações técnicas, modelagem de dados, arquitetura de sistemas e código documentado.
- **Seletor de Especialidades**: Menu dropdown moderno no cabeçalho do agente para alternar o perfil instantaneamente, com persistência e atualização dinâmica dos botões de prompt rápido.

#### 📁 Contexto de Nota + Pasta Inteira no Chat:
- **Trabalhe com Pastas Inteiras como Contexto**: Ao lado da pílula da nota atual (\`@ Nota\`), agora é possível adicionar uma **pasta inteira** (\`📁 + Pasta\`) como contexto para a IA.
- **Cruzamento Semântico em Larga Escala**: Ao selecionar uma pasta, o conteúdo e títulos de todas as notas daquela pasta são injetados no contexto, permitindo à IA comparar, sintetizar e relacionar múltiplos documentos simultaneamente.
- **Controle Flexível**: Alterne ou desative facilmente a nota ou a pasta com um clique nos botões dedicados (\`✕\`).`
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
