/**
 * RAG chunking — naive paragraph-aware splitter.
 * ~500 tokens ≈ 2000 chars (1 token ≈ 4 chars), overlap 50 tokens ≈ 200 chars.
 */
export function chunkText(
  text: string,
  opts?: { chunkTokens?: number; overlap?: number }
): string[] {
  const chunkTokens = opts?.chunkTokens ?? 500;
  const overlapTokens = opts?.overlap ?? 50;
  const chunkChars = chunkTokens * 4;
  const overlapChars = overlapTokens * 4;

  const cleaned = text.trim();
  if (!cleaned) return [];

  // Split by double newline; if no double newline, whole text is one para
  const paras = cleaned
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  // If single huge para, fall back to char slicing directly
  if (paras.length === 1 && paras[0].length > chunkChars) {
    const chunks: string[] = [];
    const s = paras[0];
    for (let i = 0; i < s.length; i += chunkChars - overlapChars) {
      const c = s.slice(i, i + chunkChars).trim();
      if (c) chunks.push(c);
      if (i + chunkChars >= s.length) break;
    }
    return chunks;
  }

  const chunks: string[] = [];
  let current = "";

  for (const para of paras) {
    // Para itself larger than chunk → slice it alone
    if (para.length > chunkChars) {
      if (current) {
        chunks.push(current.trim());
        current = "";
      }
      for (let i = 0; i < para.length; i += chunkChars - overlapChars) {
        const c = para.slice(i, i + chunkChars).trim();
        if (c) chunks.push(c);
        if (i + chunkChars >= para.length) break;
      }
      continue;
    }

    if (!current) {
      current = para;
      continue;
    }

    const withPara = current + "\n\n" + para;
    if (withPara.length <= chunkChars) {
      current = withPara;
    } else {
      chunks.push(current.trim());
      // overlap: tail of previous chunk
      const overlap = current.slice(-overlapChars);
      // avoid duplicating overlap if para already starts with it
      current = overlap ? overlap.trim() + "\n\n" + para : para;
      // if still too long (rare), slice current
      if (current.length > chunkChars) {
        // push overlap tail as separate?
        // split current naively
        const tmp = current;
        current = "";
        for (let i = 0; i < tmp.length; i += chunkChars - overlapChars) {
          const c = tmp.slice(i, i + chunkChars).trim();
          if (!c) continue;
          if (i + chunkChars < tmp.length) chunks.push(c);
          else current = c;
        }
      }
    }
  }

  if (current.trim()) chunks.push(current.trim());

  // Trim empties and dedupe tiny chunks? keep as-is but filter
  return chunks.map((c) => c.trim()).filter(Boolean);
}
