import { createHmac, scryptSync, timingSafeEqual } from "node:crypto";
import { Redis } from "@upstash/redis";
import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "ilyesb_admin_session";
const STATE_KEY = "ilyesb:platform:state";
const SESSION_SECONDS = 60 * 60 * 8;

export type PlatformState = {
  paused: boolean;
  maintenance: boolean;
  updatedAt: string | null;
};

function redisClient() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new Error("إعدادات Upstash Redis غير مكتملة.");
  return new Redis({ url, token });
}

export function adminConfigured() {
  return Boolean(process.env.ADMIN_PASSWORD_HASH && process.env.ADMIN_SESSION_SECRET && (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL) && (process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN));
}

export function verifyAdminPassword(password: string) {
  const encoded = process.env.ADMIN_PASSWORD_HASH || "";
  const match = /^\$scrypt\$([a-f0-9]{32})\$([a-f0-9]{128})$/i.exec(encoded);
  if (!match || typeof password !== "string" || password.length > 256) return false;
  const actual = scryptSync(password, Buffer.from(match[1], "hex"), 64);
  const expected = Buffer.from(match[2], "hex");
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}

function signature(payload: string) {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("ADMIN_SESSION_SECRET غير مضبوط أو قصير.");
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createAdminSession() {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + SESSION_SECONDS * 1000 })).toString("base64url");
  return payload + "." + signature(payload);
}

export function hasAdminSession(req: NextRequest) {
  try {
    const token = req.cookies.get(COOKIE_NAME)?.value || "";
    const [payload, supplied] = token.split(".");
    if (!payload || !supplied) return false;
    const expected = signature(payload);
    const a = Buffer.from(supplied);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return Number.isFinite(data.exp) && data.exp > Date.now();
  } catch { return false; }
}

export function setAdminCookie(response: NextResponse, token: string) {
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true, secure: process.env.NODE_ENV === "production",
    sameSite: "strict", path: "/admin", maxAge: SESSION_SECONDS
  });
}

export function clearAdminCookie(response: NextResponse) {
  response.cookies.set(COOKIE_NAME, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/admin", maxAge: 0 });
}

export async function getPlatformState(): Promise<PlatformState> {
  const redis = redisClient();
  const value = await redis.get<PlatformState>(STATE_KEY);
  return value && typeof value === "object"
    ? { paused: Boolean(value.paused), maintenance: Boolean(value.maintenance), updatedAt: value.updatedAt || null }
    : { paused: false, maintenance: false, updatedAt: null };
}

export async function savePlatformState(state: PlatformState) {
  await redisClient().set(STATE_KEY, state);
}

export async function auditAdminAction(action: string) {
  const redis = redisClient();
  const entry = JSON.stringify({ action, at: new Date().toISOString() });
  await redis.lpush("ilyesb:admin:audit", entry);
  await redis.ltrim("ilyesb:admin:audit", 0, 99);
}

export { COOKIE_NAME };
