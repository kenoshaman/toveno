import { NextResponse } from "next/server";
import { saveSubscription, type PushSubscriptionJSON } from "@/lib/push";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: PushSubscriptionJSON;

  try {
    body = (await request.json()) as PushSubscriptionJSON;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
    return NextResponse.json({ error: "Invalid push subscription." }, { status: 400 });
  }

  await saveSubscription(body);

  return NextResponse.json({ ok: true });
}
