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

#### 🌌 Universo Imersivo & Interação Estelar Avançada no Grafo:
- **Visualização Pura sem Nenhuma Nota Ativa**: Agora é possível contemplar o cosmos sem nenhuma nota forçada na seleção. Clicar no fundo vazio do universo desmarca tudo, deixando todas as estrelas orbitando em harmonia natural.
- **Remoção dos Pontos em Movimento nas Linhas**: Removidos completamente os pacotes/fótons de pulso que ficavam correndo pelas linhas, eliminando poluição visual em grafos densos com muitas notas.
- **Cosmos Mais Profundo & Escuro**: O fundo do universo foi reajustado para um tom preto espacial mais escuro e de altíssimo contraste (Hubble Deep Field), preservando todo o calor e a riqueza das auroras douradas e acobreadas do disco de acreção.
- **Tags de Texto Exclusivas para o Grupo Conectado**: O texto flutuante com o nome das notas agora aparece estritamente para a estrela em foco e suas notas conectadas diretas (mesmo ao aplicar zoom, garantindo limpeza visual absoluta).
- **Seleção com Clique Esquerdo & Popover Fixo com Clique Direito**:
  - **Clique Esquerdo em uma Estrela**: Seleciona a nota e destaca todo o seu grupo conectado sem fechar o grafo ou mudar de tela.
  - **Clique Direito em uma Estrela**: Fixa o card (popover) na tela, permitindo mover o cursor livremente, ler o resumo e navegar entre conexões sem que o card suma.
  - **Clique no Fundo**: Fecha o card/popover e limpa a seleção.
  - **Duplo Clique**: Abre a nota diretamente no editor.`
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
