// Wallet sign-in for reading private advisory links. The user signs a plain message (no gas);
// the token is that message plus the signature, valid for 24 hours.

export const SIGN_IN_TTL_SECONDS = 24 * 60 * 60;

export function signInMessage(address: string, issuedAt: number, host: string): string {
  return [
    `${host} wants you to sign in to ReportBond.`,
    "",
    "This only proves you own this wallet. It costs nothing and moves no money.",
    "",
    `Address: ${address.toLowerCase()}`,
    `Issued at: ${issuedAt}`,
  ].join("\n");
}

export type SignInToken = { address: string; issuedAt: number; host: string; signature: `0x${string}` };

export function encodeToken(t: SignInToken): string {
  return btoa(JSON.stringify(t));
}

export function decodeToken(s: string): SignInToken | null {
  try {
    const t = JSON.parse(atob(s));
    if (typeof t.address === "string" && typeof t.issuedAt === "number" && typeof t.signature === "string") return t;
  } catch {}
  return null;
}
