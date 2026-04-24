# Suporte Compartilhado para WhatsApp Web

Esta extensão permite que múltiplos atendentes gerenciem conversas no WhatsApp Web de forma sincronizada, utilizando uma API local em Node.js.

## Funcionalidades Principais

- **Painel Flutuante**: Um painel dentro do WhatsApp Web que mostra o status da conversa e o atendente atribuído.
- **Painel Arrastável**: O painel pode ser movido para qualquer lugar da tela e sua posição é salva automaticamente.
- **Mensagens Automáticas**: Botões para iniciar e concluir atendimentos com mensagens personalizadas.
- **Campo de Mensagem Próprio**: Envie mensagens manuais com o prefixo do atendente (`*Nome*: mensagem`) de forma estável.
- **Sincronização em Tempo Real**: O estado das conversas é compartilhado entre todos os computadores conectados à mesma API.

## Como funciona

A extensão roda em cada computador dos atendentes. Um dos computadores (o servidor) roda a API central, que salva o estado das conversas no arquivo `server/data/conversations.json`.

Todos os atendentes precisam estar na mesma rede local para conseguir acessar a API do computador servidor.

## Requisitos

- Node.js instalado no computador que servirá como servidor.
- Navegador Google Chrome.

## Instalação e Uso

### 1. Configurar o Servidor (API)

No computador que será o **servidor**:

1. Instale o Node.js se ainda não tiver.
2. Abra um terminal (como o PowerShell) na pasta do projeto.
3. Instale as dependências do servidor:
   ```shell
   npm install --prefix server
   ```
4. Inicie a API:
   ```shell
   npm start --prefix server
   ```
   A API vai rodar na porta `3333`.

5. **Descubra o IP do seu computador na rede**. No Windows, abra o terminal e digite `ipconfig`. Procure pelo endereço `IPv4` (ex: `192.168.1.11`). Anote este IP.

### 2. Instalar a Extensão no Chrome

Em **cada computador** de atendimento:

1. Abra o Chrome e navegue para `chrome://extensions`.
2. Ative o **Modo do desenvolvedor** no canto superior direito.
3. Clique em **Carregar sem compactação**.
4. Selecione a pasta raiz do projeto (a pasta que contém o arquivo `manifest.json`).

### 3. Configurar a Extensão

1. Após instalar, clique no ícone da extensão na barra de ferramentas do Chrome para abrir o popup.
2. Preencha o **Nome do Atendente**.
3. Preencha a **URL da API**:
   - No **computador servidor**, use: `http://localhost:3333`
   - Nos **outros computadores**, use o IP do servidor que você anotou: `http://192.168.1.11:3333`
4. Clique em **Salvar**.
5. Abra ou atualize a página do [WhatsApp Web](https://web.whatsapp.com). O painel de suporte deve aparecer no canto inferior direito.

## Observações Importantes

- **Firewall**: Se os outros computadores não conseguirem conectar na API, pode ser necessário criar uma regra no Firewall do Windows (no computador servidor) para permitir conexões de entrada na porta TCP `3333` para a rede privada.
- **Estabilidade**: Para evitar o envio de mensagens duplicadas, sempre utilize o campo "Mensagem" e o botão "Enviar com atendente" do painel para mandar mensagens com o prefixo do seu nome.
- **Aviso**: Esta extensão não é uma integração oficial da Meta/WhatsApp. Mudanças no layout do WhatsApp Web podem fazer com que a extensão pare de funcionar, exigindo ajustes no código (principalmente nos seletores de elementos em `content.js`).

## Estrutura do Projeto

- `manifest.json`: Configurações da extensão Chrome (Manifest V3).
- `background.js`: Service worker que faz a ponte para as chamadas de API, evitando problemas de segurança (Mixed Content).
- `content.js`: Lógica principal do painel flutuante que é injetado na página do WhatsApp Web.
- `content.css`: Estilos do painel flutuante.
- `popup.html` / `popup.js`: Interface e lógica da janela de configuração da extensão.
- `server/server.js`: A API local em Node.js/Express que gerencia o estado das conversas.
- `server/data/conversations.json`: Arquivo JSON onde os dados das conversas são armazenados.
