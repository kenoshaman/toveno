import { AccessToken } from "livekit-server-sdk";
import { NextResponse } from "next/server";
import { verifySessionPassword } from "@/lib/session-passwords";

export const runtime = "nodejs";

type TokenRequest = {
  sessionId?: string;
  role?: "publisher" | "viewer";
  password?: string;
};

export async function POST(request: Request) {
  let body: TokenRequest;

  try {
    body = (await request.json()) as TokenRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const sessionId = body.sessionId?.trim();
  const role = body.role;

  if (!sessionId || (role !== "publisher" && role !== "viewer")) {
    return NextResponse.json(
      { error: "sessionId and role are required." },
      { status: 400 },
    );
  }

  if (role === "viewer" && !verifySessionPassword(sessionId, body.password)) {
    return NextResponse.json(
      { error: "Senha incorreta para esta sala privada." },
      { status: 401 },
    );
  }

  const livekitUrl = process.env.LIVEKIT_URL;
  const publicLivekitUrl = process.env.LIVEKIT_PUBLIC_URL || livekitUrl;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;

  if (!livekitUrl || !apiKey || !apiSecret) {
    return NextResponse.json(
      { error: "LiveKit environment variables are missing." },
      { status: 500 },
    );
  }

  const identity = `${role}_${sessionId}_${crypto.randomUUID()}`;
  const token = new AccessToken(apiKey, apiSecret, {
    identity,
    ttl: "5m",
  });

  token.addGrant({
    room: sessionId,
    roomJoin: true,
    canPublish: role === "publisher",
    canPublishData: role === "publisher",
    canSubscribe: true,
  });

  return NextResponse.json({
    identity,
    token: await token.toJwt(),
    url: publicLivekitUrl,
  });
}
