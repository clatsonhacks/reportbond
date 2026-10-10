// Review playbooks ("skills") the triage agent can load when a report is about that class of bug.
// Each one is a checklist of what to verify in the code before believing the claim, written so the
// agent does the checking with its tools instead of judging from the report's wording.
import "server-only";

export type Skill = { name: string; description: string; body: string };

export const SKILLS: Skill[] = [
  {
    name: "memory-safety",
    description: "Buffer overflows, out-of-bounds reads and writes, use-after-free, integer overflow in C, C++, unsafe Rust.",
    body: `# Reviewing a memory-safety report

Verify each link in the chain in the code, with read_file:
1. The buffer: find its declaration. What is its real size, and is it stack, heap or static?
2. The length: where does the size or index used in the copy come from? Trace it back to its source.
3. The check: is there a bounds check between the source and the copy? Look in the function, its callers, and any validation helper. A check elsewhere on every path makes the report a mistake.
4. Reachability: can untrusted input reach this function? Use search_code to find callers. Code only reached from tests or trusted configuration is lower severity or out of scope.
5. Off-by-one and terminators: for string copies, count the terminating byte.
6. Integer overflow: check the types in size arithmetic (int vs size_t, signed vs unsigned) before allocation or comparison.

Signs it is real: the report names the buffer, its size, the unchecked length and a concrete input, and each matches the code.
Signs it is a mistake: a real code path, but a bounds check the reporter missed, or the length is a constant.
Signs it is slop: the function, file or buffer doesn't exist; sizes or line numbers that don't match the file; "may be vulnerable" with no path from input to the copy.`,
  },
  {
    name: "injection",
    description: "SQL injection, command injection, path traversal, template injection, unsafe deserialization, eval.",
    body: `# Reviewing an injection report

1. The sink: find the exact call the report names (query execution, exec/system/spawn, file open, template render, deserialize, eval). Read it.
2. The data: is the value reaching the sink built from input by concatenation or formatting, or passed as a bound parameter or argument array? Parameterised queries and argv arrays are not injectable by that route.
3. The source: trace the value back. Is it from a request, a file, an environment variable, or a constant? Use search_code for callers.
4. Sanitising: is there validation, escaping, an allow-list or path normalisation on the way? Check it is applied on every path and before, not after, use.
5. For path traversal: is the joined path checked to stay under the base directory after resolving ".." and symlinks?
6. For deserialization: which format and library? Only formats that instantiate arbitrary types (pickle, Java serialization, YAML with unsafe loader) are dangerous by themselves.

Signs it is real: a concrete sink, a concrete source, no effective sanitising, and a payload that fits the code.
Signs it is a mistake: the sink is parameterised, or the value is not attacker-controlled.
Signs it is slop: generic payload lists, endpoints or parameters the project doesn't have, a sink that isn't in the code.`,
  },
  {
    name: "access-control",
    description: "Authentication bypass, missing authorization checks, IDOR, privilege escalation, session and token handling.",
    body: `# Reviewing an access-control report

1. The protected action: find the handler or function the report says is exposed.
2. The check: is authorization enforced there, in middleware, in a decorator, or in a caller? Read the routing or wiring as well as the handler: the check is often applied one level up.
3. The identity: where does the user or role come from? Is it taken from a verified session or token, or from a client-supplied field?
4. Object ownership (IDOR): when an ID from the request selects a record, is the record's owner compared with the caller?
5. Tokens and sessions: how are they verified (signature, expiry, audience)? Is the comparison constant-time where it matters?
6. Defaults: what happens when the check's input is missing or malformed? Fail-open is a finding.

Signs it is real: the report shows a specific request by a specific kind of user reaching an action with no check on that path.
Signs it is a mistake: the check exists in middleware or a caller the reporter didn't read.
Signs it is slop: roles, endpoints or auth mechanisms the project doesn't have; "authentication could be bypassed" with no path.`,
  },
  {
    name: "web",
    description: "XSS, CSRF, SSRF, open redirect, CORS misconfiguration, header and cookie issues in web applications.",
    body: `# Reviewing a web vulnerability report

1. Confirm the project has the surface at all: does it serve HTTP, render HTML, or make outbound requests? A library with no web layer can't have XSS.
2. XSS: find where the value is written into a response. Is output escaped by the template engine or framework by default? Was escaping explicitly turned off (raw, safe, dangerouslySetInnerHTML, innerHTML)?
3. CSRF: is the endpoint state-changing, and authenticated by a cookie? Token-in-header APIs are not CSRF-able. Look for framework CSRF protection and SameSite settings.
4. SSRF: find the outbound request. Is the URL or host attacker-controlled? Is there an allow-list, and is it checked after redirects and DNS resolution?
5. Open redirect: is the redirect target validated as relative or against an allow-list?
6. CORS and headers: a missing security header alone is usually low severity or out of scope; check the rulebook.

Signs it is real: a concrete input, the exact place it is reflected or used, and no encoding or validation between.
Signs it is a mistake: framework escaping or protection the reporter overlooked; a theoretical issue needing an attacker who already has the access.
Signs it is slop: scanner output listing missing headers with no analysis; pages or parameters that don't exist.`,
  },
  {
    name: "crypto",
    description: "Weak or misused cryptography, hard-coded secrets, bad randomness, signature and certificate validation flaws.",
    body: `# Reviewing a cryptography report

1. What is being protected, and what is the algorithm actually used for? MD5 or SHA-1 as a cache key or checksum is not a vulnerability; as a password hash or signature it is.
2. Randomness: is a non-cryptographic generator used for a secret (token, key, nonce, password reset)? Find the call and what consumes its output.
3. Keys and secrets: is the reported "hard-coded secret" a real credential, or a test fixture, example or placeholder? Check the path and how it is loaded.
4. Signature and certificate checks: is verification present and is its result used? Look for disabled verification flags and for comparisons that aren't constant-time.
5. Modes and parameters: ECB, a fixed or reused IV or nonce, missing authentication, low iteration counts. Read the actual parameters in the code.
6. Is the weak primitive reachable in the default configuration, or only when a user opts in?

Signs it is real: a secret or security decision depends on the weak primitive, shown in the code.
Signs it is a mistake: the primitive is used for a non-security purpose, or the secret is a test value.
Signs it is slop: "uses MD5" with no statement of what depends on it; algorithms the code doesn't use.`,
  },
  {
    name: "denial-of-service",
    description: "Crashes, infinite loops, unbounded memory or CPU, ReDoS, resource exhaustion from crafted input.",
    body: `# Reviewing a denial-of-service report

1. The trigger: what input causes it, and how large or crafted must it be? Read the loop, recursion or allocation the report names.
2. The bound: is there a size limit, depth limit, timeout or quota? Look at the entry point as well as the function.
3. Cost asymmetry: does a small input cause large work (quadratic parsing, catastrophic regex backtracking, decompression)? A large input causing proportionally large work is usually not a vulnerability.
4. For regex: read the pattern. Nested quantifiers over overlapping classes are the risk; check the engine too, since some guarantee linear time.
5. Crash vs. hang vs. slowdown: a null dereference or assertion on untrusted input is a crash; confirm the path has no earlier check.
6. Who can send it: unauthenticated remote input is worse than a local file the user chose to open. Check the rulebook for how DoS is rated.

Signs it is real: a small specific input, the unbounded operation in the code, and no limit on the way.
Signs it is a mistake: an existing limit, or work proportional to input size.
Signs it is slop: "an attacker could send many requests"; no specific input or code path.`,
  },
  {
    name: "smart-contracts",
    description: "Solidity and EVM contracts: reentrancy, access control, arithmetic, signature replay, oracle and upgrade issues.",
    body: `# Reviewing a smart contract report

1. The function and its modifiers: read it, with its visibility and access modifiers. Who can call it?
2. Reentrancy: is there an external call or value transfer before state is updated? Is there a reentrancy guard, and does the function follow checks-effects-interactions?
3. Arithmetic: which compiler version? From 0.8 arithmetic reverts on overflow unless inside unchecked. Check rounding direction in divisions that move money.
4. Signatures: is the signed data bound to the chain, the contract and a nonce or a state that changes? Can a signature be replayed on another chain, contract or call?
5. Money flow: follow the balance. Can the claimed sequence actually take out more than was put in? Look at the invariants and the tests.
6. Trust assumptions: an owner doing owner things is not a vulnerability unless the rulebook says so. Check upgradeability and privileged roles against the documented design.

Signs it is real: a concrete call sequence, with the state before and after, that breaks an invariant.
Signs it is a mistake: a guard, modifier or compiler check the reporter missed; behaviour that is by design.
Signs it is slop: generic "reentrancy possible" on a function with no external call; functions that don't exist in the contract.`,
  },
];

export const skillIndex = () => SKILLS.map((s) => `- ${s.name}: ${s.description}`).join("\n");
export const findSkill = (name: string) => SKILLS.find((s) => s.name === name.trim().toLowerCase());

// Which playbooks fit a report, judged from its wording. Models don't reliably ask for a playbook,
// so the best match is given to the reviewer up front; load_skill remains for the others.
const SIGNALS: Record<string, RegExp> = {
  "smart-contracts": /\.sol\b|solidity|reentran|msg\.sender|smart contract|\bevm\b|erc-?20|delegatecall/gi,
  "memory-safety": /overflow|out[- ]of[- ]bounds|use[- ]after[- ]free|memcpy|strcpy|\bheap\b|stack buffer|double free|null (pointer )?deref|memory corruption/gi,
  injection: /sql injection|command injection|path traversal|directory traversal|deseriali[sz]|template injection|\beval\b|shell command|\bsqli\b/gi,
  "access-control": /authenticat|authori[sz]|access control|privilege|\bidor\b|permission|bypass|session|\bjwt\b|unauthori[sz]ed/gi,
  web: /\bxss\b|cross-site|\bcsrf\b|\bssrf\b|open redirect|\bcors\b/gi,
  crypto: /cryptograph|cipher|\bmd5\b|\bsha-?1\b|weak random|predictable|\bnonce\b|certificate|hard-?coded (secret|key|password)/gi,
  "denial-of-service": /denial[- ]of[- ]service|\bdos\b|redos|infinite loop|\bcrash|exhaust|unbounded/gi,
};

/** The playbooks that best match a report's text, most relevant first. */
export function pickSkills(text: string, max: number): Skill[] {
  return SKILLS.map((skill) => ({ skill, hits: (text.match(SIGNALS[skill.name]) ?? []).length }))
    .filter((x) => x.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .slice(0, max)
    .map((x) => x.skill);
}
