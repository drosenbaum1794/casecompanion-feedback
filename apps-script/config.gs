/**
 * Central config. Every script reads columns by header name, never by
 * position, so adding or moving columns cannot break the sync.
 */
const CONFIG = {
  TABS: {
    FEEDBACK: 'Feedback',
    SUGGESTIONS: 'Claude Suggestions',
    TAXONOMY: 'Taxonomy',
    ROUTING: 'Routing',
    HEALTH: 'Health',
  },

  // A run aborts if any of these headers is missing, so a renamed column
  // can never look like deleted data.
  FEEDBACK_HEADERS: [
    'fb_id', 'user_id', 'channel', 'feedback_date', 'feedback_text', 'user_role',
    'firm_size', 'months_subscribed', 'monthly_queries', 'avg_session_duration_min',
    'case_types_handled',
    'sentiment', 'theme', 'product_area', 'severity', 'confidence', 'claude_reason',
    'status', 'reviewed_by', 'reviewed_at', 'notes', 'suggested_theme', 'follow_up',
    'follow_up_owner', 'follow_up_status', 'ticket_link',
    'injection_suspected', 'claude_sentiment', 'claude_theme', 'claude_product_area',
    'claude_severity', 'last_synced_hash', 'sync_error', 'error_count', 'prompt_version',
    'taxonomy_version', 'model', 'tagged_at', 'alerted_at',
  ],
  SUGGESTION_HEADERS: [
    'fb_id', 'sentiment', 'theme', 'product_area', 'severity', 'confidence', 'reason',
    'suggested_theme', 'injection_suspected', 'prompt_version', 'run_at', 'applied',
  ],
  TAXONOMY_HEADERS: ['field', 'value', 'definition', 'example_1', 'example_2', 'version'],

  // Tag fields validated against the Taxonomy tab.
  TAG_FIELDS: ['sentiment', 'theme', 'product_area', 'severity', 'confidence'],

  // Cells a human may fill. The apply step only ever writes these when empty.
  HUMAN_FIELDS: [
    'sentiment', 'theme', 'product_area', 'severity', 'confidence',
    'claude_reason', 'suggested_theme', 'status',
  ],

  // Claude's original proposal, kept in script-only columns so
  // "did a human correct this?" is a simple comparison later.
  CLAUDE_ORIGINAL: {
    sentiment: 'claude_sentiment',
    theme: 'claude_theme',
    product_area: 'claude_product_area',
    severity: 'claude_severity',
  },

  MODEL_LABEL: 'scheduled task',
  ID_PREFIX: 'fb_',
  ID_LENGTH: 8,
  ID_ALPHABET: 'abcdefghjkmnpqrstuvwxyz23456789', // no 0/o, 1/l/i lookalikes

  // Public by design: the anon key can only read, and row-level security
  // plus the ingest secret (Script Properties, never in code) guard writes.
  SHEET_ID: '1_PnSRLN4Bi822kcznqTyRuQ5gM9zU-3ot0EOjvIbROw',
  SUPABASE_URL: 'https://rienopvbkpukefaeynhb.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJpZW5vcHZia3B1a2VmYWV5bmhiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM5NTIyNjIsImV4cCI6MjEwOTUyODI2Mn0.UtcqV9GFaEDU05uezWwTSnBCIlwthj2AMbW7Qh99GJ0',
  WEBAPP_URL: 'https://script.google.com/macros/s/AKfycbyrw_Qrh-TMNRUM5he3VkmEhVkUvVKyvD3MwQ7ApR4cVUa2AIdXGqyave8kpHWTxI7LYQ/exec',

  // Columns left out of the row fingerprint: they are bookkeeping, not data.
  HASH_EXCLUDE: ['last_synced_hash', 'sync_error', 'error_count'],
  PUSH_BATCH: 10, // each row may need an embedding; small batches stay under the edge function's CPU limit
  HEARTBEAT_MINUTES: 25, // an idle sync still logs to Supabase this often, for the health banner
  TAGGER_STALL_HOURS: 3,
  FAILURE_ALERT_MINUTES: 60,
  REPEAT_ALERT_HOURS: 6,
  ALERT_DIGEST_OVER: 3, // more than this many alerts in one run go out as one digest email

  // Tag fields whose change by a human marks a row Corrected.
  CORRECTION_FIELDS: ['sentiment', 'theme', 'product_area', 'severity'],
  STATUS_VALUES: ['Pending', 'Confirmed', 'Corrected', 'Unsure', 'Archived'],

  MAX_RUNTIME_MS: 4.5 * 60 * 1000, // Apps Script caps a run at 6 minutes
  MENU_LOCK_WAIT_MS: 20000,
  MAX_REJECTIONS: 3,
  HEALTH_KEEP_RUNS: 20,
  HEALTH_ATTENTION_ROWS: 20,
};
