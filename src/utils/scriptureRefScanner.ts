export interface ScriptureRefMatch {
  raw: string;
  bookId: string | null;
  bookName: string | null;
  chapter: number;
  verseStart: number;
  verseEnd: number | null;
  recognized: boolean;
}

export type ResolveBookIdFn = (normalizedToken: string) => Promise<{ bookId: string; bookName: string } | null>;
export type ResolveBooksByAliasFn = (
  normalizedTokens: string[]
) => Promise<Map<string, { bookId: string; bookName: string }>>;

const ROMAN_TO_DIGIT: Record<string, string> = { i: "1", ii: "2", iii: "3" };

function normalizeBookToken(ordinal: string | undefined, word: string): string {
  const cleanWord = word.toLowerCase().replace(/\.$/, "");
  if (!ordinal) return cleanWord;

  const cleanOrdinal = ordinal.toLowerCase().replace(/\.$/, "");
  const digit = /^[123]$/.test(cleanOrdinal) ? cleanOrdinal : ROMAN_TO_DIGIT[cleanOrdinal];
  return digit ? `${digit} ${cleanWord}` : cleanWord;
}

// Matches things like: "Matt 5:3", "1 Tim 2:1-4", "I Ki 17:1", "Jn 3:16", "Rev. 22:21"
const REFERENCE_PATTERN = /\b([123]|I{1,3})?\.?\s*([A-Za-z]{2,15})\.?\s+(\d{1,3}):(\d{1,3})(?:-(\d{1,3}))?/g;

export async function scanForScriptureReferences(
  text: string,
  resolveBookId: ResolveBookIdFn,
  resolveBooksByAlias?: ResolveBooksByAliasFn
): Promise<ScriptureRefMatch[]> {
  const pendingMatches: {
    raw: string;
    normalized: string;
    chapter: number;
    verseStart: number;
    verseEnd: number | null;
    index: number;
  }[] = [];
  let match: RegExpExecArray | null;

  REFERENCE_PATTERN.lastIndex = 0;
  while ((match = REFERENCE_PATTERN.exec(text)) !== null) {
    const [raw, ordinal, word, chapterStr, verseStr, verseEndStr] = match;
    if (word.toLowerCase() === "with" && !ordinal) continue;
    const normalized = normalizeBookToken(ordinal, word);
    pendingMatches.push({
      raw: raw.trim(),
      normalized,
      chapter: parseInt(chapterStr, 10),
      verseStart: parseInt(verseStr, 10),
      verseEnd: verseEndStr ? parseInt(verseEndStr, 10) : null,
      index: match.index,
    });
  }

  const relativePattern = /\bwith\s+(\d{1,3}):(\d{1,3})(?:-(\d{1,3}))?/gi;
  let relative: RegExpExecArray | null;
  while ((relative = relativePattern.exec(text)) !== null) {
    const previous = pendingMatches
      .filter((item) => item.index < relative!.index)
      .sort((a, b) => b.index - a.index)[0];
    if (pendingMatches.some((item) => relative!.index >= item.index && relative!.index < item.index + item.raw.length)) {
      continue;
    }
    pendingMatches.push({
      raw: relative[0].trim(),
      normalized: previous?.normalized ?? "",
      chapter: parseInt(relative[1], 10),
      verseStart: parseInt(relative[2], 10),
      verseEnd: relative[3] ? parseInt(relative[3], 10) : null,
      index: relative.index,
    });
  }
  pendingMatches.sort((a, b) => a.index - b.index);

  const uniqueTokens = [...new Set(pendingMatches.map((item) => item.normalized).filter(Boolean))];
  const resolvedBooks = resolveBooksByAlias
    ? await resolveBooksByAlias(uniqueTokens)
    : new Map(
        await Promise.all(
          uniqueTokens.map(async (token) => [token, await resolveBookId(token)] as const)
        )
      );

  return pendingMatches.map(({ raw, normalized, chapter, verseStart, verseEnd }) => {
    const resolved = resolvedBooks.get(normalized) ?? null;
    return {
      raw,
      bookId: resolved?.bookId ?? null,
      bookName: resolved?.bookName ?? null,
      chapter,
      verseStart,
      verseEnd,
      recognized: resolved !== null,
    };
  });
}