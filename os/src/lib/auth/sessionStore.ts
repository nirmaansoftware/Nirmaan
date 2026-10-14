import { prisma } from "../db/client";
import { generateToken, hashToken, looksLikeToken } from "./tokens";
import { verifyPassword } from "./password";

/**
 * Database side of sessions, kept free of Next.js imports so it can be
 * tested directly. The cookie glue lives in ./session.ts.
 */
export const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export async function createSession(userId: string, now = new Date()) {
  const token = generateToken();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  await prisma.session.create({ data: { tokenHash: hashToken(token), userId, expiresAt } });
  return { token, expiresAt };
}

/** The active user behind a raw session token, or null. Expired sessions are deleted on sight. */
export async function userForToken(token: string | undefined, now = new Date()) {
  if (!looksLikeToken(token)) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!session) return null;
  if (session.expiresAt <= now) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  if (!session.user.active) return null;
  return session.user;
}

export async function deleteSession(token: string | undefined) {
  if (!looksLikeToken(token)) return;
  await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
}

/**
 * Checks credentials. Returns the user or null, and spends the same scrypt
 * work whether or not the email exists, so response time doesn't reveal
 * which emails have accounts.
 */
const DUMMY_HASH =
  "scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

export async function authenticate(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok || !user.active) return null;
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  return user;
}
