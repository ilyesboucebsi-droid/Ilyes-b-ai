import { createHmac, scryptSync, timingSafeEqual, randomUUID } from "node:crypto";
import { Redis } from "@upstash/redis";
import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "ilyesb_admin_session";
const STATE_KEY = "ilyesb:platform:state";
const JOIN_KEY = "ilyesb:platform:join-requests";
const SESSION_SECONDS = 60 * 60 * 8;

export type PlatformState = {
  paused: boolean;
  maintenance: boolean;
  joinEnabled: boolean;
  updatedAt: string | null;
};

export type JoinRequest = {
  id: string;
  name: string;
  email: string;
  message: string;
  createdAt: string;
};

function redisCredentials() {
  // Never mix URL and token from different environment-variable pairs.
  // Vercel projects may retain legacy KV_* values alongside the current UPSTASH_* pair.
  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (upstashUrl || upstashToken) {
    if (!upstashUrl || !upstashToken) throw new Error("إعدادات UPSTASH_REDIS_REST_URL وUPSTASH_REDIS_REST_TOKEN غير مكتملة.");
    return { url: upstashUrl, token: upstashToken };
  }

  const kvUrl = process.env.KV_REST_API_URL?.trim();
  const kvToken = process.env.KV_REST_API_TOKEN?.trim();
  if (!kvUrl || !kvToken) throw new Error("إعدادات Upstash Redis غير مكتملة.");
  return { url: kvUrl, token: kvToken };
}

export function redisClient() {
  return new Redis(redisCredentials());
}

export function adminConfigured() {
  try {
    redisCredentials();
    return Boolean(process.env.ADMIN_PASSWORD_HASH && process.env.ADMIN_SESSION_SECRET);
  } catch {
    return false;
  }
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
    sameSite: "strict", path: "/", maxAge: SESSION_SECONDS
  });
}

export function clearAdminCookie(response: NextResponse) {
  response.cookies.set(COOKIE_NAME, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: 0 });
}

export async function getPlatformState(): Promise<PlatformState> {
  const value = await redisClient().get<PlatformState>(STATE_KEY);
  return value && typeof value === "object"
    ? { paused: Boolean(value.paused), maintenance: Boolean(value.maintenance), joinEnabled: value.joinEnabled !== false, updatedAt: value.updatedAt || null }
    : { paused: false, maintenance: false, joinEnabled: true, updatedAt: null };
}

export async function savePlatformState(state: PlatformState) {
  await redisClient().set(STATE_KEY, state);
}

export async function saveJoinRequest(input: Omit<JoinRequest, "id" | "createdAt">) {
  const request: JoinRequest = { ...input, id: randomUUID(), createdAt: new Date().toISOString() };
  const redis = redisClient();
  await redis.lpush(JOIN_KEY, JSON.stringify(request));
  await redis.ltrim(JOIN_KEY, 0, 499);
  return request;
}

export async function getJoinRequests(): Promise<JoinRequest[]> {
  const rows = await redisClient().lrange<string>(JOIN_KEY, 0, 99);
  return rows.map(row => typeof row === "string" ? JSON.parse(row) as JoinRequest : row as unknown as JoinRequest);
}

export async function auditAdminAction(action: string) {
  const redis = redisClient();
  const entry = JSON.stringify({ action, at: new Date().toISOString() });
  await redis.lpush("ilyesb:admin:audit", entry);
  await redis.ltrim("ilyesb:admin:audit", 0, 99);
}

export async function getAdminAudit() {
  const rows = await redisClient().lrange<string>("ilyesb:admin:audit", 0, 19);
  return rows.map(row => typeof row === "string" ? JSON.parse(row) : row);
}

export { COOKIE_NAME };
