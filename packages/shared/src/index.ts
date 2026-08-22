export const streamSessionStatuses = [
  "CREATED",
  "WAITING_FOR_PUBLISHER",
  "LIVE",
  "ENDED",
] as const;

export type StreamSessionStatus = (typeof streamSessionStatuses)[number];

export type StreamSession = {
  id: string;
  guildId: string;
  voiceChannelId: string;
  ownerDiscordId: string;
  livekitRoomName: string;
  status: StreamSessionStatus;
  createdAt: Date;
  startedAt?: Date;
  endedAt?: Date;
};
