# Suporte Compartilhado para WhatsApp Web

Extensao do Chrome que adiciona um painel de atendimento dentro do WhatsApp Web e sincroniza o status das conversas em uma API compartilhada.

## Repositorio Git

```text
https://github.com/Lucas-dirbal/web-whats-extens-o/tree/master
```

## Funcionalidades

- Painel flutuante dentro de `https://web.whatsapp.com`.
- Escolha do atendente pelo popup da extensao.
- Status por conversa: sem atendente, pendente, em atendimento e resolvida.
- Botao para iniciar atendimento com mensagem pronta.
- Campo de mensagem rapida para enviar texto manual com cabecalho do atendente.
- Botao para finalizar atendimento com link de avaliacao.
- Marcacao automatica de mensagens enviadas com `*Nome:*`.
- API central para todos os computadores verem o mesmo estado.
- Modo local com banco JSON para teste.
- Modo Vercel com Vercel Blob para producao.

## Arquivos principais

```text
manifest.json        # Manifest V3 da extensao
background.js        # Service worker; faz chamadas HTTP fora do content script
content.js           # Painel, leitura da conversa e envio de mensagens
content.css          # Estilos do painel flutuante
popup.html           # Tela de configuracao
popup.js             # Salva atendente/URLs e mostra resumo de conversas
server/server.js     # API Express para conversas
server/api/          # Entradas usadas pela Vercel
server/data/         # Banco JSON usado no modo local
```

## Instalacao no Chrome

1. Abra `chrome://extensions`.
2. Ative `Modo do desenvolvedor`.
3. Clique em `Carregar sem compactacao`.
4. Selecione esta pasta: `whats extensão`.
5. Abra ou recarregue `https://web.whatsapp.com`.
6. Clique no icone da extensao e selecione o atendente.
7. Salve a configuracao.

URLs padrao:

```text
API: https://whatsapp-suporte-api.vercel.app
Site de avaliacao: https://avaliacao-de-atendimento.vercel.app
```

## Uso diario

1. Abra uma conversa no WhatsApp Web.
2. Confira se o painel mostra o nome correto da conversa.
3. Clique em `Iniciar atendimento` para assumir e enviar a saudacao.
4. Escreva em `Mensagem rapida` quando quiser enviar uma resposta manual.
5. Clique em `Pendente` para devolver a conversa para acompanhamento.
6. Clique em `Concluido` para apenas alterar o status para resolvida.
7. Clique em `Finalizar atendimento` para enviar encerramento com link de avaliacao.
8. Clique em `Finalizar por Inatividade` para encerrar sem avaliacao.

## Rodar API local

```shell
npm run install:server
npm start
```

A API sobe em:

```text
http://localhost:3333
```

No popup da extensao, use essa URL no campo `Endereco da API` se quiser testar localmente.

Comandos uteis:

```shell
npm run status
npm run port
```

Teste manual:

```shell
curl http://localhost:3333/health
curl http://localhost:3333/conversations
```

## Deploy da API na Vercel

Use a pasta `server` como projeto da Vercel.

Para gravar conversas em producao, configure:

```text
BLOB_READ_WRITE_TOKEN
```

Sem Vercel Blob, a API publicada retorna erro ao tentar criar ou atualizar conversas, porque o filesystem da Vercel nao serve como banco permanente.

## Como a extensao funciona

- `popup.js` salva `attendantName`, `apiUrl` e `feedbackUrl` em `chrome.storage.sync`.
- `content.js` le essa configuracao e injeta o painel no WhatsApp Web.
- Quando uma conversa e aberta, `content.js` tenta ler o titulo no cabecalho do WhatsApp.
- A conversa vira um ID simples usando o titulo em minusculas.
- As mudancas de status sao enviadas para a API.
- O envio de mensagem passa pelo campo original do WhatsApp Web.
- `background.js` centraliza as requisicoes para evitar problemas de permissao/CORS no content script.

## Problemas comuns

- Painel nao apareceu: recarregue o WhatsApp Web e confirme se a extensao esta ativa.
- Botoes desativados: selecione um atendente no popup e abra uma conversa.
- API offline: teste `/health` na URL configurada.
- Mensagem nao envia: o WhatsApp Web pode ter mudado seletores; revise `findMessageInput` e `findSendButton` em `content.js`.
- Estado nao sincroniza: confirme se todos usam a mesma URL de API.

## Aviso

Esta extensao automatiza a interface do WhatsApp Web. Ela nao e oficial da Meta/WhatsApp, entao mudancas no layout do WhatsApp podem exigir ajustes no codigo.
