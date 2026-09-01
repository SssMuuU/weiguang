import { env } from 'cloudflare:workers';

const STATE_ID = 'default';
const MAX_PAYLOAD_BYTES = 1024 * 1024;

async function ensureDatabase() {
  if (!env.DB) throw new Error('D1 binding DB is unavailable');
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS app_state (
      id TEXT PRIMARY KEY NOT NULL,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `).run();
}

export async function GET() {
  await ensureDatabase();
  const row = await env.DB.prepare(
    'SELECT payload, updated_at FROM app_state WHERE id = ?',
  ).bind(STATE_ID).first<{ payload: string; updated_at: string }>();

  if (!row) return Response.json({ snapshot: null });

  try {
    return Response.json({ snapshot: JSON.parse(row.payload), updatedAt: row.updated_at });
  } catch {
    return Response.json({ error: 'Stored data is invalid' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_PAYLOAD_BYTES) {
    return Response.json({ error: 'Payload is too large' }, { status: 413 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return Response.json({ error: 'Invalid snapshot' }, { status: 400 });
  }

  const updatedAt = typeof (body as { updatedAt?: unknown }).updatedAt === 'string'
    ? (body as { updatedAt: string }).updatedAt
    : new Date().toISOString();

  await ensureDatabase();
  await env.DB.prepare(`
    INSERT INTO app_state (id, payload, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      payload = excluded.payload,
      updated_at = excluded.updated_at
  `).bind(STATE_ID, JSON.stringify(body), updatedAt).run();

  return Response.json({ saved: true, updatedAt });
}
