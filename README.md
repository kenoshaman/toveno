# Discord Screen

Sistema privado de compartilhamento de tela integrado ao Discord como plano de controle.

Esta base implementa a Fase 0 e o inicio da Fase 1 do planejamento: monorepo, TypeScript, pnpm workspaces, apps iniciais, pacotes compartilhados, infraestrutura local e bot minimo com `/tela` e `/encerrar`.

## Requisitos

- Node.js 22 ou superior
- pnpm 9 ou superior
- Docker

## Desenvolvimento

```bash
cp .env.example .env
docker compose -f infra/docker-compose.yml up -d
pnpm install
pnpm dev
```

## Configuracao do bot Discord

No arquivo `.env`, preencha:

```env
DISCORD_CLIENT_ID=ID_DA_APLICACAO
DISCORD_BOT_TOKEN=TOKEN_DO_BOT
DISCORD_GUILD_ID=ID_DO_SERVIDOR_DE_TESTE
APP_URL=http://localhost:3000
```

`DISCORD_GUILD_ID` e recomendado em desenvolvimento porque os slash commands aparecem mais rapido no servidor de teste.

Depois de preencher `DISCORD_CLIENT_ID`, gere o link para adicionar o bot no servidor:

```bash
pnpm --filter @discord-screen/bot invite
```

Abra o link no navegador, escolha seu servidor e autorize.

Para rodar site e bot juntos:

```bash
pnpm dev
```

Para rodar separados:

```bash
pnpm dev:web
pnpm dev:bot
```

## Bot minimo

Com o bot rodando:

```text
/tela
```

Cria uma sessao em memoria e responde com botoes de link:

```text
Iniciar compartilhamento
Assistir
```

```text
/encerrar
```

Encerra a sessao ativa do usuario.

## Rotas web iniciais

Tambem existem rotas de teste para validar os botoes do Discord:

```text
http://localhost:3000/transmit/session_teste
http://localhost:3000/watch/session_teste
```

A rota de transmissor ja abre a permissao do navegador para compartilhar tela e mostra uma previa local. Ela ainda nao envia video para outros usuarios.

## Teste local do LiveKit

Depois de preencher `.env` e subir o Docker:

```bash
docker compose -f infra/docker-compose.yml up -d
pnpm dev
```

Abra duas abas com o mesmo `sessionId`:

```text
http://localhost:3000/transmit/session_teste
http://localhost:3000/watch/session_teste
```

Na aba do transmissor, clique em `Compartilhar` e escolha uma tela ou janela. A aba do player deve receber o video pela room `session_teste` no LiveKit local.

## Scripts

```bash
pnpm dev
pnpm build
pnpm lint
pnpm typecheck
```

## Estrutura

```text
apps/bot          Bot Discord em TypeScript com discord.js
apps/web          Aplicacao web Next.js
packages/shared  Tipos e utilitarios compartilhados
packages/database Cliente e esquema inicial do banco
infra             PostgreSQL e LiveKit para desenvolvimento local
```

## Escopo atual

Ainda nao inclui OAuth, streaming WebRTC, persistencia das sessoes ou emissao de tokens LiveKit. Esses itens pertencem as fases seguintes.
