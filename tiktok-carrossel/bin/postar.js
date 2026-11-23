#!/usr/bin/env node
// Publica um carrossel a partir de uma pasta em posts/.
//
// Uso:
//   node bin/postar.js <pasta>            publica posts/<pasta>
//   node bin/postar.js --proxima          publica a próxima pasta ainda não publicada (ordem alfabética)
//   node bin/postar.js <pasta> --dry-run  só valida e mostra o que seria enviado
//   node bin/postar.js --info             mostra o que sua conta permite (privacidade etc.)
const fs = require('fs');
const path = require('path');
const config = require('../src/config');
const tiktok = require('../src/tiktok');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const positional = args.filter((a) => !a.startsWith('--'));

const LIMITS = { maxImages: 35, title: 90, description: 4000, ext: ['.jpg', '.jpeg', '.webp'] };

function listPostDirs() {
  if (!fs.existsSync(config.POSTS_DIR)) return [];
  return fs.readdirSync(config.POSTS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(config.POSTS_DIR, d.name, 'post.json')))
    .map((d) => d.name)
    .sort();
}

function pickFolder() {
  if (args.includes('--proxima')) {
    const next = listPostDirs().find((d) => !fs.existsSync(path.join(config.POSTS_DIR, d, 'publicado.json')));
    if (!next) { console.log('Nenhum post pendente em posts/.'); process.exit(0); }
    return next;
  }
  if (!positional[0]) {
    console.error('Informe a pasta do post (ex.: node bin/postar.js exemplo-reserva-emergencia) ou use --proxima.');
    process.exit(1);
  }
  return positional[0];
}

// Monta a lista de URLs públicas das imagens.
// Em post.json, "images" aceita URLs completas (https://...) ou nomes de arquivo;
// nomes de arquivo viram PUBLIC_BASE_URL/<pasta>/<arquivo>.
// Se "images" for omitido, usa todos os .jpg/.jpeg/.webp da pasta em ordem alfabética.
function resolveImages(folder, post) {
  const dir = path.join(config.POSTS_DIR, folder);
  const list = post.images || fs.readdirSync(dir)
    .filter((f) => LIMITS.ext.includes(path.extname(f).toLowerCase()))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return list.map((item) => {
    if (/^https:\/\//i.test(item)) return item;
    if (!config.publicBaseUrl) {
      throw new Error(`"${item}" é um arquivo local: defina PUBLIC_BASE_URL no .env (domínio verificado no TikTok) ou use URLs completas.`);
    }
    return `${config.publicBaseUrl}/${encodeURIComponent(folder)}/${encodeURIComponent(item)}`;
  });
}

function validate(post, urls) {
  const errors = [];
  if (!urls.length) errors.push('Nenhuma imagem encontrada.');
  if (urls.length > LIMITS.maxImages) errors.push(`Máximo de ${LIMITS.maxImages} imagens (tem ${urls.length}).`);
  for (const u of urls) {
    const ext = path.extname(new URL(u).pathname).toLowerCase();
    if (!LIMITS.ext.includes(ext)) errors.push(`Formato não aceito (use JPG ou WEBP; PNG não é aceito): ${u}`);
  }
  if ((post.title || '').length > LIMITS.title) errors.push(`Título passa de ${LIMITS.title} caracteres.`);
  if ((post.description || '').length > LIMITS.description) errors.push(`Descrição passa de ${LIMITS.description} caracteres.`);
  const cover = post.cover_index ?? 0;
  if (cover < 0 || cover >= urls.length) errors.push(`cover_index ${cover} fora do intervalo 0..${urls.length - 1}.`);
  if (errors.length) throw new Error('Post inválido:\n - ' + errors.join('\n - '));
}

async function checkReachable(urls) {
  for (const u of urls) {
    const res = await fetch(u, { method: 'HEAD' }).catch((e) => ({ ok: false, status: e.message }));
    if (!res.ok) throw new Error(`Imagem inacessível (${res.status}): ${u}\nO TikTok precisa baixar cada imagem dessa URL.`);
  }
}

async function waitForResult(publishId) {
  const finals = ['PUBLISH_COMPLETE', 'SEND_TO_USER_INBOX', 'FAILED'];
  for (let i = 0; i < 40; i++) {
    const s = await tiktok.fetchStatus(publishId);
    process.stdout.write(`\r  status: ${s.status}            `);
    if (finals.includes(s.status)) { process.stdout.write('\n'); return s; }
    await new Promise((r) => setTimeout(r, 3000));
  }
  process.stdout.write('\n');
  return { status: 'AINDA_PROCESSANDO' };
}

async function main() {
  if (args.includes('--info')) {
    console.log(JSON.stringify(await tiktok.creatorInfo(), null, 2));
    return;
  }

  const folder = pickFolder();
  const file = path.join(config.POSTS_DIR, folder, 'post.json');
  if (!fs.existsSync(file)) throw new Error(`Não achei ${path.relative(config.ROOT, file)}`);
  const post = JSON.parse(fs.readFileSync(file, 'utf8'));
  const mode = post.mode === 'rascunho' ? 'rascunho' : 'direct';
  const urls = resolveImages(folder, post);
  validate(post, urls);

  console.log(`Post: ${folder}  (${urls.length} imagens, modo ${mode === 'direct' ? 'publicação direta' : 'rascunho na caixa de entrada'})`);
  urls.forEach((u, i) => console.log(`  ${i + 1}. ${u}${i === (post.cover_index ?? 0) ? '  [capa]' : ''}`));

  if (dryRun) {
    console.log('\n--dry-run: nada foi enviado.');
    return;
  }

  await checkReachable(urls);

  let privacyLevel;
  if (mode === 'direct') {
    const info = await tiktok.creatorInfo();
    const options = info.privacy_level_options || [];
    privacyLevel = post.privacy || 'PUBLIC_TO_EVERYONE';
    if (!options.includes(privacyLevel)) {
      // Apps ainda não auditados pelo TikTok só podem postar como SELF_ONLY (privado).
      const fallback = options.includes('SELF_ONLY') ? 'SELF_ONLY' : options[0];
      console.log(`  Privacidade "${privacyLevel}" não permitida para esta conta/app agora; usando "${fallback}". Opções: ${options.join(', ')}`);
      privacyLevel = fallback;
    }
    console.log(`  Conta: @${info.creator_username} | privacidade: ${privacyLevel}`);
  }

  const { publish_id } = await tiktok.postCarousel({
    title: post.title || '',
    description: post.description || '',
    imageUrls: urls,
    coverIndex: post.cover_index ?? 0,
    privacyLevel,
    disableComment: !!post.disable_comment,
    autoAddMusic: post.auto_add_music !== false,
    brandContent: !!post.brand_content,
    brandOrganic: !!post.brand_organic,
    mode,
  });
  console.log(`  Enviado. publish_id=${publish_id}`);

  const result = await waitForResult(publish_id);
  if (result.status === 'FAILED') throw new Error(`Publicação falhou: ${result.fail_reason || 'motivo não informado'}`);

  fs.writeFileSync(path.join(config.POSTS_DIR, folder, 'publicado.json'), JSON.stringify({
    publish_id, status: result.status, privacy: privacyLevel || null, mode, em: new Date().toISOString(),
  }, null, 2));
  console.log(result.status === 'SEND_TO_USER_INBOX'
    ? 'Enviado para a caixa de entrada do app TikTok: abra o app para finalizar.'
    : `Concluído (${result.status}).`);
}

main().catch((e) => { console.error('\nErro: ' + e.message); process.exit(1); });
