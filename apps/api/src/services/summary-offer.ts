/** Last assistant message offered to summarize collected intake (or move to report with a summary ask). */

export function lastAssistantOfferedSummary(assistantText: string): boolean {
  const lower = assistantText.toLowerCase();
  if (
    /\bwould\s+you\s+like\s+me\s+to\s+summarize\b/i.test(lower) ||
    /\bsummarize\s+the\s+information\s+collected\b/i.test(lower) ||
    /\bsummarize\s+what\s+we\b/i.test(lower) ||
    /\bshall\s+i\s+summarize\b/i.test(lower) ||
    /\bwant\s+a\s+summary\b/i.test(lower) ||
    /\bwould\s+you\s+like\s+a\s+summary\b/i.test(lower) ||
    /\bwould\s+you\s+like\s+to\s+see\s+a\s+summary\b/i.test(lower) ||
    /\bwould\s+you\s+like\s+another\s+summary\b/i.test(lower)
  ) {
    return true;
  }
  if (/\bsummary\s+of\s+your\s+provided\s+information\b/i.test(lower)) return true;
  if (/\bbefore\s+we\s+finalize\b/i.test(lower) && /\bsummary\b/i.test(lower)) return true;
  if (
    /\breport\s+step\b/i.test(lower) &&
    (/\bsummary\b/i.test(lower) || /\bwould\s+you\b/i.test(lower))
  ) {
    return true;
  }
  if (/\bproceed\s+to\s+(the\s+)?report\b/i.test(lower) && /\bsummary\b/i.test(lower)) return true;
  if (
    /\bfinal\s+step\b/i.test(lower) &&
    /\breport\b/i.test(lower) &&
    /\bwould\s+you\s+like\b/i.test(lower)
  ) {
    return true;
  }
  return false;
}

/** User asked to build/finalize the report in plain language (report or monthly_calc step). */
export function isExplicitGenerateReportIntent(userContent: string): boolean {
  const lower = userContent.trim().toLowerCase();
  if (!lower) return false;
  return (
    /\bgenerate\s+(the\s+)?report\b/i.test(lower) ||
    /\bgenerate\s+again\b/i.test(lower) ||
    /\b(can\s+you\s+)?(please\s+)?(re)?generate\b/i.test(lower) ||
    /\bregenerat(e|ing)\s+(the\s+)?report\b/i.test(lower) ||
    /\b(another|a\s+new)\s+report\b/i.test(lower) ||
    /\b(create|build|make|run|produce)\s+(the\s+)?report\b/i.test(lower) ||
    /\b(create|build|make)\s+(it|one)\s+again\b/i.test(lower) ||
    /\bfinalize\s+(the\s+)?report\b/i.test(lower) ||
    /\bsave\s+(the\s+)?report\b/i.test(lower) ||
    /\brun\s+(the\s+)?report\s+again\b/i.test(lower) ||
    /\b(new|another|fresh)\s+summary\b/i.test(lower) ||
    /\b(generat(e|ing|ed)?|generae)\b.*\bsummary\b/i.test(lower) ||
    /\bsummary\b.*\b(again|new|another|fresh)\b/i.test(lower) ||
    /\brefresh\s+(the\s+)?(report|summary)\b/i.test(lower) ||
    /\bshow\s+(me\s+)?(my\s+)?(the\s+)?(tax\s+)?map\b/i.test(lower) ||
    /\bview\s+(my\s+)?(the\s+)?(360|tax\s+)?map\b/i.test(lower) ||
    /\bopen\s+(my\s+)?(the\s+)?(tax\s+)?map\b/i.test(lower)
  );
}

/** Assistant acknowledged the user has no taxable events (safe to allow report/summary shortcut from events step). */
export function assistantAcknowledgesNoTaxableEvents(assistantText: string): boolean {
  const lower = assistantText.toLowerCase();
  return (
    /\bno\s+taxable\s+events?\b/i.test(lower) ||
    /\bno\s+events?\s+you'?d?\s+like\s+to\s+report\b/i.test(lower) ||
    /\b(already\s+)?confirmed\b.*\bno\s+taxable\b/i.test(lower) ||
    /\bthere\s+are\s+no\s+taxable\s+events?\b/i.test(lower)
  );
}
