import { NextResponse } from "next/server";
import { verifySessionPassword } from "@/lib/session-passwords";

export const runtime = "nodejs";

type RouteParams = {
  params: Promise<{
    sessionId: string;
  }>;
};

type VerifyBody = {
  password?: string;
};

export async function POST(request: Request, { params }: RouteParams) {
  const { sessionId } = await params;

  let body: VerifyBody;
  try {
    body = (await request.json()) as VerifyBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const ok = verifySessionPassword(sessionId, body.password);

  return NextResponse.json({ ok });
}
