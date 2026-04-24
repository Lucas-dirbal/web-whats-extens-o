# Suporte Compartilhado para WhatsApp Web

Extensão local para equipes que atendem um único número no WhatsApp Web. Ela mostra um painel dentro do WhatsApp com:

- nome do atendente;
- conversa atual;
- status da conversa;
- quem pegou a conversa;
- ações para pegar, marcar pendente, resolver ou liberar.
- lista resumida das conversas no popup da extensão.

## Como funciona

A extensão roda em cada computador dos atendentes. O seu computador roda a API central, que salva o estado das conversas no arquivo `server/data/conversations.json`.

Todos os atendentes precisam estar na mesma rede ou conseguir acessar o IP do seu computador.

## Instalar a API no seu computador

1. Instale o Node.js se ainda não tiver.
2. Abra o PowerShell nesta pasta.
3. Instale as dependências:

```powershell
npm install
```

4. Inicie a API:

```powershell
npm start
```

A API vai rodar na porta `3333`.

Também funciona entrar diretamente na pasta `server` e rodar os mesmos comandos por lá.

Se aparecer `EADDRINUSE`, significa que a API ja esta aberta na porta `3333`. Confira com:

```powershell
npm run status
```

Para ver qual processo esta usando a porta:

```powershell
npm run port
```

## Descobrir o IP do seu computador

No PowerShell, rode:

```powershell
ipconfig
```

Procure o endereço `IPv4`, por exemplo `192.168.0.10`.

Nos computadores dos atendentes, o endereço da API será:

```text
http://SEU-IP:3333
```

Exemplo:

```text
http://192.168.0.10:3333
```

## Instalar a extensão no Chrome

1. Abra `chrome://extensions`.
2. Ative o `Modo do desenvolvedor`.
3. Clique em `Carregar sem compactação`.
4. Selecione esta pasta: `Extansão`.
5. Abra `https://web.whatsapp.com`.
6. Clique no ícone da extensão.
7. Informe o nome do atendente.
8. Informe o endereço da API.
9. Use o painel que aparece no canto inferior direito do WhatsApp Web para marcar as conversas.

No seu próprio computador servidor, pode usar:

```text
http://localhost:3333
```

Nos outros computadores, use o IP do seu computador.

## Liberar a porta no firewall

Se os outros computadores não conectarem, libere a porta `3333` no Firewall do Windows para rede privada.

## Observação importante

Esta extensão organiza o atendimento visualmente no WhatsApp Web, mas não é uma integração oficial da Meta/WhatsApp Business API. Mudanças no layout do WhatsApp Web podem exigir ajustes no seletor da conversa.
