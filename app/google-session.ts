import { cookies } from "next/headers";

const SESSION_COOKIE = "hazem_dashboard_google_session";

export type GoogleSession = {
  userId: string;
  email: string;
  name: string;
  expiresAt: number;
};

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(normalized + padding);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function encryptionKey() {
  const secret = process.env.APP_ENCRYPTION_KEY;
  if (!secret || secret.length < 32) throw new Error("CALENDAR_NOT_CONFIGURED");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encrypt(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(), new TextEncoder().encode(value));
  return `${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(ciphertext))}`;
}

export async function decrypt(value: string) {
  const [iv, ciphertext] = value.split(".");
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(iv) }, await encryptionKey(), base64ToBytes(ciphertext));
  return new TextDecoder().decode(plaintext);
}

export async function getGoogleSession(): Promise<GoogleSession | null> {
  try {
    const cookieStore = await cookies();
    const sealed = cookieStore.get(SESSION_COOKIE)?.value;
    if (!sealed) return null;
    const session = JSON.parse(await decrypt(sealed)) as GoogleSession;
    if (!session.userId || !session.email || session.expiresAt <= Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}

export async function setGoogleSession(user: Omit<GoogleSession, "expiresAt">) {
  const maxAge = 60 * 60 * 24 * 30;
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, await encrypt(JSON.stringify({ ...user, expiresAt: Date.now() + maxAge * 1000 })), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge,
    path: "/",
  });
}

export async function clearGoogleSession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}
