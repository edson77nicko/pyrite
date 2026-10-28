const fs = require('fs');
const path = require('path');
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
    return null;
  }
}

async function uploadFile(token, releaseId, filePath, assetName, contentType) {
  const stats = fs.statSync(filePath);
  const stream = fs.createReadStream(filePath);

  console.log(`Uploading ${assetName} (${stats.size} bytes)...`);

  const url = `https://uploads.github.com/repos/edson77nicko/pyrite/releases/${releaseId}/assets?name=${encodeURIComponent(assetName)}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `token ${token}`,
      'User-Agent': 'Pyrite-Uploader',
      'Content-Type': contentType || 'application/octet-stream',
      'Content-Length': String(stats.size)
    },
    body: stream,
    duplex: 'half'
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`Failed to upload ${assetName}:`, res.status, text);
    return false;
  }

  const json = await res.json();
  console.log(`Successfully uploaded ${assetName}! ID: ${json.id}, State: ${json.state}`);
  return true;
}

async function run() {
  const token = getGitHubToken();
  if (!token) {
    console.error('No token found');
    process.exit(1);
  }

  const version = pkg.version;
  const tag = `v${version}`;

  // Find release
  const relRes = await fetch(`https://api.github.com/repos/edson77nicko/pyrite/releases/tags/${tag}`, {
    headers: {
      Authorization: `token ${token}`,
      'User-Agent': 'Pyrite-Uploader'
    }
  });

  const rel = await relRes.json();
  if (!rel || !rel.id) {
    console.error(`Release ${tag} not found!`, rel);
    process.exit(1);
  }
  console.log(`Release ${tag} ID: ${rel.id}`);

  // Existing assets
  const existingNames = (rel.assets || []).map(a => a.name);
  console.log('Existing assets:', existingNames.join(', '));

  // Files to upload
  const releaseDir = path.join(__dirname, '..', 'release');
  const exeCandidate = fs.existsSync(path.join(releaseDir, `Pyrite Setup ${version}.exe`))
    ? path.join(releaseDir, `Pyrite Setup ${version}.exe`)
    : path.join(releaseDir, `Pyrita Setup ${version}.exe`);

  const filesToUpload = [
    {
      file: path.join(releaseDir, 'latest.yml'),
      name: 'latest.yml',
      type: 'text/yaml'
    },
    {
      file: exeCandidate,
      name: `Pyrite-Setup-${version}.exe`,
      type: 'application/vnd.microsoft.portable-executable'
    }
  ];

  for (const item of filesToUpload) {
    if (!fs.existsSync(item.file)) {
      console.error(`File not found: ${item.file}`);
      continue;
    }

    // If exists, delete first to avoid conflict
    const match = (rel.assets || []).find(a => a.name === item.name);
    if (match) {
      console.log(`Deleting existing asset ${item.name} (ID: ${match.id})...`);
      await fetch(`https://api.github.com/repos/edson77nicko/pyrite/releases/assets/${match.id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `token ${token}`,
          'User-Agent': 'Pyrite-Uploader'
        }
      });
    }

    await uploadFile(token, rel.id, item.file, item.name, item.type);
  }

  // Verify final assets
  const finalCheck = await fetch('https://api.github.com/repos/edson77nicko/pyrite/releases/latest', {
    headers: { 'User-Agent': 'Pyrite-Check' }
  });
  const finalData = await finalCheck.json();
  console.log('\nFinal release assets:');
  if (finalData.assets) {
    finalData.assets.forEach(a => console.log(` - ${a.name} (${a.size} bytes, state: ${a.state})`));
  }
}

run().catch(console.error);
