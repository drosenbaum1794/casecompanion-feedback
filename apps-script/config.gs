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

  MAX_RUNTIME_MS: 4.5 * 60 * 1000, // Apps Script caps a run at 6 minutes
  MENU_LOCK_WAIT_MS: 20000,
  MAX_REJECTIONS: 3,
  HEALTH_KEEP_RUNS: 20,
  HEALTH_ATTENTION_ROWS: 20,
};
