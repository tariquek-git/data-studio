/**
 * Parses universal search query string and extracts structured filter tokens.
 * Supports:
 *   $14B / $500M / $2T  → asset range ±10%
 *   >$5B / <$500M       → asset gte/lte
 *   roa>1.5 / roa<0     → ROA filter
 *   OH / TX / CA        → US state
 *   credit union / CU   → charter_type
 *   fdic / ncua / osfi  → source filter
 */

const BILLION = 1_000_000_000;
const MILLION = 1_000_000;
const TRILLION = 1_000_000_000_000;
const THOUSAND = 1_000;

const US_STATES = new Set([
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY','DC',
]);

const CA_PROVINCES = new Set(['AB','BC','MB','NB','NL','NS','ON','PE','QC','SK','YT','NT','NU']);

export interface ParsedSearchQuery {
  textQuery: string;
  minAssets?: number;
  maxAssets?: number;
  minRoa?: number;
  maxRoa?: number;
  states?: string[];
  sources?: string[];
  charterTypes?: string[];
}

function parseMagnitude(value: string, suffix: string): number {
  const n = parseFloat(value);
  if (isNaN(n)) return 0;
  switch (suffix.toUpperCase()) {
    case 'T': return n * TRILLION;
    case 'B': return n * BILLION;
    case 'M': return n * MILLION;
    case 'K': return n * THOUSAND;
    default:  return n;
  }
}

export function parseSearchQuery(raw: string): ParsedSearchQuery {
  const result: ParsedSearchQuery = { textQuery: '' };
  const tokens = raw.trim().split(/\s+/);
  const remaining: string[] = [];

  for (const token of tokens) {
    const upper = token.toUpperCase();

    // Asset range: $14B or $500M (±10%)
    const assetExact = token.match(/^\$(\d+(?:\.\d+)?)(T|B|M|K)?$/i);
    if (assetExact) {
      const val = parseMagnitude(assetExact[1], assetExact[2] ?? '');
      if (val > 0) {
        result.minAssets = val * 0.90;
        result.maxAssets = val * 1.10;
      }
      continue;
    }

    // Asset gte: >$5B
    const assetGte = token.match(/^>\$(\d+(?:\.\d+)?)(T|B|M|K)?$/i);
    if (assetGte) {
      result.minAssets = parseMagnitude(assetGte[1], assetGte[2] ?? '');
      continue;
    }

    // Asset lte: <$500M
    const assetLte = token.match(/^<\$(\d+(?:\.\d+)?)(T|B|M|K)?$/i);
    if (assetLte) {
      result.maxAssets = parseMagnitude(assetLte[1], assetLte[2] ?? '');
      continue;
    }

    // ROA filter: roa>1.5 or roa<0
    const roaGte = token.match(/^roa>(-?\d+(?:\.\d+)?)%?$/i);
    if (roaGte) { result.minRoa = parseFloat(roaGte[1]); continue; }
    const roaLte = token.match(/^roa<(-?\d+(?:\.\d+)?)%?$/i);
    if (roaLte) { result.maxRoa = parseFloat(roaLte[1]); continue; }

    // US state: 2-letter abbreviation
    if (US_STATES.has(upper) || CA_PROVINCES.has(upper)) {
      result.states = [...(result.states ?? []), upper];
      continue;
    }

    // Source keywords
    if (['FDIC', 'NCUA', 'OSFI', 'BCFSA', 'FSRA', 'RPAA', 'CIRO', 'FINTRAC'].includes(upper)) {
      result.sources = [...(result.sources ?? []), token.toLowerCase()];
      continue;
    }

    // Charter type keywords
    if (upper === 'CU' || upper === 'CREDITUNION' || upper === 'CREDIT') {
      result.charterTypes = [...(result.charterTypes ?? []), 'credit_union'];
      continue;
    }
    if (upper === 'BANK' || upper === 'COMMERCIAL') {
      result.charterTypes = [...(result.charterTypes ?? []), 'commercial'];
      continue;
    }
    if (upper === 'SAVINGS') {
      result.charterTypes = [...(result.charterTypes ?? []), 'savings', 'savings_association'];
      continue;
    }

    remaining.push(token);
  }

  result.textQuery = remaining.join(' ');
  return result;
}
