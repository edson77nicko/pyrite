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

#### 🌟 Estrelas Luminous & Calibradas (Óptica Hubble):
- **Equilíbrio Óptico das Estrelas**: Restauração da luminosidade cromática, coroa difusa (*Point-Spread Function*) e raios de difração do espelho secundário (+).
- As notas agora brilham como verdadeiras estrelas do Hubble com espectro de cor térmico estelar (Ouro Solar, Sirius Azul, Âmbar, Vega Cristal), disco colorido radiante e centro incandescente, sem parecerem meros pontinhos brancos estáticos.

#### 🤖 Novo Header do Agente & Seletor de Regras de Permissão:
- **Header Minimalista**: Removido o texto do modelo do cabeçalho, exibindo exclusivamente o ícone de configurações com LED de status da chave.
- **Regra do Agente (Modo Analista vs Modo Co-Autor)**:
  - 👁️ **Modo Analista (Apenas Leitura)**: Foco estritamente consultivo e de pensamento. O agente analisa o contexto da nota e da pasta, dialoga e responde no chat sem alterar arquivos.
  - ✍️ **Modo Co-Autor (Edição & Criação)**: O agente ganha autonomia de escrita para injetar artefatos concêntricos nativos (\`:::kpi\`, \`:::timeline\`, \`:::comparison\`, \`:::card\`) diretamente na nota ativa com um clique, substituir o conteúdo ou gerar novas notas no cofre.

#### ⚙️ Modal Unificado de Configurações com Sidebar Lateral:
- **Popup Completo em 3 Abas**:
  1. 🤖 **Configurações do Modelo**: Gerenciamento de provedores (OpenRouter, OpenAI, Gemini, DeepSeek, Groq, Ollama), modelos e chaves protegidas por criptografia Windows DPAPI (safeStorage).
  2. 🧠 **Especialidades do Agente**: Seleção e visualização dos 5 perfis cognitivos (Arquiteto, Redator, Estrategista, Crítico, Técnico) com diretrizes do sistema e prompts rápidos.
  3. ⚡ **Instalar Skills (Habilidades)**: Catálogo modular para ativar/desativar habilidades do agente (Artefatos Concêntricos, Mapeador de Grafos, Auditor de Pastas, Co-Autoria, Exportador Executivo, etc.).`
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
