// Seals a secret with AES-GCM under the relay's key, a Worker secret of 32 bytes in base64, so a
// copy of the database alone reveals nothing. Each value gets its own random IV, kept beside it.
const bytes = (base64: string) => Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
const base64 = (data: Uint8Array) => btoa(String.fromCharCode(...data));

async function keyOf(secret: string) {
  const raw = bytes(secret);
  if (raw.length !== 32) throw new Error("The sealing key must be 32 bytes in base64.");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function seal(secret: string, plain: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await keyOf(secret), new TextEncoder().encode(plain)));
  return `${base64(iv)}.${base64(sealed)}`;
}

export async function unseal(secret: string, value: string) {
  const [iv = "", sealed = ""] = value.split(".");
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes(iv) }, await keyOf(secret), bytes(sealed)));
}
