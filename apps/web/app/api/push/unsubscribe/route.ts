import { NextResponse } from "next/server";
import { removeSubscription } from "@/lib/push";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: { endpoint?: string };

  try {
    body = (await request.json()) as { endpoint?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.endpoint) {
    return NextResponse.json({ error: "endpoint is required." }, { status: 400 });
  }

  await removeSubscription(body.endpoint);

  return NextResponse.json({ ok: true });
}
