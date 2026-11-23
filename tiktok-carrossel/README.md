# TikTok Carrossel

Publica **carrosséis de imagens** (posts de foto) no seu canal do TikTok pela
**Content Posting API** oficial. Usa só Node.js 18+, sem dependências.

```
tiktok-carrossel/
├── bin/auth.js        → autoriza sua conta (uma vez; renova sozinho por ~1 ano)
├── bin/postar.js      → publica um carrossel a partir de uma pasta em posts/
├── src/               → cliente da API e configuração
├── posts/<pasta>/     → um post por pasta: post.json + imagens 01.jpg, 02.jpg...
└── .env.example       → modelo das credenciais
```

---

## Passo a passo para começar

### 1. Crie o app no TikTok for Developers
1. Acesse **developers.tiktok.com**, entre com sua conta e vá em **Manage apps → Connect an app**.
2. Preencha nome, ícone, categoria, descrição, links de **Termos de Uso** e **Política de Privacidade**
   (o TikTok exige; pode ser uma página simples no seu site).
3. Em **Products**, adicione:
   - **Login Kit**: cadastre o **Redirect URI** (ex.: `https://seudominio.com.br/tiktok/callback`).
     Essa página não precisa fazer nada: você só copia a URL dela depois de autorizar.
   - **Content Posting API**: ative a opção **Direct Post** se quiser publicar direto no perfil.
4. Em **Scopes**, marque `user.info.basic`, `video.publish` (postar direto) e `video.upload` (mandar como rascunho).
5. Copie o **Client Key** e o **Client Secret**.

### 2. Verifique onde as imagens vão ficar hospedadas
Para posts de foto, o TikTok **não aceita upload do arquivo**: ele **baixa cada imagem de uma URL pública**,
e essa URL precisa estar num **domínio (ou prefixo de URL) verificado** no portal.

1. No app, vá em **URL properties** (verificação de domínio/prefixo).
2. Escolha uma opção:
   - **Seu próprio domínio** (ex.: `seudominio.com.br`): verificação por registro TXT no DNS.
   - **Prefixo de URL** (ex.: `https://seudominio.com.br/carrosseis/`): verificação subindo um arquivo de assinatura nesse caminho.
   - Opções baratas de hospedagem: Cloudflare R2 ou Amazon S3 com domínio próprio, GitHub Pages com domínio próprio, ou a hospedagem do seu site.
3. Suba as imagens mantendo a estrutura das pastas: `posts/<pasta>/01.jpg` → `https://seudominio.com.br/carrosseis/<pasta>/01.jpg`.

### 3. Configure o projeto
```bash
cd tiktok-carrossel
cp .env.example .env
# edite o .env com Client Key, Client Secret, Redirect URI e PUBLIC_BASE_URL
```

### 4. Autorize sua conta (uma vez)
```bash
npm run auth
```
Abra o link mostrado, **logado na conta do canal**, e autorize. O TikTok vai te redirecionar
para o Redirect URI; **copie a URL inteira da barra do navegador e cole no terminal**.
Os tokens ficam em `tokens.json` e são renovados automaticamente (o refresh vale ~1 ano).

> Se você cadastrar um Redirect URI `http://localhost:PORTA/...` (permitido para apps Desktop),
> o script captura o código sozinho, sem precisar colar nada.

Para conferir o que sua conta permite agora:
```bash
npm run info
```

### 5. Monte um post
Crie uma pasta em `posts/`, com as imagens e um `post.json` (veja `posts/exemplo-reserva-emergencia/`):

```json
{
  "title": "Reserva de emergência em 5 passos",
  "description": "Legenda com #hashtags ...",
  "images": ["01.jpg", "02.jpg", "03.jpg"],
  "cover_index": 0,
  "mode": "direct",
  "privacy": "PUBLIC_TO_EVERYONE",
  "auto_add_music": true,
  "disable_comment": false,
  "brand_content": false,
  "brand_organic": false
}
```

| Campo | O que é |
|---|---|
| `title` | Título do post (até 90 caracteres) |
| `description` | Legenda, com hashtags (até 4000 caracteres) |
| `images` | Ordem do carrossel. Aceita nomes de arquivo (viram `PUBLIC_BASE_URL/<pasta>/<arquivo>`) ou URLs `https://` completas. Se omitir, usa todos os `.jpg`/`.webp` da pasta em ordem alfabética |
| `cover_index` | Qual imagem é a capa (0 = primeira) |
| `mode` | `direct` publica direto no perfil; `rascunho` manda para a caixa de entrada do app TikTok, onde você escolhe a música e publica |
| `privacy` | `PUBLIC_TO_EVERYONE`, `MUTUAL_FOLLOW_FRIENDS`, `FOLLOWER_OF_CREATOR` ou `SELF_ONLY` |
| `auto_add_music` | Deixa o TikTok colocar uma música automaticamente |
| `brand_content` / `brand_organic` | Marque `true` em publi paga / promoção da sua própria marca (ex.: seu curso ou planilha) |

**Regras das imagens:** de 1 a 35 imagens, só **JPG ou WEBP** (**PNG não é aceito**: exporte do Canva como JPG),
até 20 MB cada. Formato recomendado: **1080×1920 (9:16)**.

### 6. Publique
```bash
node bin/postar.js exemplo-reserva-emergencia --dry-run   # só valida e mostra as URLs
node bin/postar.js exemplo-reserva-emergencia             # publica
npm run proxima                                           # publica a próxima pasta ainda não publicada
```
Depois de publicar, o script cria `publicado.json` na pasta, para não repetir.

### 7. (Opcional) Agende
Coloque várias pastas em ordem (`2026-12-01-reserva`, `2026-12-03-cdb`...) e agende o `npm run proxima`.
Com o cron do Linux/Mac, todo dia às 18h:
```
0 18 * * * cd /caminho/tiktok-carrossel && npm run proxima >> postagens.log 2>&1
```
No Windows, use o Agendador de Tarefas.

---

## Importante: auditoria do app
Enquanto o TikTok **não auditar seu app**, todo post feito pela API sai **privado (`SELF_ONLY`)**:
só você vê. O script detecta isso e avisa. Para postar público:

1. Teste o fluxo com posts privados.
2. No portal, peça a **auditoria** da Content Posting API. O TikTok pede um vídeo de demonstração
   e que a ferramenta mostre ao usuário: o nome da conta, a escolha de privacidade, as opções de
   comentário e o aviso de conteúdo comercial.
3. Enquanto a auditoria não sai, uma alternativa é `"mode": "rascunho"`: o carrossel cai na caixa
   de entrada do app TikTok e você publica de lá (também é bom para escolher uma música em alta).

Limites da API: cerca de 6 requisições de publicação por minuto por usuário, e um número diário de
posts por criador (o TikTok devolve erro de rate limit se passar).

## Segurança
- `.env` e `tokens.json` estão no `.gitignore`. **Nunca faça commit deles.**
- Se o Client Secret vazar, gere outro no portal e rode `npm run auth` de novo.
