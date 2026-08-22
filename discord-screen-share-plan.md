# Discord Screen — Plano de Construção

> Especificação inicial para desenvolvimento no VS Code com Codex.

## 1. Visão do projeto

**Discord Screen** é um sistema privado de compartilhamento de tela para grupos de amigos que já utilizam o Discord para voz, chat, presença e organização.

A ideia central é manter o Discord como **interface social e plano de controle**, enquanto a transmissão de vídeo acontece em uma infraestrutura independente.

O fluxo desejado deve ser tão simples quanto o antigo Go Live:

1. Usuário entra em um canal de voz no Discord.
2. Executa `/tela`.
3. O bot cria uma sessão privada de transmissão.
4. O usuário inicia a captura da tela pelo transmissor web/app.
5. O bot publica uma mensagem com botão **Assistir**.
6. Outros membros autorizados clicam uma vez.
7. O player abre já autenticado e começa a exibir a tela.
8. Ao encerrar, a sessão e os tokens temporários deixam de funcionar.

O Discord **não transporta o vídeo**. Ele serve para autenticação, descoberta da sessão e controle de acesso.

---

## 2. Objetivos

### Objetivos principais

- Compartilhar tela com poucos cliques.
- Manter a conversa de voz no Discord.
- Evitar criação manual de salas e envio de links.
- Permitir entrada e saída de espectadores a qualquer momento.
- Restringir transmissões aos membros autorizados.
- Ter baixa latência.
- Suportar inicialmente:
  - 720p / 30 FPS;
  - 1080p / 30 FPS;
  - posteriormente 1080p / 60 FPS.
- Suportar áudio da tela quando tecnicamente disponível.
- Não gravar transmissões.
- Não manter vídeos em armazenamento.
- Utilizar tokens de acesso curtos e descartáveis.
- Ser simples o suficiente para uso entre amigos.

### Objetivos futuros

- Escolha entre tela inteira e janela.
- Indicador de espectadores.
- Múltiplas transmissões simultâneas.
- Picture-in-picture.
- Aplicativo desktop.
- Qualidade automática/adaptativa.
- Compartilhamento de áudio do sistema.
- Permissões por cargo do Discord.
- Lista de amigos/servidores autorizados.
- Eventual aferição de idade por provedor externo, caso necessária.

---

## 3. Não objetivos

A primeira versão **não deve**:

- modificar o cliente do Discord;
- usar self-bots;
- falsificar localização;
- utilizar VPN automaticamente;
- chamar APIs privadas ou não documentadas do Discord;
- tentar reativar o Go Live nativo;
- injetar vídeo no protocolo interno de voz/vídeo do Discord;
- depender de Discord Activities para transportar WebRTC;
- gravar transmissões;
- criar uma plataforma pública de streaming;
- permitir acesso anônimo;
- armazenar documentos de identidade;
- implementar infraestrutura própria de WebRTC do zero.

O sistema deve ser uma aplicação independente que apenas utiliza integrações oficiais do Discord.

---

# 4. Experiência desejada

## 4.1 Fluxo do transmissor

No Discord:

```text
/tela
```

Bot:

```text
🔴 Preparando sua transmissão

Canal: Geral
Qualidade: 1080p / 30 FPS

[ Iniciar compartilhamento ]
[ Cancelar ]
```

Ao clicar em **Iniciar compartilhamento**, abre o transmissor:

```text
Discord Screen

Compartilhar:
( ) Tela inteira
( ) Janela
( ) Aba

Qualidade:
1080p / 30 FPS

[ Compartilhar ]
```

Depois de iniciar:

```text
🔴 Fulano está transmitindo

Canal: Geral
1080p • 30 FPS

[ Assistir ]

👁 3 assistindo
```

---

## 4.2 Fluxo do espectador

O usuário clica:

```text
[ Assistir ]
```

O sistema:

1. autentica o usuário via Discord OAuth2;
2. identifica seu Discord User ID;
3. valida se ele pertence ao servidor;
4. valida se ele está autorizado para a sessão;
5. emite um token temporário;
6. abre o player;
7. conecta ao servidor de mídia.

Player:

```text
┌─────────────────────────────────────┐
│ Fulano — compartilhando tela        │
│                                     │
│       [      VÍDEO       ]          │
│                                     │
│ 1080p • 30 FPS • 38ms               │
│                                     │
│ Tela cheia | PiP | Volume           │
└─────────────────────────────────────┘
```

---

# 5. Arquitetura

## 5.1 Visão geral

```text
                           DISCORD
                              │
                  Slash Commands / Buttons
                              │
                              ▼
                     ┌─────────────────┐
                     │   Discord Bot   │
                     │  discord.js     │
                     └────────┬────────┘
                              │
                              ▼
                     ┌─────────────────┐
                     │     Backend     │
                     │ API + Auth + ACL│
                     └───────┬─────────┘
                             │
              ┌──────────────┴──────────────┐
              │                             │
              ▼                             ▼
     ┌─────────────────┐           ┌─────────────────┐
     │   PostgreSQL    │           │  Media Server   │
     │ sessões / ACL   │           │ LiveKit / SFU   │
     └─────────────────┘           └────────┬────────┘
                                            │
                                  WebRTC    │
                       ┌────────────────────┴──────────────┐
                       │                                   │
                       ▼                                   ▼
              ┌─────────────────┐                 ┌─────────────────┐
              │   Transmissor   │                 │     Player      │
              │ captura a tela  │                 │ espectadores    │
              └─────────────────┘                 └─────────────────┘
```

---

# 6. Stack proposta

## Monorepo

- Node.js
- TypeScript
- pnpm
- Turborepo opcional

## Bot

- `discord.js`

Responsabilidades:

- slash commands;
- botões;
- mensagens/embeds;
- identificar servidor/canal;
- iniciar e encerrar sessões;
- entregar links temporários;
- atualizar número de espectadores.

## Frontend

- Next.js
- React
- TypeScript

Páginas principais:

```text
/transmit/:sessionId
/watch/:sessionId
/auth/discord/callback
```

## Backend

Primeira opção:

- Next.js API Routes / Route Handlers

Se crescer:

- Fastify ou NestJS em serviço separado.

Responsabilidades:

- Discord OAuth2;
- sessões;
- autorização;
- emissão de tokens LiveKit;
- webhooks/eventos;
- gerenciamento de espectadores.

## Banco

Produção:

- PostgreSQL.

Desenvolvimento inicial:

- PostgreSQL local via Docker.

ORM sugerido:

- Prisma ou Drizzle.

## Mídia

Recomendação inicial:

- **LiveKit self-hosted**

Motivos:

- WebRTC já resolvido;
- SFU;
- suporte a múltiplos espectadores;
- controle de rooms;
- tokens;
- SDK web;
- não precisamos implementar RTP/WebRTC na mão.

Alternativas a avaliar posteriormente:

- mediasoup;
- Janus;
- Pion;
- Cloudflare Calls;
- serviço LiveKit Cloud.

Para o MVP, preferir LiveKit.

---

# 7. Separação de responsabilidades

## Discord

Responsável por:

- identidade;
- servidor;
- canal;
- descoberta;
- botões;
- comandos;
- experiência social.

Não responsável por:

- transportar vídeo;
- armazenar vídeo;
- processar vídeo.

## Backend

Responsável por:

- autenticação;
- autorização;
- sessões;
- segurança;
- emissão de credenciais temporárias.

## LiveKit

Responsável por:

- conexão WebRTC;
- publicação de vídeo;
- distribuição do vídeo;
- controle da room;
- qualidade de mídia.

## Browser/App

Responsável por:

- captura de tela;
- seleção de janela/tela;
- envio do stream;
- reprodução do stream.

---

# 8. Modelo de sessão

Uma sessão de transmissão deve possuir algo parecido com:

```ts
type StreamSession = {
  id: string;

  guildId: string;
  voiceChannelId: string;

  ownerDiscordId: string;

  livekitRoomName: string;

  status:
    | "CREATED"
    | "WAITING_FOR_PUBLISHER"
    | "LIVE"
    | "ENDED";

  createdAt: Date;
  startedAt?: Date;
  endedAt?: Date;
};
```

---

# 9. Modelo de dados inicial

## User

```text
id
discordUserId
username
avatarUrl
createdAt
lastLoginAt
```

## Guild

```text
id
discordGuildId
name
createdAt
```

## StreamSession

```text
id
guildId
voiceChannelId
ownerUserId
livekitRoomName
status
createdAt
startedAt
endedAt
```

## StreamViewer

```text
id
sessionId
userId
joinedAt
leftAt
```

## UserVerification

Somente se no futuro for necessária aferição adicional:

```text
id
userId
provider
over18
verifiedAt
expiresAt
```

Não armazenar:

- RG;
- CPF;
- CNH;
- foto do documento;
- selfie;
- biometria.

Se houver verificação, preferir provedor que retorne apenas o resultado necessário.

---

# 10. Autenticação

Utilizar Discord OAuth2.

Escopos mínimos inicialmente:

```text
identify
guilds
```

Evitar solicitar permissões que não sejam necessárias.

Fluxo:

```text
Usuário
   ↓
Login com Discord
   ↓
OAuth callback
   ↓
Backend obtém identidade
   ↓
Backend cria sessão web
```

A aplicação deve trabalhar principalmente com:

```text
discordUserId
guildId
```

---

# 11. Autorização

A regra inicial mais segura:

> Um usuário só pode assistir se estiver autorizado para a sessão e for membro do servidor de Discord associado.

Podemos adicionar regras.

## MVP

```text
membro do servidor = permitido
```

## Depois

```text
membro do servidor
AND
possui cargo permitido
```

ou:

```text
membro do servidor
AND
está no mesmo voice channel
```

### Observação importante

Exigir que o espectador permaneça no mesmo canal de voz pode deixar a experiência muito parecida com o Go Live.

Exemplo:

```text
Servidor: Meu Discord
Canal: Geral

Fulano está em Geral
Pedro está em Geral

Pedro → autorizado

João está em AFK

João → não autorizado
```

Isso pode ser configurável por servidor.

---

# 12. Tokens

Nunca entregar credenciais permanentes do servidor de mídia.

Criar token curto por usuário.

Exemplo conceitual:

```text
sub: discordUserId
room: stream_abc123
role: viewer
exp: +5 minutos
```

Para transmissor:

```text
role: publisher
canPublish: true
canSubscribe: true
```

Para espectador:

```text
role: viewer
canPublish: false
canSubscribe: true
```

---

# 13. Comandos Discord

## `/tela`

Cria nova sessão.

Possíveis opções futuras:

```text
/tela qualidade:1080p fps:30
```

Resposta:

```text
🔴 Sua transmissão está pronta.

[ Iniciar compartilhamento ]
```

---

## `/encerrar`

Encerra a transmissão ativa do usuário.

---

## `/quem-assiste`

Opcional.

Exibe espectadores atuais.

---

## `/config-tela`

Futuro.

Configura:

```text
Quem pode assistir:
- todos no servidor
- mesmo canal de voz
- cargos selecionados

Qualidade padrão:
- 720p
- 1080p

FPS:
- 30
- 60
```

---

# 14. Componentes Discord

Utilizar:

- Slash Commands;
- Buttons;
- Embeds;
- Ephemeral Messages quando apropriado.

Evitar spam no canal.

Exemplo:

```text
🔴 Fulano está compartilhando a tela

Geral
1080p • 30 FPS

[ Assistir ]

👁 4 espectadores
```

Ao terminar:

```text
⚫ Transmissão encerrada
```

O botão deve deixar de funcionar.

---

# 15. Captura de tela

Primeiro MVP via browser:

```js
navigator.mediaDevices.getDisplayMedia({
  video: true,
  audio: true
});
```

O navegador apresenta sua própria interface de seleção.

Vantagens:

- não instalar programa;
- multiplataforma;
- rápido para prototipar.

Limitações:

- captura de áudio varia por sistema operacional/navegador;
- alguns controles são limitados;
- não conseguimos esconder completamente a interface de seleção;
- performance pode variar.

---

# 16. Aplicativo desktop futuro

Depois que o MVP funcionar, criar um aplicativo desktop pode melhorar muito a UX.

Possibilidades:

- Tauri;
- Electron;
- aplicação nativa.

Objetivo:

```text
Discord:
/tela

↓ eventualmente abre automaticamente

Discord Screen Desktop:
[ Minecraft ]

Compartilhar
```

O app desktop poderia:

- lembrar monitor/janela;
- capturar áudio do sistema com mais controle;
- iniciar na bandeja;
- detectar jogos;
- receber deep links;
- melhorar encoder;
- controlar qualidade;
- permitir hotkeys.

Não fazer isso antes do MVP web funcionar.

---

# 17. Deep Links

O botão do Discord pode usar um URL como:

```text
https://screen.exemplo.com/watch/SESSION_TOKEN
```

Para transmissor:

```text
https://screen.exemplo.com/transmit/SESSION_TOKEN
```

O token no link NÃO deve ser suficiente sozinho para obter acesso.

O backend ainda deve validar:

```text
Discord login
+
usuário
+
guild
+
permissão
+
sessão ativa
```

---

# 18. Segurança

Obrigatório desde o início:

- HTTPS;
- tokens curtos;
- secrets somente no servidor;
- validação de Discord User ID;
- rate limiting;
- CSRF quando aplicável;
- cookies `HttpOnly`;
- cookies `Secure`;
- proteção contra replay;
- sessão encerrada invalida acesso;
- não confiar em parâmetros enviados pelo frontend;
- logs sem informações sensíveis.

Nunca colocar no frontend:

```text
DISCORD_CLIENT_SECRET
LIVEKIT_API_SECRET
DATABASE_URL
```

---

# 19. Privacidade

Princípios:

## Minimização

Guardar apenas o necessário.

## Sem gravação

Nenhum stream deve ser gravado por padrão.

## Sem VOD

Encerrada a transmissão, não existe replay.

## Sem thumbnails persistentes

Não salvar frames da transmissão.

## Logs

Registrar coisas como:

```text
session_created
viewer_joined
viewer_left
session_ended
```

Não registrar conteúdo de vídeo ou áudio.

---

# 20. Aferição de idade

Não implementar no MVP sem necessidade clara.

Se futuramente for necessária:

- usar provedor especializado;
- solicitar somente o mínimo necessário;
- preferir resultado booleano;
- não armazenar documento;
- não armazenar biometria;
- definir expiração da verificação;
- documentar a base jurídica;
- obter análise jurídica antes de abrir o serviço ao público.

Possível resultado:

```json
{
  "over18": true
}
```

Banco:

```text
discordUserId
over18 = true
provider
verifiedAt
expiresAt
```

**Importante:** verificação de idade não deve ser tratada como autorização automática para contornar restrições da plataforma Discord. O projeto deve continuar sendo um serviço de mídia independente.

---

# 21. Escopo legal e de plataforma

O projeto deve ser desenvolvido como:

> Serviço privado independente de compartilhamento de tela integrado ao Discord por APIs oficiais.

Evitar:

- engenharia reversa do Go Live;
- protocolos privados do Discord;
- bypass de geolocalização;
- cliente modificado;
- self-bots;
- automação de conta de usuário;
- tentativa de mascarar tráfego como Discord;
- injeção de vídeo na infraestrutura nativa do Discord.

Antes de abrir o produto publicamente ou comercializá-lo, revisar:

- Termos do Discord;
- Discord Developer Policy;
- legislação brasileira aplicável;
- LGPD;
- obrigações relacionadas a menores;
- requisitos de consentimento e privacidade.

Este documento é planejamento técnico, não parecer jurídico.

---

# 22. Estrutura sugerida do repositório

```text
discord-screen/
│
├─ apps/
│  │
│  ├─ bot/
│  │  ├─ src/
│  │  │  ├─ commands/
│  │  │  │  ├─ tela.ts
│  │  │  │  └─ encerrar.ts
│  │  │  ├─ interactions/
│  │  │  ├─ services/
│  │  │  └─ index.ts
│  │  │
│  │  └─ package.json
│  │
│  └─ web/
│     ├─ app/
│     │  ├─ transmit/
│     │  ├─ watch/
│     │  ├─ api/
│     │  └─ auth/
│     ├─ components/
│     ├─ lib/
│     └─ package.json
│
├─ packages/
│  │
│  ├─ database/
│  │  ├─ schema/
│  │  └─ client.ts
│  │
│  ├─ discord/
│  │
│  ├─ livekit/
│  │
│  ├─ auth/
│  │
│  └─ shared/
│
├─ infra/
│  ├─ docker-compose.yml
│  └─ livekit/
│
├─ docs/
│  ├─ architecture.md
│  ├─ security.md
│  └─ decisions/
│
├─ .env.example
├─ package.json
├─ pnpm-workspace.yaml
└─ README.md
```

---

# 23. Variáveis de ambiente

Exemplo:

```env
# Discord
DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=
DISCORD_BOT_TOKEN=
DISCORD_REDIRECT_URI=

# Database
DATABASE_URL=

# LiveKit
LIVEKIT_URL=
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=

# App
APP_URL=http://localhost:3000
SESSION_SECRET=
```

Nunca versionar `.env`.

Adicionar:

```text
.env
.env.local
```

ao `.gitignore`.

---

# 24. Docker Compose local

Serviços inicialmente:

```text
postgres
livekit
```

Opcional futuramente:

```text
redis
coturn
```

O ambiente de desenvolvimento deve permitir:

```bash
docker compose up -d
pnpm install
pnpm dev
```

---

# 25. TURN

WebRTC nem sempre consegue conexão direta.

Em produção será necessário planejar TURN.

Possibilidade:

- coturn.

Fluxo:

```text
Browser
   ↓
STUN
   ↓
tenta conexão

se bloqueado:

Browser
   ↓
TURN
   ↓
LiveKit
```

Não ignorar TURN em produção.

---

# 26. API inicial

## Criar sessão

```http
POST /api/streams
```

Entrada:

```json
{
  "guildId": "...",
  "voiceChannelId": "..."
}
```

Resposta:

```json
{
  "sessionId": "...",
  "transmitUrl": "...",
  "watchUrl": "..."
}
```

---

## Obter sessão

```http
GET /api/streams/:id
```

---

## Obter token de transmissor

```http
POST /api/streams/:id/publisher-token
```

Somente owner.

---

## Obter token de espectador

```http
POST /api/streams/:id/viewer-token
```

Backend valida permissão antes de emitir.

---

## Encerrar sessão

```http
POST /api/streams/:id/end
```

Somente owner ou administrador autorizado.

---

# 27. Máquina de estados

```text
CREATED
   │
   ▼
WAITING_FOR_PUBLISHER
   │
   ▼
LIVE
   │
   ▼
ENDED
```

Casos especiais:

```text
WAITING_FOR_PUBLISHER
   │
   └─ timeout de 5 minutos → ENDED
```

```text
LIVE
   │
   └─ publisher desconecta por muito tempo → ENDED
```

---

# 28. Eventos internos

Criar eventos como:

```text
stream.created
stream.started
stream.ended

viewer.joined
viewer.left

publisher.connected
publisher.disconnected
```

Isso evita acoplamento excessivo entre bot, backend e mídia.

---

# 29. Atualização do embed

Ao iniciar:

```text
🔴 AO VIVO
```

Ao mudar espectadores:

```text
👁 3 assistindo
```

Não atualizar mensagem a cada evento individual se isso gerar rate limit.

Fazer debounce.

Exemplo:

```text
atualizar no máximo a cada 5–10 segundos
```

---

# 30. Falhas esperadas

## Transmissor fecha navegador

- detectar desconexão;
- aguardar pequeno grace period;
- encerrar sessão se não retornar.

## LiveKit indisponível

Mostrar:

```text
Não foi possível iniciar a transmissão.
Tente novamente.
```

## Usuário não autorizado

Mostrar:

```text
Você não tem acesso a esta transmissão.
```

## Sessão encerrada

Mostrar:

```text
Esta transmissão já terminou.
```

## Usuário sai do canal de voz

Dependendo da configuração:

- remover acesso imediatamente; ou
- permitir continuar assistindo.

MVP pode usar regra mais simples por guild.

---

# 31. Observabilidade

Inicialmente:

- logs estruturados;
- erros;
- conexões;
- duração das sessões;
- número máximo de espectadores.

Não registrar conteúdo da transmissão.

Eventos úteis:

```text
stream_created
stream_started
stream_failed
stream_ended
viewer_joined
viewer_left
token_denied
```

---

# 32. Testes

## Unitários

Testar:

- autorização;
- geração de tokens;
- estado das sessões;
- validação de owner.

## Integração

Testar:

```text
/tela
→ cria sessão
→ botão funciona
→ transmissor conecta
→ espectador conecta
→ encerra
```

## Segurança

Testar:

- token expirado;
- token de outra sessão;
- usuário de outro servidor;
- usuário não logado;
- sessão encerrada;
- tentativa de publicar como viewer.

---

# 33. Fases de desenvolvimento

## Fase 0 — Base

- [ ] Criar monorepo.
- [ ] Configurar TypeScript.
- [ ] Configurar pnpm.
- [ ] Criar `.env.example`.
- [ ] Criar Docker Compose.
- [ ] Subir PostgreSQL.
- [ ] Subir LiveKit.
- [ ] Criar aplicação Discord de teste.

---

## Fase 1 — Bot mínimo

- [ ] Bot entra online.
- [ ] Registrar slash commands.
- [ ] Implementar `/tela`.
- [ ] Bot responde com mensagem.
- [ ] Bot gera um `sessionId`.
- [ ] Implementar `/encerrar`.

Objetivo:

```text
/tela
→ sessão criada
```

Ainda sem vídeo.

---

## Fase 2 — Login Discord

- [ ] Implementar Discord OAuth2.
- [ ] Criar sessão web.
- [ ] Persistir Discord User ID.
- [ ] Validar guild.

Objetivo:

```text
clicar Assistir
→ login
→ aplicação sabe quem é o usuário
```

---

## Fase 3 — LiveKit básico

- [ ] Criar room.
- [ ] Gerar publisher token.
- [ ] Gerar viewer token.
- [ ] Publicar câmera de teste.
- [ ] Assistir do segundo navegador.

Objetivo:

```text
Browser A → publica
Browser B → assiste
```

---

## Fase 4 — Compartilhamento de tela

- [ ] Trocar câmera por `getDisplayMedia`.
- [ ] Selecionar monitor/janela.
- [ ] Publicar screen track.
- [ ] Exibir no player.
- [ ] Implementar fullscreen.

Objetivo:

```text
PC A compartilha tela
PC B assiste
```

---

## Fase 5 — Discord + vídeo integrados

- [ ] `/tela` cria session no backend.
- [ ] Bot publica botão de transmitir.
- [ ] Bot publica botão de assistir.
- [ ] Viewer autentica.
- [ ] Backend valida autorização.
- [ ] LiveKit token é emitido.
- [ ] Embed mostra LIVE.
- [ ] `/encerrar` fecha room.

Esse é o primeiro **MVP real**.

---

## Fase 6 — UX

- [ ] Mostrar espectadores.
- [ ] Mostrar qualidade.
- [ ] Tela cheia.
- [ ] Picture-in-picture.
- [ ] Reconexão automática.
- [ ] Grace period.
- [ ] Mensagens de erro decentes.
- [ ] Dark mode.

---

## Fase 7 — Hardening

- [ ] Rate limiting.
- [ ] Auditoria de permissões.
- [ ] TURN.
- [ ] Reverse proxy.
- [ ] HTTPS.
- [ ] Logs.
- [ ] Métricas.
- [ ] Testes de carga.
- [ ] Revisão de privacidade.

---

# 34. MVP — definição de pronto

O MVP está pronto quando este fluxo funcionar:

```text
1. Dois usuários entram no mesmo servidor Discord.

2. Usuário A executa:

   /tela

3. O bot cria uma transmissão.

4. Usuário A clica:

   Iniciar compartilhamento

5. Browser pede:
   "Qual tela deseja compartilhar?"

6. Usuário A escolhe uma tela.

7. Bot mostra:

   🔴 Usuário A está transmitindo
   [ Assistir ]

8. Usuário B clica:

   Assistir

9. Usuário B autentica via Discord,
   se ainda necessário.

10. Usuário B vê a tela de A
    com baixa latência.

11. Usuário A usa:

    /encerrar

12. O vídeo é encerrado para todos.

13. O token anterior deixa de funcionar.
```

---

# 35. Critérios de aceitação do MVP

- [ ] Nenhum link manual precisa ser copiado.
- [ ] Espectador entra com no máximo um clique depois de autenticado.
- [ ] Usuário não autorizado não consegue assistir.
- [ ] Vídeo não é armazenado.
- [ ] Sessão encerrada não pode ser reaberta.
- [ ] Viewer não consegue publicar vídeo.
- [ ] Owner pode encerrar a sessão.
- [ ] Bot mostra estado correto.
- [ ] Reconexão simples funciona.
- [ ] Latência é aceitável para assistir jogos/tela.
- [ ] Funciona em Chrome/Edge desktop.
- [ ] Discord continua sendo usado normalmente para voz.

---

# 36. Decisões técnicas iniciais

## ADR-001 — Discord não transporta mídia

**Decisão:** usar Discord apenas como plano de controle.

**Motivo:** reduz acoplamento e evita depender de protocolo interno de vídeo.

---

## ADR-002 — WebRTC via LiveKit

**Decisão:** utilizar LiveKit inicialmente.

**Motivo:** evitar implementar SFU, RTP, ICE e gerenciamento de mídia do zero.

---

## ADR-003 — Browser primeiro

**Decisão:** transmissor inicialmente será web.

**Motivo:** chegar ao MVP antes de construir um aplicativo desktop.

---

## ADR-004 — Sem gravação

**Decisão:** nenhum recurso de gravação no MVP.

**Motivo:** privacidade, simplicidade e menor risco.

---

## ADR-005 — Discord OAuth2

**Decisão:** identidade baseada no Discord.

**Motivo:** usuários já possuem conta e o projeto é orientado a servidores Discord.

---

# 37. Questões em aberto

Não precisam bloquear o MVP:

- Qualidade padrão: 720p ou 1080p?
- 30 ou 60 FPS?
- Permitir todos da guild ou somente mesmo canal de voz?
- Capturar áudio do sistema já no MVP?
- Necessidade de TURN dedicado logo no primeiro deploy?
- Hospedar LiveKit em máquina própria ou VPS?
- Quantos espectadores simultâneos esperamos?
- Uma transmissão por usuário ou uma por canal?
- Uma guild pode ter múltiplas transmissões?
- Mostrar nomes dos espectadores ao transmissor?

Começar com valores simples e tornar configurável depois.

---

# 38. Configuração inicial recomendada

Para primeira prova de conceito:

```text
Resolução: 720p
FPS: 30
Vídeo: VP8 inicialmente
Áudio: opcional
Espectadores: até 5
Transmissões simultâneas: 1
Acesso: membros autorizados da guild
Gravação: desativada
```

Depois medir antes de otimizar.

---

# 39. Performance

Não otimizar cedo demais.

Primeiro provar:

```text
captura
→ publicação
→ distribuição
→ reprodução
```

Depois medir:

- bitrate;
- CPU do transmissor;
- bandwidth;
- packet loss;
- RTT;
- qualidade;
- consumo de servidor.

---

# 40. Possível evolução para app desktop

Quando o MVP estiver estável:

```text
discord-screen-desktop/
```

Possíveis funcionalidades:

- tray icon;
- deep link `discordscreen://`;
- iniciar captura automaticamente;
- seletor próprio de janela;
- captura de áudio melhor;
- encoder por hardware;
- hotkey;
- overlay;
- status da transmissão.

---

# 41. Fluxo ideal futuro

```text
Você entra no Discord.

↓
/tela

↓
app abre

↓
clica em Minecraft

↓
Compartilhar

==============================

Amigo vê no Discord:

🔴 Você está transmitindo
[ Assistir ]

↓
1 clique

↓
player abre

↓
pronto
```

Essa é a meta de UX.

---

# 42. Primeira tarefa para o Codex

Ao iniciar o desenvolvimento, pedir ao Codex para trabalhar **uma fase por vez**.

Prompt recomendado:

```text
Estamos construindo o projeto "Discord Screen".

Leia completamente o arquivo discord-screen-share-plan.md antes de alterar qualquer arquivo.

Sua primeira tarefa é implementar apenas a Fase 0 — Base.

Requisitos:
- monorepo TypeScript;
- pnpm workspaces;
- apps/bot;
- apps/web;
- packages/shared;
- packages/database;
- Docker Compose com PostgreSQL e LiveKit;
- .env.example;
- README com instruções de desenvolvimento;
- scripts para dev, build, lint e typecheck.

Não implemente ainda autenticação, streaming ou comandos complexos.

Antes de escrever código:
1. apresente a estrutura que pretende criar;
2. identifique decisões que precisem ser tomadas;
3. escolha padrões simples e manteníveis;
4. depois implemente.

Ao terminar:
- rode typecheck;
- rode lint;
- informe arquivos criados;
- informe comandos para iniciar o ambiente;
- não avance para a Fase 1 sem solicitação.
```

---

# 43. Regra para uso do Codex

Evitar prompts como:

```text
faça o projeto inteiro
```

Preferir:

```text
implemente a Fase 1
```

Depois:

```text
revise a Fase 1 contra os critérios do planejamento
```

Depois:

```text
corrija os problemas encontrados
```

Somente então:

```text
implemente a Fase 2
```

Isso reduz regressões e decisões improvisadas.

---

# 44. Prioridade

A prioridade máxima é conseguir:

```text
/tela
      ↓
[Compartilhar]
      ↓
WebRTC
      ↓
[Assistir]
      ↓
vídeo funcionando
```

Todo o resto é secundário até esse fluxo estar sólido.

---

# 45. Princípio principal do projeto

> **Discord cuida das pessoas. Discord Screen cuida somente da tela.**

Essa separação deve orientar todas as decisões de arquitetura.
