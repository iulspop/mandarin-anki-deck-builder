import { clearWordIndexCache } from "~/lib/words.server";

export async function action({ request }: { request: Request }) {
  const pythonUrl = process.env.PYTHON_API_URL || "http://localhost:5001";
  const body = await request.text();
  const res = await fetch(`${pythonUrl}/generate-cards`, {
    body,
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

  if (!res.ok) {
    return new Response(res.body, {
      headers: { "Content-Type": "application/json" },
      status: res.status,
    });
  }

  const upstream = res.body;
  if (!upstream) {
    return new Response("No response body", { status: 502 });
  }

  const reader = upstream.getReader();
  const stream = new ReadableStream({
    cancel() {
      reader.cancel();
    },
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        clearWordIndexCache();
        controller.close();
        return;
      }
      controller.enqueue(value);
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream",
      "X-Accel-Buffering": "no",
    },
  });
}
