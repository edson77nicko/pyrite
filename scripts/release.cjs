const { execSync } = require('child_process');

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

  console.log('GitHub token found! Running electron-builder publish...');
  process.env.GH_TOKEN = token;
  process.env.GITHUB_TOKEN = token;

  // 1. Build & Publish with electron-builder
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
  const rel103 = releases.find(r => r.tag_name === 'v1.0.3');
  if (rel103) {
    console.log(`Found release v1.0.3 (ID: ${rel103.id}, current draft: ${rel103.draft}). Publishing...`);
    const patchRes = await fetch(`https://api.github.com/repos/edson77nicko/pyrite/releases/${rel103.id}`, {
      method: 'PATCH',
      headers: {
        Authorization: `token ${token}`,
        'User-Agent': 'Pyrita-Release-Agent',
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        draft: false,
        name: 'Pyrita v1.0.3',
        body: '### Novidades na versão 1.0.3:\n- **Gerenciador de Cofres (Vault Switcher)** fiel ao Obsidian com descoberta automática de cofres locais\n- **Barra lateral com largura ajustável por mouse** e indentação compacta de subpastas (sem perda de visão)\n- **Compressão vertical de notas e pastas** (~35% mais conteúdo visível)\n- **Botão Recolher Todas as Pastas** na barra de ferramentas\n- **Sumário Flutuante Direto na Página (Floating Outline Rail)** com indicador na cor do projeto (Ouro Queimado), pílulas de pré-visualização ao passar o mouse e rolagem suave ao clicar'
      })
    });
    const updated = await patchRes.json();
    console.log(`Release status: ${patchRes.status}, draft: ${updated.draft}, tag: ${updated.tag_name}`);
  } else {
    console.warn('Release v1.0.3 not found in list, checking latest endpoint...');
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
