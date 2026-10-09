// Shown when the pool creator proved admin access to the repo through GitHub.
export function VerifiedBadge({ login }: { login: string | null }) {
  if (!login) return null;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border border-returned/30 bg-returned-bg px-2.5 py-0.5 text-xs font-medium text-returned"
      title={`The pool creator proved admin access to this repository on GitHub as @${login}`}
    >
      <span aria-hidden>✓</span> Verified maintainer · @{login}
    </span>
  );
}
