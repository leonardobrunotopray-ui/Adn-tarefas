// Carrega o arquivo .env (sem dependências) e expõe a configuração.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function loadEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    let value = m[2];
    if (/^".*"$|^'.*'$/.test(value)) value = value.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}
loadEnv();

function required(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`Falta a variável ${name} no arquivo .env (veja .env.example).`);
    process.exit(1);
  }
  return v;
}

module.exports = {
  ROOT,
  POSTS_DIR: path.join(ROOT, 'posts'),
  TOKENS_FILE: path.join(ROOT, 'tokens.json'),
  API_BASE: process.env.TIKTOK_API_BASE || 'https://open.tiktokapis.com',
  AUTH_URL: 'https://www.tiktok.com/v2/auth/authorize/',
  get clientKey() { return required('TIKTOK_CLIENT_KEY'); },
  get clientSecret() { return required('TIKTOK_CLIENT_SECRET'); },
  get redirectUri() { return required('TIKTOK_REDIRECT_URI'); },
  get publicBaseUrl() { return (process.env.PUBLIC_BASE_URL || '').replace(/\/+$/, ''); },
  scopes: (process.env.TIKTOK_SCOPES || 'user.info.basic,video.publish,video.upload').trim(),
};
