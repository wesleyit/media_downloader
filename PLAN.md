# Plano do Projeto — Extensão "Media Downloader"

Extensão para Chrome e Edge (Manifest V3) que, por meio de um switch na aba, salva
localmente todas as imagens renderizadas da página em uma pasta configurada. Na
primeira vez, abre um wizard de configuração; depois funciona direto.

## 1. Decisões fechadas

| Decisão | Escolha |
|---|---|
| Plataforma | Chrome + Edge (Manifest V3) |
| Mecanismo de salvamento | `chrome.downloads` (subpasta dentro de Downloads) |
| Comportamento | Contínuo (imagens atuais + novas via observador) |
| Escopo | Por aba (cada aba tem seu on/off) |
| Fontes | `<img>`, `<picture>`/srcset, CSS `background-image`, `<svg>`, `<canvas>`, data URIs |
| Organização | Subpasta por domínio dentro da pasta base |
| Deduplicação | Sim (por URL + hash de conteúdo) |
| Foco inicial | Apenas imagens (sem vídeo/áudio) |

### Nota sobre o salvamento
O `chrome.downloads` só grava **dentro da pasta Downloads** do navegador (e suas
subpastas). Não é possível escolher um caminho arbitrário do sistema. O usuário
define o nome de uma subpasta base no wizard (ex.: `Downloads/MediaDownloader/`).
A alternativa (File System Access API) permitiria qualquer pasta, mas exige
re-permissão periódica — foi descartada em favor da simplicidade e estabilidade.

## 2. Arquitetura (componentes)

```
┌─────────────────────────────────────────────────────────┐
│                      NAVEGADOR                           │
│                                                          │
│  ┌──────────────┐    mensagens    ┌───────────────────┐  │
│  │  Popup (UI)  │ ◄─────────────► │  Service Worker    │  │
│  │  switch on/  │                 │  (background)      │  │
│  │  off + status│                 │  - estado por aba  │  │
│  └──────────────┘                 │  - fila downloads  │  │
│         │                         │  - chrome.downloads│  │
│         │ abre wizard             │  - dedup registry  │  │
│         ▼                         └─────────┬─────────┘  │
│  ┌──────────────┐                           │ injeta /   │
│  │ Wizard /     │                           │ msg        │
│  │ Options page │                           ▼            │
│  │ - pasta base │                 ┌───────────────────┐  │
│  │ - tipos img  │                 │  Content Script    │  │
│  └──────────────┘                 │  (na aba ativa)    │  │
│         │                         │  - varre DOM       │  │
│         ▼                         │  - MutationObserver│  │
│  chrome.storage.sync              │  - canvas→dataURL  │  │
│  (config persistida)              │  - envia URLs      │  │
│                                   └───────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### Responsabilidades
- **Popup** (`popup.html/js`): switch da aba atual + contador de imagens salvas.
  Ao ligar sem config → abre o wizard.
- **Service Worker** (`background.js`): guarda o estado on/off por `tabId`, recebe
  listas de URLs do content script, aplica dedup, enfileira e dispara
  `chrome.downloads.download()` com o caminho `pastaBase/dominio/arquivo`.
- **Content Script** (`content.js`): injetado na aba quando ligada. Varredura
  inicial do DOM + `MutationObserver` para novos nós; resolve `srcset`/lazy-load,
  extrai `background-image` do CSS computado, serializa `<svg>` e converte
  `<canvas>` para dataURL. Envia tudo ao service worker.
- **Wizard/Options** (`options.html/js`): configuração de pasta base e tipos de
  imagem; salvo em `chrome.storage.sync`.

## 3. Fluxo principal

1. Usuário clica no switch do popup → **ON**.
2. Service worker verifica se há config salva.
   - **Sem config** → abre o wizard e não inicia captura até concluir.
   - **Com config** → injeta/ativa o content script na aba.
3. Content script varre o DOM atual + liga o `MutationObserver`.
4. Para cada imagem: filtra pelos tipos habilitados → envia URL (ou dataURL).
5. Service worker: checa dedup → monta caminho →
   `chrome.downloads.download({ url, filename, saveAs:false, conflictAction:'uniquify' })`.
6. Popup atualiza o contador em tempo real.
7. Switch **OFF** → desliga observer, limpa estado da aba.

## 4. Permissões (manifest.json)

```json
{
  "manifest_version": 3,
  "permissions": ["downloads", "storage", "activeTab", "scripting", "tabs"],
  "host_permissions": ["<all_urls>"],
  "background": { "service_worker": "background.js" },
  "action": { "default_popup": "popup.html" },
  "options_page": "options.html"
}
```

## 5. Tratamento das fontes de imagem (os detalhes difíceis)

| Fonte | Estratégia |
|---|---|
| `<img>` | Usa `currentSrc` (resolve srcset/picture já renderizado) |
| `<picture>`/srcset | `currentSrc` resolve automaticamente a escolhida |
| Lazy-load | `MutationObserver` em `src`/`data-src` + varredura ao ligar |
| CSS `background-image` | `getComputedStyle` em elementos visíveis; regex do `url(...)` |
| `<svg>` inline | Serializa com `XMLSerializer` → Blob `image/svg+xml` |
| `<canvas>` | `canvas.toDataURL()`; cuidado com **tainted canvas** (CORS) — try/catch |
| data URIs | Converte dataURL → Blob → objectURL para o downloads API |
| CORS / hotlink | `chrome.downloads` baixa pela URL original; cross-origin normal funciona |

## 6. Edge cases a tratar

- **Tainted canvas** (cross-origin sem CORS) → não dá para extrair; registrar e pular.
- **Imagens repetidas** → dedup por URL; para dataURLs, hash (SHA-256) do conteúdo.
- **Nome de arquivo** → derivar da URL; sanitizar caracteres inválidos; `conflictAction: 'uniquify'`.
- **Extensão/tipo real** → URL nem sempre tem extensão; usar `Content-Type`/MIME do blob.
- **SPAs** (troca de página sem reload) → observer + detecção de mudança de histórico.
- **Performance** → debounce/throttle no observer; fila com limite de downloads simultâneos.
- **Aba fechada/recarregada** → limpar estado; reinjetar se necessário.
- **Limitação do downloads API** → só subpastas de Downloads (já alinhado).

## 7. Estrutura de arquivos proposta

```
media_downloader/
├── manifest.json
├── background.js          # service worker: estado, fila, downloads, dedup
├── content/
│   ├── content.js         # varredura DOM + observer
│   └── extractors.js      # img, css-bg, svg, canvas, dataURI
├── popup/
│   ├── popup.html
│   ├── popup.css
│   └── popup.js           # switch + contador
├── options/
│   ├── options.html       # wizard / configuração
│   ├── options.css
│   └── options.js         # pasta base + tipos de imagem
├── lib/
│   ├── storage.js         # wrapper chrome.storage
│   ├── filename.js        # sanitização/derivação de nome
│   └── dedup.js           # registro + hashing
├── assets/icons/          # 16/32/48/128px
└── README.md
```

## 8. Modelo de dados (chrome.storage.sync)

```js
{
  configured: true,
  baseFolder: "MediaDownloader",          // subpasta em Downloads
  organizeByDomain: true,
  imageTypes: {                           // tipos habilitados
    jpg: true, png: true, gif: true,
    webp: true, svg: true, bmp: true, avif: true
  }
}
// Estado por aba (em memória no service worker, não persiste):
// tabState = { [tabId]: { enabled: bool, savedCount: int, seen: Set<hash> } }
```

## 9. Roadmap faseado

- **Fase 1 — Esqueleto:** manifest, popup com switch, service worker, estado por
  aba, options page básica. *(extensão carrega e liga/desliga)*
- **Fase 2 — Captura básica:** content script varre `<img>` e baixa via
  `chrome.downloads` na subpasta. Dedup por URL. *(MVP funcional)*
- **Fase 3 — Wizard:** fluxo de primeira configuração (pasta + tipos) + validação.
- **Fase 4 — Contínuo:** `MutationObserver`, lazy-load, SPAs, contador em tempo real.
- **Fase 5 — Fontes avançadas:** CSS backgrounds, SVG, canvas, data URIs + hashing.
- **Fase 6 — Polimento:** ícones, i18n (pt/en), tratamento de erros, badge com
  contador, testes manuais em sites reais.
