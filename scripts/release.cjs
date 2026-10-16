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

#### 🌌 Motor Singularidade (Gargantua) — WebGL + Órbitas Keplerianas 3D:
- **Buraco Negro Relativístico em Tempo Real (WebGL GLSL)**: Renderização acelerada por GPU do Horizonte de Eventos, Esfera de Fótons, Anel de Einstein, Lente Gravitacional (dobrando a luz do disco de acreção por cima e por baixo da sombra central) e *Doppler Beaming* sincronizado com a cor do seu tema.
- **Mecânica Orbital Kepleriana 3D**: Suas notas agora orbitam o buraco negro em espaço 3D formando braços espirais galácticos por pasta. Notas com mais conexões (*Hubs*) orbitam mais perto do Horizonte de Eventos e emitem filamentos de energia para o anel de fótons.
- **Rastros Cometares, Poeira de Acreção e Jatos Polares**: Cada nota projeta uma cauda luminosa curva ao longo de sua órbita 3D, acompanhada por mais de 400 micro-partículas estelares e jatos relativísticos nos polos.
- **Arcos Sinápticos Geodésicos**: As conexões entre notas curvam-se em 3D puxadas pela gravidade central, com fótons quânticos viajando pelas pontes de luz.
- **Dilatação Temporal Inteligente no Hover**: Ao passar o mouse sobre qualquer nota, o tempo orbital desacelera suavemente até quase parar, garantindo clique e leitura perfeitos.
- **Inclinação 3D Interativa & Modo Contemplação (Zen)**: Segure o Botão Direito (ou \`Alt + Arrastar\`) para inclinar o disco de acreção em 3D ao vivo, ou ative o botão **Contemplar** para transformar o grafo em um planetário vivo que navega sozinho pelas conexões do seu cérebro digital.`
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
