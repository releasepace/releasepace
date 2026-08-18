export function json(data: unknown, status = 200, extra: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...extra },
  });
}

export function err(message: string, status = 400, extra: HeadersInit = {}): Response {
  return json({ error: message }, status, extra);
}

export function cors(allowed: string, origin: string): Response {
  const origins = allowed.split(",").map((s) => s.trim());
  const allow = origins.includes(origin) || origins.includes("*") ? origin : origins[0];
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": allow,
      "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,Authorization",
      "Access-Control-Max-Age": "86400",
    },
  });
}

export function paginate(url: URL) {
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
  const limit = Math.min(100, parseInt(url.searchParams.get("limit") || "50"));
  return { from: (page - 1) * limit, to: page * limit - 1, limit, page };
}
