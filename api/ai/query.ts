import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';
import { apiHandler } from '../../lib/api-handler.js';
import { createHash } from 'crypto';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ─── In-memory cache ──────────────────────────────────────────────────────────

interface CacheEntry {
  result: AiQueryResult;
  expiresAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const queryCache = new Map<string, CacheEntry>();

function getCacheKey(query: string): string {
  return createHash('sha256').update(query.trim().toLowerCase()).digest('hex').slice(0, 16);
}

function getCached(key: string): AiQueryResult | null {
  const entry = queryCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    queryCache.delete(key);
    return null;
  }
  return entry.result;
}

function setCached(key: string, result: AiQueryResult): void {
  queryCache.set(key, { result, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface AiQueryFilters {
  states?: string[];
  sources?: string[];
  charter_types?: string[];
  min_assets?: number;
  max_assets?: number;
  min_deposits?: number;
  max_deposits?: number;
  has_credit_cards?: boolean;
  brim_tier?: string;
}

interface AiQueryResult {
  intent: 'search' | 'compare' | 'navigate' | 'analyze';
  filters: AiQueryFilters;
  explanation: string;
  institutions?: string[];
}

// ─── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a financial intelligence assistant for a platform covering ~10,000 North American financial institutions (banks, credit unions, thrifts, and other regulated entities).

The database has the following filter fields:
- states: array of 2-letter US state codes (e.g. ["TX", "CA"]) or Canadian province codes (e.g. ["ON", "BC"])
- sources: array of data sources — "fdic" (US banks), "ncua" (US credit unions), "osfi" (Canadian banks), "rpaa", "ciro", "fintrac", "fincen"
- charter_types: array — "commercial", "savings", "savings_association", "credit_union"
- min_assets / max_assets: total assets in dollars (e.g. 1000000000 for $1B)
- min_deposits / max_deposits: total deposits in dollars
- has_credit_cards: boolean — true if the institution has a credit card program
- brim_tier: string — one of "T1", "T2", "T3", "T4" (Brim fintech partner tiers)

When the user mentions:
- "BaaS" or "sponsor bank" → infer charter_type commercial, maybe has_credit_cards
- "credit union" or "CU" → charter_types: ["credit_union"], sources: ["ncua"]
- "Canadian" or "Canada" → sources: ["osfi", "rpaa", "ciro", "fintrac"]
- "$1B" → min_assets: 900000000, max_assets: 1100000000 (±10%)
- ">$5B" → min_assets: 5000000000
- State names → convert to 2-letter codes

Respond ONLY with a valid JSON object. No markdown, no explanation outside JSON. Schema:
{
  "intent": "search" | "compare" | "navigate" | "analyze",
  "filters": { /* only include fields relevant to the query */ },
  "explanation": "1-2 sentence plain English summary of what you found or what the query means",
  "institutions": ["Name 1", "Name 2"] // only for compare/navigate intent
}`;

// ─── Handler ──────────────────────────────────────────────────────────────────

export default apiHandler({ methods: ['POST'] }, async (req: VercelRequest, res: VercelResponse) => {
  const body = req.body as { query?: unknown };
  const query = typeof body?.query === 'string' ? body.query.trim() : '';

  if (!query || query.length < 2) {
    return res.status(400).json({ error: 'query is required and must be at least 2 characters' });
  }
  if (query.length > 500) {
    return res.status(400).json({ error: 'query must be 500 characters or fewer' });
  }

  const cacheKey = getCacheKey(query);
  const cached = getCached(cacheKey);
  if (cached) {
    res.setHeader('X-Cache', 'HIT');
    return res.json(cached);
  }

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: query }],
  });

  const textBlock = message.content.find((b) => b.type === 'text');
  const rawText = textBlock?.type === 'text' ? textBlock.text.trim() : '{}';

  let result: AiQueryResult;
  try {
    const parsed = JSON.parse(rawText) as Partial<AiQueryResult>;
    result = {
      intent: parsed.intent ?? 'search',
      filters: parsed.filters ?? {},
      explanation: parsed.explanation ?? '',
      ...(parsed.institutions ? { institutions: parsed.institutions } : {}),
    };
  } catch {
    result = {
      intent: 'search',
      filters: {},
      explanation: 'I could not parse that query. Try searching for an institution name or using filters like "$1B banks in Texas".',
    };
  }

  setCached(cacheKey, result);
  res.setHeader('X-Cache', 'MISS');
  return res.json(result);
});
