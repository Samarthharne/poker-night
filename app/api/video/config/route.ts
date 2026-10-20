import { NextResponse } from "next/server";
import { getPublicVideoConfig } from "@/lib/video/config";

export async function GET() {
  return NextResponse.json(getPublicVideoConfig());
}
