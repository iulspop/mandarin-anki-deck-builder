export async function action({ request }: { request: Request }) {
  const pythonUrl = process.env.PYTHON_API_URL || "http://localhost:5001";
  const body = await request.text();
  const res = await fetch(`${pythonUrl}/export-anki`, {
    body,
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  return new Response(res.body, {
    headers: {
      "Content-Disposition": res.headers.get("Content-Disposition") || "",
      "Content-Type":
        res.headers.get("Content-Type") || "application/octet-stream",
    },
    status: res.status,
  });
}
