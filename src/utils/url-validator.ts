/**
 * URL validation and article title verification service for Citarium.
 * Checks if a given URL is valid, returns HTTP 200, and contains the citation's article or container title.
 * Supports high-speed DOI Content Negotiation and Crossref metadata verification for DOI links.
 */

export function unescapeHtml(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

export function normalizeForMatching(text: string): string {
  if (!text) return "";
  const unescaped = unescapeHtml(text);
  return unescaped.replace(/\s+/g, " ").trim();
}

export function wordsSequence(text: string): string {
  const normalized = normalizeForMatching(text);
  const tokens = normalized.toLowerCase().match(/\w+/g) || [];
  return tokens.join(" ");
}

export function contentContainsTitle(content: string, title: string): boolean {
  if (!content || !title) return false;

  const titleNorm = normalizeForMatching(title);
  if (!titleNorm) return false;

  const contentNorm = normalizeForMatching(content);

  // 1. Direct normalized case-insensitive substring match
  if (contentNorm.toLowerCase().includes(titleNorm.toLowerCase())) {
    return true;
  }

  // 2. Word-token sequence match (ignores punctuation, dashes, quotes, colons)
  const titleWords = wordsSequence(title);
  if (!titleWords) return false;

  const contentWords = wordsSequence(content);
  if (contentWords.includes(titleWords)) {
    return true;
  }

  return false;
}

export function extractDoi(urlOrDoi: string): string | null {
  if (!urlOrDoi || typeof urlOrDoi !== "string") return null;

  // DOI syntax: 10.NNNN/...
  const match = urlOrDoi.trim().match(/10\.\d{4,9}\/[^\s\"'<>]+/);
  if (match) {
    let doi = match[0];
    // Strip trailing punctuation often found in URLs or text
    doi = doi.replace(/[\.,;:!)\?]+$/, "");
    return doi;
  }
  return null;
}

export type DoiMetadata = Record<string, unknown>;

export async function fetchDoiMetadata(
  doi: string,
  timeoutMs: number = 5000
): Promise<DoiMetadata | null> {
  if (!doi) return null;

  // 1. Try DOI Content Negotiation (doi.org)
  const cslUrl = `https://doi.org/${encodeURIComponent(doi)}`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(cslUrl, {
      headers: {
        Accept:
          "application/vnd.citationstyles.csl+json, application/citeproc+json, application/json",
        "User-Agent": "Citarium/1.0 (https://github.com/citarium; mailto:info@citarium.app)",
      },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (res.status === 200) {
      return (await res.json()) as DoiMetadata;
    }
  } catch {
    // fallback to Crossref
  }

  // 2. Fallback to Crossref REST API
  const crossrefUrl = `https://api.crossref.org/works/${encodeURIComponent(doi)}`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(crossrefUrl, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Citarium/1.0 (mailto:info@citarium.app)",
      },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (res.status === 200) {
      const data = (await res.json()) as Record<string, unknown>;
      return (data.message || data) as DoiMetadata;
    }
  } catch {
    // ignore
  }

  return null;
}

export function doiMetadataMatchesTitles(
  metadata: DoiMetadata,
  titles: string[]
): boolean {
  if (!metadata || !titles.length) return false;

  const fieldsToExtract = [
    "title",
    "container-title",
    "original-title",
    "short-title",
    "subtitle",
    "collection-title",
    "volume-title",
    "abstract",
  ];

  const textParts: string[] = [];
  for (const field of fieldsToExtract) {
    const val = metadata[field];
    if (typeof val === "string") {
      textParts.push(val);
    } else if (Array.isArray(val)) {
      for (const item of val) {
        if (typeof item === "string") {
          textParts.push(item);
        } else if (typeof item === "object" && item !== null) {
          for (const v of Object.values(item)) {
            if (typeof v === "string") textParts.push(v);
          }
        }
      }
    }
  }

  // Also include author and editor names if present
  for (const role of ["author", "editor"] as const) {
    const people = metadata[role];
    if (Array.isArray(people)) {
      for (const person of people) {
        if (typeof person === "object" && person !== null) {
          const personObj = person as { given?: unknown; family?: unknown; name?: unknown };
          const given = typeof personObj.given === "string" ? personObj.given : "";
          const family = typeof personObj.family === "string" ? personObj.family : "";
          if (given || family) {
            textParts.push(`${given} ${family}`.trim());
          }
          if (personObj.name) {
            textParts.push(String(personObj.name));
          }
        }
      }
    }
  }

  const combinedMetadataText = textParts.filter(Boolean).join(" ");

  for (const title of titles) {
    if (title && contentContainsTitle(combinedMetadataText, title)) {
      return true;
    }
  }

  return false;
}

export async function validateUrlAndTitle(
  url: string,
  title: string,
  containerTitle?: string,
  timeoutMs: number = 6000
): Promise<boolean> {
  if (!url || typeof url !== "string") return false;

  const cleanUrl = url.trim();
  if (!cleanUrl.startsWith("http://") && !cleanUrl.startsWith("https://")) {
    return false;
  }

  const cleanTitle = (title || "").trim();
  const cleanContainer = (containerTitle || "").trim();
  const candidateTitles = [cleanTitle, cleanContainer].filter(Boolean);

  if (candidateTitles.length === 0) return false;

  // 1. If URL is a DOI or contains a DOI, attempt fast DOI Content Negotiation / API check
  const doi = extractDoi(cleanUrl);
  if (doi) {
    const doiMeta = await fetchDoiMetadata(doi, Math.min(timeoutMs, 5000));
    if (doiMeta && doiMetadataMatchesTitles(doiMeta, candidateTitles)) {
      return true;
    }
  }

  // 2. Standard HTML Webpage Fetching
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(cleanUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Citarium/1.0",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (res.status !== 200) {
      return false;
    }

    const text = await res.text();
    return candidateTitles.some((t) => contentContainsTitle(text, t));
  } catch {
    return false;
  }
}

export class AsyncURLChecker {
  private _currentToken: number = 0;

  checkAsync(
    url: string,
    title: string,
    containerTitle?: string,
    callback: (result: boolean | null, token: number) => void = () => {},
    onStart?: (token: number) => void,
    timeoutMs: number = 6000
  ): number {
    this._currentToken++;
    const token = this._currentToken;

    const cleanUrl = (url || "").trim();
    const cleanTitle = (title || "").trim();
    const cleanContainer = (containerTitle || "").trim();

    if (!cleanUrl) {
      callback(null, token);
      return token;
    }

    if (!cleanTitle && !cleanContainer) {
      callback(false, token);
      return token;
    }

    if (onStart) {
      onStart(token);
    }

    validateUrlAndTitle(cleanUrl, cleanTitle, cleanContainer, timeoutMs).then((result) => {
      if (token === this._currentToken) {
        callback(result, token);
      }
    });

    return token;
  }

  cancelPending(): void {
    this._currentToken++;
  }

  isCurrentToken(token: number): boolean {
    return token === this._currentToken;
  }
}
