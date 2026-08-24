import { NextResponse } from "next/server";

/** S4: Server upload stub — wire B2 + TTL in production */
export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: "No file" }, { status: 400 });
  }

  const jobId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

  return NextResponse.json({
    jobId,
    expiresAt,
    message: "Server mode is in development.",
    size: file.size,
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get("jobId");
  if (!jobId) {
    return NextResponse.json({ error: "jobId required" }, { status: 400 });
  }
  return NextResponse.json({
    jobId,
    status: "stub",
    downloadUrl: null,
  });
}
