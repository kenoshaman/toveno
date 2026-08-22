import { config } from "dotenv";
import { PermissionFlagsBits } from "discord.js";

config({ path: new URL("../../../.env", import.meta.url) });

const clientId = process.env.DISCORD_CLIENT_ID;

if (!clientId) {
  console.error("DISCORD_CLIENT_ID is required to generate the invite URL.");
  process.exit(1);
}

const permissions =
  PermissionFlagsBits.SendMessages |
  PermissionFlagsBits.EmbedLinks |
  PermissionFlagsBits.UseApplicationCommands;

const url = new URL("https://discord.com/oauth2/authorize");
url.searchParams.set("client_id", clientId);
url.searchParams.set("scope", "bot applications.commands");
url.searchParams.set("permissions", permissions.toString());

console.log(url.toString());
