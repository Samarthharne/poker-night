import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "Only the administrator can create rooms." },
    { status: 403 },
  );
}

export async function GET() {
  return NextResponse.json(
    { error: "Room listing is restricted to the administrator." },
    { status: 403 },
  );
}
