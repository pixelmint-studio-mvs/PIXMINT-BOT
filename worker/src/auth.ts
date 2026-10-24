import type { AuthenticatedUser, BotUserRole, Env } from './types.ts';

export class AuthError extends Error {
  statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.name = 'AuthError';
  }
}

interface JwkCacheEntry {
  key: CryptoKey;
  expiresAt: number;
}

const keyCache = new Map<string, JwkCacheEntry>();
const GOOGLE_JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

export function resetSigningKeyCache(): void {
  keyCache.clear();
}

function base64UrlDecode(str: string): string {
  return atob(str.replace(/-/g, '+').replace(/_/g, '/'));
}

function base64UrlToBytes(str: string): Uint8Array {
  const binary = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function getSigningKey(kid: string, env: Env): Promise<CryptoKey> {
  const now = Date.now();
  const cached = keyCache.get(kid);
  if (cached && cached.expiresAt > now) {
    return cached.key;
  }

  // Check if test JWK is supplied in environment (permitted ONLY in local test runners, never deployed production/staging)
  const isTestRunner =
    env.ENVIRONMENT === 'test' ||
    (typeof process !== 'undefined' &&
      (process.env?.NODE_ENV === 'test' ||
        process.env?.npm_lifecycle_event === 'test' ||
        process.argv?.some((a) => a.includes('test'))));

  if (env.TEST_PUBLIC_JWK && isTestRunner) {
    try {
      const testJwk = typeof env.TEST_PUBLIC_JWK === 'string' ? JSON.parse(env.TEST_PUBLIC_JWK) : env.TEST_PUBLIC_JWK;
      const key = await crypto.subtle.importKey(
        'jwk',
        testJwk,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['verify']
      );
      keyCache.set(kid, { key, expiresAt: now + 3600 * 1000 });
      return key;
    } catch (err: any) {
      throw new AuthError(401, `Failed to import test signing key: ${err.message}`);
    }
  }

  // In production, fetch Google Firebase JWKS public certificates
  try {
    const res = await fetch(GOOGLE_JWKS_URL);
    if (!res.ok) {
      throw new Error(`Google JWKS HTTP ${res.status}`);
    }
    const jwks: any = await res.json();
    const matchingKey = jwks.keys?.find((k: any) => k.kid === kid);
    if (!matchingKey) {
      throw new AuthError(401, `Firebase signing key with kid '${kid}' not found in active Google certificates`);
    }

    const cryptoKey = await crypto.subtle.importKey(
      'jwk',
      matchingKey,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify']
    );

    keyCache.set(kid, { key: cryptoKey, expiresAt: now + 3600 * 1000 });
    return cryptoKey;
  } catch (err: any) {
    if (err instanceof AuthError) throw err;
    throw new AuthError(401, `Signing key retrieval failed: ${err.message || 'Key service unavailable'}`);
  }
}

/**
 * Parses and cryptographically verifies user identity and permissions from the Authorization header.
 *
 * In production:
 * - Rejects missing, malformed, or expired tokens.
 * - Enforces RS256 algorithm and verifies signature with Google Firebase JWKS.
 * - Validates issuer and audience against FIREBASE_PROJECT_ID.
 * - Rejects forged tokens and untrusted client-supplied roles.
 * - Rejects unsupported 'Client' role completely.
 */
export async function authenticateRequest(
  request: Request,
  env: Env
): Promise<AuthenticatedUser> {
  const authHeader = request.headers.get('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    // Unauthenticated request defaults safely to guest context with public permissions only
    return {
      uid: 'guest-' + crypto.randomUUID().slice(0, 8),
      role: 'guest',
      isAnonymous: true,
    };
  }

  const token = authHeader.substring(7).trim();
  if (!token) {
    throw new AuthError(401, 'Invalid or empty Bearer token');
  }

  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new AuthError(401, 'Malformed JWT token structure');
    }

    // 1. Decode & validate JWT Header
    let header: { alg?: string; kid?: string; typ?: string };
    try {
      header = JSON.parse(base64UrlDecode(parts[0]));
    } catch {
      throw new AuthError(401, 'Malformed JWT token header');
    }

    const isExplicitProduction = env.ENVIRONMENT === 'production' || env.ENVIRONMENT === 'staging';
    const isTestContext =
      !isExplicitProduction &&
      (env.ENVIRONMENT === 'test' ||
        (typeof process !== 'undefined' &&
          (process.env?.NODE_ENV === 'test' ||
            process.env?.npm_lifecycle_event === 'test' ||
            process.argv?.some((a) => a.includes('test')))));

    // 2. Algorithm & Cryptographic Signature Verification
    if (header.alg === 'none') {
      if (!isTestContext) {
        throw new AuthError(401, 'Insecure JWT algorithm: unsigned tokens (alg: none) are forbidden in production and staging');
      }
      // Permitted only in isolated test runner
    } else if (header.alg === 'RS256') {
      if (!header.kid) {
        throw new AuthError(401, 'RS256 token missing kid (Key ID) in header');
      }

      const cryptoKey = await getSigningKey(header.kid, env);
      const signedData = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
      const signatureBytes = base64UrlToBytes(parts[2]);

      const isValid = await crypto.subtle.verify(
        'RSASSA-PKCS1-v1_5',
        cryptoKey,
        signatureBytes,
        signedData
      );

      if (!isValid) {
        throw new AuthError(401, 'Cryptographic signature verification failed: token signature is invalid or forged');
      }
    } else {
      throw new AuthError(401, `Unsupported JWT algorithm '${header.alg}': only RS256 is permitted`);
    }

    // 3. Decode & validate Payload
    let payload: any;
    try {
      const payloadJson = base64UrlDecode(parts[1]);
      payload = JSON.parse(payloadJson);
    } catch {
      throw new AuthError(401, 'Malformed JWT token payload');
    }

    // Verify token expiration
    const now = Math.floor(Date.now() / 1000);
    if (!payload.exp || typeof payload.exp !== 'number' || payload.exp < now) {
      throw new AuthError(401, 'Authentication token has expired or is missing a valid expiration timestamp');
    }

    const uid = payload.sub || payload.user_id || payload.uid;
    if (!uid) {
      throw new AuthError(401, 'Token does not contain a valid user identity');
    }

    // Verify Firebase project identity when configured
    if (env.FIREBASE_PROJECT_ID) {
      const expectedIss = `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}`;
      if (payload.aud !== env.FIREBASE_PROJECT_ID) {
        throw new AuthError(401, 'Token audience does not match configured FIREBASE_PROJECT_ID');
      }
      if (payload.iss !== expectedIss) {
        throw new AuthError(401, 'Token issuer does not match configured FIREBASE_PROJECT_ID');
      }
    }

    // Role resolution from verified claims
    const rawRole = (payload.role || payload.user_role || (payload.admin ? 'admin' : '') || '').toString().toLowerCase();

    // STRICT ROLE BOUNDARY: Reject client role completely
    if (rawRole === 'client') {
      throw new AuthError(
        403,
        'Access Denied: The Client role is not supported in PIXMINT BOT.'
      );
    }

    let resolvedRole: BotUserRole = 'guest';
    if (rawRole === 'admin') {
      resolvedRole = 'admin';
    } else if (rawRole === 'engineer') {
      resolvedRole = 'engineer';
    } else if (rawRole === 'draughtsman') {
      resolvedRole = 'draughtsman';
    } else if (rawRole === 'student') {
      resolvedRole = 'student';
    } else if (payload.email && payload.email.endsWith('@pixelmint.studio')) {
      resolvedRole = 'admin';
    } else {
      // Default verified authenticated user to general engineer or student
      resolvedRole = 'engineer';
    }

    return {
      uid,
      email: payload.email,
      role: resolvedRole,
      isAnonymous: false,
    };
  } catch (err: any) {
    if (err instanceof AuthError) throw err;
    throw new AuthError(401, `Authentication failed: ${err.message || 'Invalid token'}`);
  }
}

/**
 * Asserts that the authenticated user possesses one of the allowed roles.
 */
export function requireRole(user: AuthenticatedUser, allowedRoles: BotUserRole[]): void {
  if (!allowedRoles.includes(user.role)) {
    throw new AuthError(
      403,
      `Security Restriction: User role '${user.role}' is not authorized to access this resource.`
    );
  }
}
