const API = 'https://api.github.com';

function settings() {
  const token = process.env.ADMIN_GITHUB_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY || 'HoussamByoud92/arrawaj-map';
  const branch = process.env.GITHUB_BRANCH || 'main';
  if (!token) throw new Error('ADMIN_GITHUB_TOKEN is not configured.');
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new Error('GITHUB_REPOSITORY must be owner/repository.');
  return { token, repository, branch };
}

async function request(path, options = {}) {
  const { token, repository } = settings();
  const response = await fetch(`${API}/repos/${repository}/contents/${path}`, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`GitHub storage request failed (${response.status}): ${detail.slice(0, 300)}`);
  }
  return response.json();
}

async function readJson(path, fallback) {
  const file = await request(`${path}?ref=${encodeURIComponent(settings().branch)}`);
  if (!file) return { value: fallback, sha: null };
  try {
    return { value: JSON.parse(Buffer.from(file.content, 'base64').toString('utf8')), sha: file.sha };
  } catch {
    throw new Error(`Stored JSON is invalid: ${path}`);
  }
}

async function writeFile(path, content, sha, message) {
  const { branch } = settings();
  const payload = { message, content: Buffer.from(content).toString('base64'), branch };
  if (sha) payload.sha = sha;
  return request(path, { method: 'PUT', body: JSON.stringify(payload) });
}

async function writeJson(path, value, sha, message) {
  return writeFile(path, `${JSON.stringify(value, null, 2)}\n`, sha, message);
}

module.exports = { readJson, writeFile, writeJson };
