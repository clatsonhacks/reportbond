"use client";

import { useCallback } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { encodeToken, signInMessage, SIGN_IN_TTL_SECONDS } from "./auth";

const key = (address: string) => `reportbond.signin.${address.toLowerCase()}`;

/** Returns a bearer token for the connected wallet, asking for a signature only when needed. */
export function useSignIn() {
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();

  return useCallback(async (): Promise<string> => {
    if (!address) throw new Error("Connect your wallet first");
    try {
      const saved = localStorage.getItem(key(address));
      if (saved) {
        const { token, issuedAt } = JSON.parse(saved);
        if (Date.now() / 1000 - issuedAt < SIGN_IN_TTL_SECONDS - 300) return token;
      }
    } catch {}

    const issuedAt = Math.floor(Date.now() / 1000);
    const host = window.location.host;
    const signature = await signMessageAsync({ message: signInMessage(address, issuedAt, host) });
    const token = encodeToken({ address: address.toLowerCase(), issuedAt, host, signature });
    try {
      localStorage.setItem(key(address), JSON.stringify({ token, issuedAt }));
    } catch {}
    return token;
  }, [address, signMessageAsync]);
}
