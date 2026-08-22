import { config } from "dotenv";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  Client,
  EmbedBuilder,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
} from "discord.js";
import { randomUUID } from "node:crypto";
import { type StreamSession } from "@discord-screen/shared";

config({ path: new URL("../../../.env", import.meta.url) });

const token = process.env.DISCORD_BOT_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_GUILD_ID;
const appUrl = process.env.APP_URL ?? "http://localhost:3000";

if (!token || !clientId) {
  console.warn(
    "DISCORD_BOT_TOKEN and DISCORD_CLIENT_ID are required. Bot startup skipped.",
  );
  process.exit(0);
}

const sessions = new Map<string, StreamSession>();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

const commands = [
  new SlashCommandBuilder()
    .setName("tela")
    .setDescription("Cria uma sessao privada de compartilhamento de tela."),
  new SlashCommandBuilder()
    .setName("encerrar")
    .setDescription("Encerra sua transmissao ativa."),
].map((command) => command.toJSON());

client.once("ready", (readyClient) => {
  console.log(`Discord Screen bot online as ${readyClient.user.tag}`);
});

client.on("interactionCreate", async (interaction) => {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === "tela") {
      await handleTelaCommand(interaction);
      return;
    }

    if (interaction.commandName === "encerrar") {
      await handleEncerrarCommand(interaction);
      return;
    }
  }
});

await registerCommands();
await client.login(token);

async function registerCommands(): Promise<void> {
  const rest = new REST({ version: "10" }).setToken(token as string);

  if (guildId) {
    await rest.put(Routes.applicationGuildCommands(clientId as string, guildId), {
      body: commands,
    });
    console.log(`Registered guild commands for ${guildId}.`);
    return;
  }

  await rest.put(Routes.applicationCommands(clientId as string), {
    body: commands,
  });
  console.log("Registered global commands.");
}

async function handleTelaCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({
      content: "Use este comando dentro de um servidor Discord.",
      ephemeral: true,
    });
    return;
  }

  const member = await interaction.guild?.members.fetch(interaction.user.id);
  const voiceChannelId = member?.voice.channelId;

  if (!voiceChannelId) {
    await interaction.reply({
      content: "Entre em um canal de voz antes de usar /tela.",
      ephemeral: true,
    });
    return;
  }

  const activeSession = [...sessions.values()].find(
    (session) =>
      session.ownerDiscordId === interaction.user.id &&
      session.status !== "ENDED",
  );

  if (activeSession) {
    await interaction.reply({
      content: `Voce ja tem uma transmissao ativa: ${appUrl}/transmit/${activeSession.id}`,
      ephemeral: true,
    });
    return;
  }

  const sessionId = `stream_${randomUUID()}`;
  const session: StreamSession = {
    id: sessionId,
    guildId: interaction.guildId,
    voiceChannelId,
    ownerDiscordId: interaction.user.id,
    livekitRoomName: sessionId,
    status: "WAITING_FOR_PUBLISHER",
    createdAt: new Date(),
  };

  sessions.set(session.id, session);

  const embed = new EmbedBuilder()
    .setTitle(`${interaction.user.displayName} iniciou um compartilhamento`)
    .setDescription(`<@${interaction.user.id}> vai compartilhar a tela.`)
    .addFields(
      { name: "Canal", value: `<#${voiceChannelId}>`, inline: true },
      { name: "Qualidade", value: "Escolhida no transmissor", inline: true },
      { name: "Status", value: "Aguardando transmissor", inline: false },
    )
    .setColor(0xe84c3d);

  const transmitUrl = `${appUrl}/transmit/${session.id}`;
  const watchUrl = `${appUrl}/watch/${session.id}`;
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setURL(transmitUrl)
      .setLabel("Iniciar compartilhamento")
      .setStyle(ButtonStyle.Link),
    new ButtonBuilder()
      .setURL(watchUrl)
      .setLabel("Assistir")
      .setStyle(ButtonStyle.Link),
  );

  await interaction.reply({
    embeds: [embed],
    components: [row],
  });
}

async function handleEncerrarCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const activeSession = [...sessions.values()].find(
    (session) =>
      session.ownerDiscordId === interaction.user.id &&
      session.status !== "ENDED",
  );

  if (!activeSession) {
    await interaction.reply({
      content: "Voce nao tem transmissao ativa para encerrar.",
      ephemeral: true,
    });
    return;
  }

  activeSession.status = "ENDED";
  activeSession.endedAt = new Date();
  sessions.set(activeSession.id, activeSession);

  await interaction.reply({
    content: "Transmissao encerrada.",
    ephemeral: true,
  });
}
