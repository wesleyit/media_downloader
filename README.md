# Media Downloader

Extensão para **Chrome** e **Edge** (Manifest V3) que salva localmente todas as
imagens renderizadas de uma aba em uma pasta configurada. Um switch por aba liga
e desliga a captura; na primeira vez, um wizard de configuração é aberto.

## Funcionalidades

- **Switch por aba** — cada aba tem seu próprio on/off.
- **Captura contínua** — salva as imagens já presentes e também as novas que
  aparecem por scroll, lazy-load ou navegação em SPAs (via `MutationObserver`).
- **Múltiplas fontes** — `<img>`, `<picture>`/`srcset`, `background-image` (CSS),
  `<svg>` inline, `<canvas>` e `data:` URIs.
- **Filtro por formato** — JPG, PNG, GIF, WEBP, SVG, BMP, AVIF, ICO.
- **Organização por domínio** — opcionalmente cria uma subpasta por site.
- **Deduplicação** — por URL e por hash SHA-256 do conteúdo (data URIs/canvas/svg).

## Onde os arquivos são salvos

A extensão usa a API `chrome.downloads`, que grava **apenas dentro da pasta
Downloads** do navegador. No wizard você define uma subpasta base, por exemplo
`Downloads/MediaDownloader/`. Com a organização por domínio ativa, o caminho fica
`Downloads/MediaDownloader/exemplo.com/arquivo.jpg`.

> Não é possível escolher um caminho arbitrário do sistema (ex.: `C:\Fotos`).
> Essa é uma limitação da API de extensões, escolhida em favor de simplicidade e
> estabilidade.

## Como instalar (modo desenvolvedor)

1. Abra `chrome://extensions` (ou `edge://extensions`).
2. Ative o **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação** e selecione a pasta deste projeto.
4. Clique no ícone da extensão, ligue o switch e configure na primeira vez.

Dica: para evitar o diálogo "Salvar como" a cada imagem, desative em
`Configurações > Downloads > Perguntar onde salvar cada arquivo`.

## Como usar

1. **Configure na primeira vez** — ao ligar o switch sem configuração, o wizard
   abre automaticamente. Defina a subpasta de destino (dentro de Downloads),
   escolha os formatos de imagem e se quer organização por domínio. Clique em
   **Salvar configuração**.
2. **Ligue a captura** — clique no ícone da extensão e ative o switch
   *"Salvar imagens desta aba"*. A partir daí, todas as imagens já renderizadas
   e as novas que aparecerem (scroll, lazy-load, SPA) são salvas automaticamente.
3. **Acompanhe o progresso** — o popup mostra em tempo real quantas imagens foram
   salvas naquela aba.
4. **Encontre os arquivos** — em `Downloads/<sua-pasta>/` (ou
   `Downloads/<sua-pasta>/<dominio>/` com organização por domínio ativa).
5. **Desligue quando quiser** — desative o switch para parar a captura da aba.
   Cada aba tem seu próprio on/off.
6. **Altere a configuração** — use o botão **Configurações** no popup a qualquer
   momento.

## Estrutura do projeto

```
media_downloader/
├── manifest.json          # Manifest V3
├── background.js          # service worker: estado por aba, fila, downloads, dedup
├── content/
│   ├── extractors.js      # coleta img, CSS backgrounds, svg, canvas, data URIs
│   └── content.js         # varredura + MutationObserver + envio ao background
├── popup/                 # UI do switch e contador
├── options/               # wizard / configuração
├── lib/
│   ├── storage.js         # config em chrome.storage.sync
│   ├── filename.js        # tipos, sanitização e montagem de caminho
│   └── dedup.js           # hashing SHA-256
└── assets/icons/          # ícones 16/32/48/128
```

Consulte [PLAN.md](PLAN.md) para o plano de arquitetura detalhado.

## Limitações conhecidas

- **Canvas cross-origin** sem CORS fica "tainted" e não pode ser exportado — é
  ignorado silenciosamente.
- O caminho de destino é restrito a subpastas de Downloads (ver acima).
- A varredura de `background-image` percorre todos os elementos; em páginas muito
  grandes pode ser custosa (é limitada por debounce e por um cache de elementos já
  processados).
- O estado de habilitação por aba é mantido em memória e espelhado em
  `chrome.storage.session`; é reiniciado ao fechar o navegador.

## Roadmap

Fases futuras (ver [PLAN.md](PLAN.md)): internacionalização (pt/en), badge com
contador no ícone, e suporte a vídeo/áudio.
