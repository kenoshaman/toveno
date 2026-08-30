import { TrackSource } from "@livekit/protocol";
import { WebhookReceiver } from "livekit-server-sdk";
import { NextResponse } from "next/server";
import { notifyBroadcastStarted } from "@/lib/push";

export const runtime = "nodejs";

// Evita reenviar a notificação a cada faixa publicada (vídeo + áudio da
// mesma transmissão) na mesma sala. Guardado em globalThis pelo mesmo motivo
// de packages/session-passwords.ts: o Next recarrega o módulo em dev.
const globalForNotifiedRooms = globalThis as unknown as {
  __tovenoNotifiedRooms?: Set<string>;
};

const notifiedRooms =
  globalForNotifiedRooms.__tovenoNotifiedRooms ??
  (globalForNotifiedRooms.__tovenoNotifiedRooms = new Set<string>());

export async function POST(request: Request) {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;

  if (!apiKey || !apiSecret) {
    return NextResponse.json(
      { error: "LiveKit environment variables are missing." },
      { status: 500 },
    );
  }

  const body = await request.text();
  const receiver = new WebhookReceiver(apiKey, apiSecret);

  try {
    const event = await receiver.receive(body, request.headers.get("Authorization") ?? undefined);

    if (event.event === "track_published" && event.track?.source === TrackSource.SCREEN_SHARE) {
      const roomName = event.room?.name;

      if (roomName && !notifiedRooms.has(roomName)) {
        notifiedRooms.add(roomName);
        await notifyBroadcastStarted(roomName);
      }
    }

    if (event.event === "room_finished" && event.room?.name) {
      notifiedRooms.delete(event.room.name);
    }
  } catch {
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 401 });
  }

  return NextResponse.json({ ok: true });
}
