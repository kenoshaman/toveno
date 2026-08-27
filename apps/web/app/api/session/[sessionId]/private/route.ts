import { NextResponse } from "next/server";
import {
  clearSessionPassword,
  isSessionPrivate,
  setSessionPassword,
} from "@/lib/session-passwords";

export const runtime = "nodejs";

type RouteParams = {
  params: Promise<{
    sessionId: string;
  }>;
};

export async function GET(_request: Request, { params }: RouteParams) {
  const { sessionId } = await params;

  return NextResponse.json({ private: isSessionPrivate(sessionId) });
}

type SetPasswordBody = {
  password?: string | null;
};

export async function POST(request: Request, { params }: RouteParams) {
  const { sessionId } = await params;

  let body: SetPasswordBody;
  try {
    body = (await request.json()) as SetPasswordBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const password = body.password?.trim();

  if (password) {
    setSessionPassword(sessionId, password);
  } else {
    clearSessionPassword(sessionId);
  }

  return NextResponse.json({ private: isSessionPrivate(sessionId) });
}
