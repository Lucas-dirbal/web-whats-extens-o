# Suporte Compartilhado para WhatsApp Web

Esta extensao permite que varios atendentes acompanhem o mesmo fluxo no WhatsApp Web com sincronizacao centralizada.

## URLs publicas padrao

- API compartilhada: `https://whatsapp-suporte-api.vercel.app`
- Site de avaliacao: `https://avaliacao-de-atendimento.vercel.app`

Os clientes e atendentes nao precisam estar na mesma rede local. A extensao pode usar a API publicada na Vercel por padrao.

## Funcionalidades

- Painel flutuante dentro do WhatsApp Web para acompanhar o status da conversa.
- Painel arrastavel com posicao salva automaticamente.
- Botoes para iniciar e concluir atendimento com mensagens prontas.
- Link unico de avaliacao enviado ao finalizar o atendimento.
- Cabecalho automatico com o nome do atendente nas mensagens enviadas.
- Sincronizacao do estado das conversas entre varios computadores.

## Como usar com a Vercel

### 1. Instalar a extensao

1. Abra o Chrome em `chrome://extensions`.
2. Ative o Modo do desenvolvedor.
3. Clique em Carregar sem compactacao.
4. Selecione a pasta raiz do projeto, a mesma que contem `manifest.json`.

### 2. Configurar cada maquina

1. Clique no icone da extensao.
2. Preencha o Nome do Atendente.
3. Confirme a URL da API como `https://whatsapp-suporte-api.vercel.app`.
4. Confirme a URL do Site de Avaliacao como `https://avaliacao-de-atendimento.vercel.app`.
5. Clique em Salvar.
6. Abra ou recarregue `https://web.whatsapp.com`.

## Modo local opcional

Se voce quiser rodar a API fora da Vercel, o backend local continua disponivel:

```shell
npm install --prefix server
npm start --prefix server
```

Nesse modo, use `http://localhost:3333` no popup da extensao para a maquina local.

## Estrutura principal

- `manifest.json`: configuracao da extensao Chrome.
- `background.js`: service worker que centraliza as chamadas HTTP.
- `content.js`: logica do painel dentro do WhatsApp Web.
- `popup.html` e `popup.js`: configuracao da extensao e resumo das conversas.
- `server/server.js`: API Express com persistencia local ou Vercel Blob.
- `server/data/conversations.json`: base local usada apenas no modo local.

## Observacoes

- O site de avaliacao garante a votacao unica por link no backend remoto.
- Esta extensao nao e uma integracao oficial da Meta/WhatsApp.
- Se o layout do WhatsApp Web mudar, talvez seja preciso ajustar seletores em `content.js`.
