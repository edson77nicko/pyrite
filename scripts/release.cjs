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

#### 🔭 Astrofotografia Hubble & Aba Persistente do Grafo:
- **Grafo como Aba Persistente no Topo**: Agora, ao abrir o modo **Grafo**, ele cria uma aba dedicada (\`Grafo\`) na barra superior. Ao clicar em qualquer estrela/nota para editá-la, a aba do Grafo permanece aberta ao lado das suas notas — permitindo alternar instantaneamente sem nunca perder o seu zoom ou ângulo 3D!
- **Estrelas Ópticas Reais estilo Hubble (Adeus círculos escuros e bordas grossas)**: Removemos 100% dos círculos pretos e cores neon artificiais. Cada nota agora é um ponto puro de emissão de luz aditiva (*Optical Point-Spread Function*) com temperaturas estelares reais (ouro solar, branco Sirius, marfim Vega, âmbar Antares) e raios de difração óptica de 4 pontas (\`+\`) estilo telescópio Hubble/James Webb.
- **Horizonte de Eventos Puro & Anéis Filamentosos de Poeira**: Corrigida a mancha branca sólida no centro e na lateral do buraco negro. O interior da singularidade agora é um abismo negro absoluto cercado por um anel de fótons fino como navalha e centenas de sulcos filamentosos de poeira e plasma dourado/cobre.
- **Fundo Deep-Field do Hubble**: Campo estelar profundo em 3 camadas de magnitude com nebulosas interestelares sutis e filamentos de poeira escura.`
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
