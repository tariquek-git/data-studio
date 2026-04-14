import type { VercelRequest } from '@vercel/node';

export interface AdminAuthResult {
  allowed: boolean;
  statusCode: number;
  message: string;
}

function getTokenFromHeader(req: VercelRequest): string {
  const rawHeader = req.headers.authorization ?? req.headers['x-admin-token'];
  if (!rawHeader) return '';
  const tokenValue = Array.isArray(rawHeader) ? rawHeader[0] ?? '' : rawHeader;
  if (tokenValue.toLowerCase().startsWith('bearer ')) {
    return tokenValue.slice(7).trim();
  }
  return tokenValue.trim();
}

export function checkAdminRequest(req: VercelRequest): AdminAuthResult {
  const expectedToken = process.env.ADMIN_API_TOKEN ?? '';
  const providedToken = getTokenFromHeader(req);

  if (!expectedToken) {
    return {
      allowed: false,
      statusCode: 503,
      message: 'Admin token not configured. Set ADMIN_API_TOKEN in the environment.',
    };
  }

  if (!providedToken || providedToken !== expectedToken) {
    return {
      allowed: false,
      statusCode: 401,
      message: 'Admin token missing or invalid.',
    };
  }

  return {
    allowed: true,
    statusCode: 200,
    message: 'ok',
  };
}
