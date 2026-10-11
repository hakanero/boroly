import { analyze, type AnalyzeInput } from "@/lib/pipeline";
import type { StreamEvent } from "@/lib/schemas";

export const maxDuration = 180;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as AnalyzeInput | null;
  if (!body || (!body.url && !body.listingText)) {
    return Response.json({ error: "Send a listing URL or the listing text." }, { status: 400 });
  }
  if (body.url && !/^https?:\/\//i.test(body.url)) body.url = `https://${body.url}`;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: StreamEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      try {
        await analyze(
          {
            url: body.url?.trim() || undefined,
            listingText: body.listingText?.slice(0, 20_000),
            about: (body.about ?? "").slice(0, 2_000),
            budget: Number(body.budget) || undefined,
            commuteTo: body.commuteTo?.slice(0, 200),
            priorities: (body.priorities ?? []).slice(0, 12),
          },
          emit,
        );
      } catch (err) {
        emit({ type: "error", message: err instanceof Error ? err.message : "Something went wrong." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
