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

#### 🌌 Grafo de Conhecimento Cósmico e Interativo:
- **Resolução definitiva do clique**: Calibração exata de viewport, Retina/DPR e hit-test amplo. Clicar em qualquer nó agora abre a nota instantaneamente.
- **Rótulos Limpos e Sem Poluição**: O texto não fica mais permanentemente sobreposto. Rótulos refinados aparecem apenas para o nó ativo, nó em foco e conexões diretas.
- **Card HUD Flutuante**: Ao passar o cursor sobre um nó, um card moderno exibe o título, pasta, tags, conexões e pré-visualização do conteúdo.
- **Modos Constelação e Órbita**: Navegue pelo acervo de forma orgânica (com atração de galáxias por pasta) ou em anéis concêntricos gravitacionais.
- **Auras Celestiais & Fluxo de Partículas**: Conexões com gradientes luminosos e partículas em movimento contínuo.

#### 🤖 Configuração Segura de Provedores e Modelos LLM:
- **Painel Provedor & Modelo**: Suporte nativo para OpenAI, Gemini, DeepSeek e OpenRouter.
- **Campo de Modelo Livre**: Digite qualquer modelo atualizado com botão rápido para limpar.
- **Criptografia de Hardware Segura**: Chaves protegidas localmente no Windows DPAPI (\`safeStorage\`) sem exposição no DOM ou localStorage.
- **Chat Conectado**: Respostas em tempo real com contexto automático da nota ativa e geração de componentes concêntricos (KPI, Timeline, Comparativo, Cards).
- **Modelo Multimodal**: Alternador com selo de processamento nativo ativo.

#### 📝 Editor, Vault & Interface:
- Correção de quebra de linha em listas e checklists com Enter.
- Correção no salvamento e persistência de imagens coladas.
- Popover dropdown minimalista para ajustes visuais.`
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
