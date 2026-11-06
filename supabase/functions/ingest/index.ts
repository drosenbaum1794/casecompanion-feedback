// ingest: the only writer to the database. Called by the sheet's Apps Script.
//
// Every request needs the x-ingest-secret header (shared secret, stored in
// Apps Script Script Properties and as this function's INGEST_SECRET secret).
// Actions:
//   upsert         up to 25 rows; re-embeds only rows whose text changed
//   reconcile_ids  full list of sheet IDs; marks missing rows inactive,
//                  but refuses if more than 3 would vanish (delete guard)
//   log_run        one sync run, for the dashboard health banner
//   taxonomy       replaces the taxonomy copy when the sheet's version changes
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const MAX_BATCH = 25;
const MAX_MISSING = 3;
const ISSUE_THRESHOLD = Number(Deno.env.get("ISSUE_THRESHOLD") ?? "0.88");
const ID_RE = /^fb_[a-z0-9]{8}$/;

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);
const embedder = new Supabase.ai.Session("gte-small");

type Row = Record<string, unknown>;

function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const text = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v).trim();
  return s === "" ? null : s;
};
const int = (v: unknown) => {
  const n = Number(text(v));
  return text(v) !== null && Number.isFinite(n) ? Math.trunc(n) : null;
};
const num = (v: unknown) => {
  const n = Number(text(v));
  return text(v) !== null && Number.isFinite(n) ? n : null;
};
const bool = (v: unknown) => String(v ?? "").trim().toUpperCase() === "TRUE";
const date = (v: unknown) => {
  const s = text(v);
  return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};
const timestamp = (v: unknown) => {
  const s = text(v);
  return s && !Number.isNaN(Date.parse(s)) ? new Date(s).toISOString() : null;
};

function normalize(r: Row) {
  return {
    fb_id: text(r.fb_id),
    user_id: text(r.user_id),
    channel: text(r.channel),
    feedback_date: date(r.feedback_date),
    feedback_text: text(r.feedback_text),
    user_role: text(r.user_role),
    firm_size: text(r.firm_size),
    months_subscribed: int(r.months_subscribed),
    monthly_queries: int(r.monthly_queries),
    avg_session_min: num(r.avg_session_duration_min),
    case_types: (text(r.case_types_handled) ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    sentiment: text(r.sentiment),
    theme: text(r.theme),
    product_area: text(r.product_area),
    severity: text(r.severity),
    confidence: text(r.confidence),
    claude_reason: text(r.claude_reason),
    status: text(r.status),
    reviewed_by: text(r.reviewed_by),
    reviewed_at: timestamp(r.reviewed_at),
    notes: text(r.notes),
    suggested_theme: text(r.suggested_theme),
    follow_up: bool(r.follow_up),
    follow_up_owner: text(r.follow_up_owner),
    follow_up_status: text(r.follow_up_status),
    ticket_link: text(r.ticket_link),
    injection_suspected: bool(r.injection_suspected),
    claude_sentiment: text(r.claude_sentiment),
    claude_theme: text(r.claude_theme),
    claude_product_area: text(r.claude_product_area),
    claude_severity: text(r.claude_severity),
    prompt_version: text(r.prompt_version),
    taxonomy_version: text(r.taxonomy_version),
    model: text(r.model),
    tagged_at: timestamp(r.tagged_at),
    alerted_at: timestamp(r.alerted_at),
    row_hash: text(r.row_hash),
    text_hash: text(r.text_hash),
    active: true,
  };
}

async function upsert(rows: unknown) {
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > MAX_BATCH) {
    throw new Error(`rows must be an array of 1 to ${MAX_BATCH}`);
  }
  const rejected: { fb_id: unknown; reason: string }[] = [];
  const clean = [];
  for (const raw of rows as Row[]) {
    const r = normalize(raw);
    if (!r.fb_id || !ID_RE.test(r.fb_id)) rejected.push({ fb_id: raw?.fb_id, reason: "bad fb_id" });
    else if (!r.feedback_text) rejected.push({ fb_id: r.fb_id, reason: "empty feedback_text" });
    else if (!r.text_hash) rejected.push({ fb_id: r.fb_id, reason: "missing text_hash" });
    else clean.push(r);
  }
  if (!clean.length) return { stored: [], embedded: 0, rejected };

  const { data: existing, error: readErr } = await db
    .from("feedback")
    .select("fb_id, text_hash, embedding, claude_sentiment, claude_theme, claude_product_area, claude_severity")
    .in("fb_id", clean.map((r) => r.fb_id));
  if (readErr) throw readErr;
  const prior = new Map((existing ?? []).map((e) => [e.fb_id, e]));

  let embedded = 0;
  const records = [];
  for (const r of clean) {
    const old = prior.get(r.fb_id);
    const record: Row = { ...r };
    // Claude's originals are written once and never overwritten.
    for (const k of ["claude_sentiment", "claude_theme", "claude_product_area", "claude_severity"]) {
      if (old?.[k]) record[k] = old[k];
    }
    // Re-embed only when the text changed (or was never embedded).
    if (!old || old.text_hash !== r.text_hash || !old.embedding) {
      const vector = await embedder.run(r.feedback_text!, { mean_pool: true, normalize: true });
      record.embedding = JSON.stringify(Array.from(vector as number[]));
      embedded++;
    }
    records.push(record);
  }

  const { error: writeErr } = await db.from("feedback").upsert(records, { onConflict: "fb_id" });
  if (writeErr) throw writeErr;
  if (embedded) {
    const { error } = await db.rpc("assign_issue_ids", { p_threshold: ISSUE_THRESHOLD });
    if (error) throw error;
  }
  return { stored: records.map((r) => r.fb_id), embedded, rejected };
}

async function reconcile(ids: unknown) {
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string" || !ID_RE.test(id))) {
    throw new Error("ids must be an array of fb_ids");
  }
  const sheetIds = new Set(ids as string[]);
  const { data, error } = await db.from("feedback").select("fb_id, active");
  if (error) throw error;
  const missing = (data ?? []).filter((r) => r.active && !sheetIds.has(r.fb_id)).map((r) => r.fb_id);
  const back = (data ?? []).filter((r) => !r.active && sheetIds.has(r.fb_id)).map((r) => r.fb_id);

  if (missing.length > MAX_MISSING) {
    return { refused: true, missing_count: missing.length, sample: missing.slice(0, 10), deactivated: 0, reactivated: 0 };
  }
  if (missing.length) {
    const { error: e } = await db.from("feedback").update({ active: false }).in("fb_id", missing);
    if (e) throw e;
  }
  if (back.length) {
    const { error: e } = await db.from("feedback").update({ active: true }).in("fb_id", back);
    if (e) throw e;
  }
  if (missing.length || back.length) {
    const { error: e } = await db.rpc("assign_issue_ids", { p_threshold: ISSUE_THRESHOLD });
    if (e) throw e;
  }
  return { refused: false, deactivated: missing.length, reactivated: back.length, missing };
}

async function logRun(run: Row) {
  const started = timestamp(run?.started_at);
  if (!started) throw new Error("run.started_at required");
  const { error } = await db.from("sync_runs").insert({
    started_at: started,
    finished_at: timestamp(run.finished_at),
    trigger: text(run.trigger),
    result: run.result === "ERROR" ? "ERROR" : "OK",
    ids_assigned: int(run.ids_assigned) ?? 0,
    applied: int(run.applied) ?? 0,
    partly_applied: int(run.partly_applied) ?? 0,
    rejected: int(run.rejected) ?? 0,
    rows_pushed: int(run.rows_pushed) ?? 0,
    deactivated: int(run.deactivated) ?? 0,
    errors: text(run.errors)?.slice(0, 2000) ?? null,
  });
  if (error) throw error;
  return { logged: true };
}

async function replaceTaxonomy(rows: unknown, version: unknown) {
  const v = text(version);
  if (!v || !Array.isArray(rows) || rows.length === 0 || rows.length > 200) {
    throw new Error("taxonomy needs a version and 1 to 200 rows");
  }
  const clean = (rows as Row[])
    .map((r) => ({
      field: text(r.field),
      value: text(r.value),
      definition: text(r.definition),
      example_1: text(r.example_1),
      example_2: text(r.example_2),
      version: v,
    }))
    .filter((r) => r.field && r.value);
  // Write the new version first, then remove values that are no longer in it,
  // so a failed write never leaves the table empty.
  const { error } = await db.from("taxonomy").upsert(clean, { onConflict: "field,value" });
  if (error) throw error;
  const { error: delErr } = await db.from("taxonomy").delete().neq("version", v);
  if (delErr) throw delErr;
  return { stored: clean.length, version: v };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return reply(405, { error: "POST only" });
  // Trimmed: a secret pasted into the dashboard can pick up stray whitespace.
  const expected = (Deno.env.get("INGEST_SECRET") ?? "").trim();
  const given = (req.headers.get("x-ingest-secret") ?? "").trim();
  if (expected.length < 32 || !sameSecret(given, expected)) {
    // Server-side log only, so callers learn nothing about the configuration.
    console.warn(expected.length < 32
      ? `auth: INGEST_SECRET not configured (length ${expected.length})`
      : `auth: secret mismatch (given length ${given.length}, expected length ${expected.length})`);
    return reply(401, { error: "missing or wrong x-ingest-secret" });
  }
  let body: Row;
  try {
    body = await req.json();
  } catch {
    return reply(400, { error: "body must be JSON" });
  }
  try {
    switch (body?.action) {
      case "upsert":
        return reply(200, await upsert(body.rows));
      case "reconcile_ids":
        return reply(200, await reconcile(body.ids));
      case "log_run":
        return reply(200, await logRun(body.run as Row));
      case "taxonomy":
        return reply(200, await replaceTaxonomy(body.rows, body.version));
      default:
        return reply(400, { error: `unknown action: ${String(body?.action)}` });
    }
  } catch (e) {
    console.error(e);
    return reply(500, { error: e instanceof Error ? e.message : String(e) });
  }
});
