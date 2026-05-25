/**
 * Centralized magic numbers for the /api/contracts/chat route.
 *
 * Why: these values were previously inlined as bare literals, making it hard
 * to reason about token budgets, rate-limit windows, and history sizing from
 * a single place. Tuning any of them (cost, latency, abuse-resistance) now
 * happens in one file.
 */

/**
 * Number of past user-turn messages re-fed as context.
 *
 * History is filtered to user turns only (audit finding #4), so this caps the
 * number of "previous user questions" the prompt re-includes. Larger values
 * raise token cost; smaller values reduce conversational coherence.
 */
export const CHAT_HISTORY_MESSAGES = 10

/**
 * Maximum characters of raw contract text spliced into the chat prompt.
 *
 * Distinct from ANALYZE_TRUNCATION_CHARS (12,000) because the chat window
 * also carries analysis summary, key points, risks, clauses, history, and
 * the current user message — so the contract slice is intentionally tighter.
 */
export const CHAT_CONTRACT_TEXT_MAX_CHARS = 8000

/**
 * Maximum characters of the persisted assistant reply.
 *
 * Caps a single response so it cannot poison subsequent turns or blow up
 * row size. Shares the value with CHAT_CONTRACT_TEXT_MAX_CHARS today but
 * represents a distinct concept — tune independently.
 */
export const CHAT_REPLY_MAX_CHARS = 8000

/** Sampling temperature for the chat LLM call. Low to keep answers grounded. */
export const CHAT_LLM_TEMPERATURE = 0.3

/** Cap on tokens the model may generate per chat response. */
export const CHAT_LLM_MAX_OUTPUT_TOKENS = 1024
