// lib/grounding.ts
//
// Grounding verification (spec § Grounding Verification). Pure module.
// Walks contractText with a sliding window, comparing each window against
// every quoted_text in the model output. Returns the failures list (empty
// when every quote grounds at threshold >= 0.85).

import { compareTwoStrings } from 'string-similarity';
import type { AnalysisOutput } from './prompt/output-schema';

export interface GroundingFailure {
  path: string;          // JSONPath, e.g. "risks[2].evidence.quoted_text"
  quoted_text: string;
  best_match: string;
  similarity: number;
}

const DEFAULT_THRESHOLD = 0.85;

// Normalize: lowercase, collapse whitespace (incl. all unicode whitespace),
// and fold smart quotes to ASCII so models that "fix" punctuation while
// quoting still ground correctly.
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’‚‛′]/g, "'")  // smart single quotes
    .replace(/[“”„‟″]/g, '"')  // smart double quotes
    .replace(/[–—]/g, '-')                    // en/em dashes
    .replace(/\s+/g, ' ')
    .trim();
}

interface BestMatch {
  match: string;
  similarity: number;
}

function bestSlidingMatch(needle: string, haystack: string, threshold: number): BestMatch {
  if (needle.length === 0) return { match: '', similarity: 0 };
  if (haystack.length === 0) return { match: '', similarity: 0 };

  // Fast path: exact substring -> similarity 1.0
  if (haystack.includes(needle)) {
    return { match: needle, similarity: 1 };
  }

  const baseLen = needle.length;
  // Window sizes: needle.length ±20% in three steps.
  const sizes = Array.from(
    new Set([
      Math.max(1, Math.floor(baseLen * 0.8)),
      baseLen,
      Math.min(haystack.length, Math.ceil(baseLen * 1.2)),
    ]),
  );
  const step = Math.max(1, Math.floor(baseLen / 4));

  let best: BestMatch = { match: '', similarity: 0 };
  for (const size of sizes) {
    if (size > haystack.length) continue;
    for (let i = 0; i + size <= haystack.length; i += step) {
      const window = haystack.slice(i, i + size);
      const sim = compareTwoStrings(needle, window);
      if (sim > best.similarity) {
        best = { match: window, similarity: sim };
        if (sim >= threshold) return best;  // early-exit
      }
    }
  }
  return best;
}

export function verifyGrounding(
  output: AnalysisOutput,
  contractText: string,
  threshold = DEFAULT_THRESHOLD,
): GroundingFailure[] {
  const failures: GroundingFailure[] = [];
  const haystack = normalize(contractText);

  const check = (quoted: string, path: string) => {
    const needle = normalize(quoted);
    const { match, similarity } = bestSlidingMatch(needle, haystack, threshold);
    if (similarity < threshold) {
      failures.push({ path, quoted_text: quoted, best_match: match, similarity });
    }
  };

  output.risks.forEach((r, i) => {
    if (r.evidence.type === 'quoted') {
      check(r.evidence.quoted_text, `risks[${i}].evidence.quoted_text`);
    }
    // 'absence' entries: no quoted text, nothing to verify.
  });

  output.clauses.forEach((c, i) => {
    if (c.presence.status === 'present') {
      check(c.presence.quoted_text, `clauses[${i}].presence.quoted_text`);
    }
    // 'absent' entries: skipped.
  });

  return failures;
}
