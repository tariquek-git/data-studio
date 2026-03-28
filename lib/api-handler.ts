import type { VercelRequest, VercelResponse } from '@vercel/node';

type HttpMethod = 'GET' | 'POST' | 'OPTIONS';

interface HandlerConfig {
  methods: HttpMethod[];
}

type HandlerFn = (req: VercelRequest, res: VercelResponse) => Promise<unknown>;

export function apiHandler(config: HandlerConfig, fn: HandlerFn) {
  return async (req: VercelRequest, res: VercelResponse) => {
    // CORS preflight
    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }
    if (!config.methods.includes(req.method as HttpMethod)) {
      return res.status(405).json({ error: 'Method not allowed' });
    }
    try {
      return await fn(req, res);
    } catch (err) {
      console.error('API error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  };
}
