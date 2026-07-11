# Reference — Security-Pass Checklist (Phase 5.5, opt-in)

Loaded ONLY when the Phase 5.5 security pass fires (config `security_review`
`on`/`ask` + a task scored ≥ 70 in the run). Passed to the reviewer as
`security_checklist[]` — the worker sweeps ONLY the run's changed files against
these items, wrapping Semgrep if it is already installed (never installing it).

Severity mapping (same P0–P3 ladder): an item the DIFF makes exploitable = P0 ·
a hardening gap on a touched path = P1 · defense-in-depth suggestions = P2/P3.

## Checklist (OWASP/STRIDE-derived, impact-ordered — the closed set; never extend ad hoc)

1. **Injection** — SQL/NoSQL/command/LDAP built from user input without
   parameterization or a safe builder anywhere in the diff.
2. **Broken auth on new surface** — any new endpoint/route/handler reachable
   without the auth check its siblings carry (spoofing).
3. **Broken authorization** — object/record access without an ownership or role
   check (IDOR); privilege boundaries crossed by the new code (elevation).
4. **Secrets in code** — credentials, tokens, keys, or connection strings
   hardcoded or logged; secrets reaching client bundles or responses
   (information disclosure).
5. **Unvalidated input** — request bodies/params/headers/files used before
   schema validation; mass-assignment of writable model fields (tampering).
6. **Injection into output** — XSS via unescaped user data in HTML/JS contexts;
   unsafe redirects/headers from user input.
7. **Insecure data handling** — sensitive data stored/transmitted unencrypted,
   PII in logs, cache keys/values leaking secrets.
8. **CSRF/replay on state changes** — new state-changing browser endpoints
   without CSRF protection; missing idempotency where retries can double-apply
   (repudiation/tampering).
9. **Resource exhaustion** — new unbounded loops/queries/uploads/allocations an
   attacker controls (denial of service): missing pagination, no timeout, no
   size cap.
10. **Dependency risk** — a newly added dependency that is unmaintained,
    typosquat-suspicious, or pulled for something the stdlib/project already does.
11. **Error-path leaks** — stack traces, internal paths, or raw driver errors
    surfaced to callers by the new error handling.
12. **Crypto misuse** — home-rolled hashing/encryption, weak algorithms (MD5,
    SHA1 for passwords), missing salts, static IVs in the diff.
