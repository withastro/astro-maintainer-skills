---
name: security-advisory-review
description: >
  Review and assess security advisories filed against the Astro framework. Use this skill whenever
  someone asks to review a security advisory, triage a GHSA, evaluate a vulnerability report,
  assess a CVE, or look at a security disclosure for Astro. Also trigger when the user shares
  a security advisory and asks whether it's valid, real, exploitable, or worth fixing — even if
  they don't use the word "security" explicitly but paste something that looks like a vulnerability
  report with a PoC or GHSA identifier.
---

# Security Advisory Review

You are reviewing a security advisory filed against the Astro web framework. Your job is to determine whether the advisory describes a real, exploitable vulnerability — not just a bug or a theoretical concern.

## Mindset: Be Skeptical

Many advisories are generated or heavily assisted by AI tools. They often look convincing — they cite specific code paths, provide PoCs, and use the right terminology — but frequently describe bugs that are not actually exploitable because of protections elsewhere in the framework. A bug is not a vulnerability. Insecure-looking code is not a vulnerability. Only a demonstrated, end-to-end exploit against a realistic application counts.

Your default posture is skepticism. The burden of proof is on the advisory to demonstrate real harm, not on Astro to prove safety.

## The Core Question

For every advisory, the question you must answer is:

**"Can an attacker actually exploit this in a real Astro application to cause harm?"**

Not "is this code ideal?" Not "could this theoretically be a problem?" But: given how Astro actually works end-to-end, can this be exploited?

## How to Review an Advisory

### Step 1: Understand the Claim

Read the advisory carefully and identify exactly what it claims:
- What is the attack vector? (e.g., crafted URL, malicious input, SSRF)
- What is the claimed impact? (e.g., auth bypass, data exposure, RCE)
- What code does it point to as the root cause?

### Step 2: Read the Actual Code

Don't trust the advisory's description of the code. Read the source yourself:
- Read the specific file and function cited
- Read the *callers* of that function — context matters enormously
- Read what happens *after* the cited code runs (routing, rendering, response)
- Check whether other layers of the pipeline normalize, reject, or otherwise handle the input

Astro has defense-in-depth. A flaw in one layer often doesn't matter because another layer catches it. The advisory may cite a real code path but omit the parts that prevent exploitation.

### Step 3: Trace the Full Request Path

For URL/path-based attacks (the most common type), trace the complete request lifecycle:

1. **Adapter layer** — Does the adapter (Node, Cloudflare, etc.) reject or normalize the input before Astro sees it?
2. **Route matching** — Does `getPathnameFromRequest()` and `Router.match()` actually resolve the crafted path to a real route? Route matching uses the *original request URL* with its own `decodeURI`, which is separate from the normalized URL that middleware sees.
3. **URL normalization** — What does `#createNormalizedUrl` do to the input? What does middleware actually see in `ctx.url.pathname`?
4. **Middleware** — Does the middleware receive a pathname that actually bypasses its checks?
5. **Route handler** — Even if middleware is bypassed, does the route handler actually serve sensitive data for the crafted path?

A common pattern in bogus advisories: they show that middleware sees a weird pathname, but never prove that the route handler actually matches and serves something sensitive for that pathname. If the route doesn't match, the request 404s regardless of what middleware does.

### Step 4: Evaluate the PoC

PoCs in advisories often construct artificial scenarios to demonstrate the issue. Look critically at:

- **Catch-all routes (`[...path]`)**: These match everything by design. Showing that a crafted URL reaches a catch-all doesn't prove middleware bypass is meaningful — the catch-all would serve a response for *any* path. The question is whether the crafted path reaches a route that *wouldn't* normally be reachable.
- **Hardcoded sensitive data**: If the PoC endpoint returns `"sensitive-data-exposed"` as a static string, it proves nothing about real data exposure. A real vulnerability needs to show that actual protected resources are accessed.
- **Middleware that only checks prefixes**: Simple `startsWith` checks in the PoC middleware may not reflect real-world auth patterns. Many apps use session tokens, not path-based auth.

### Step 5: Consider the Environment

- **Dev-only issues**: If the vulnerability only works in `astro dev`, it is almost certainly not a real vulnerability. Astro does not support or recommend running the dev server in production. A dev-only issue *could* be a vulnerability if there's a realistic attack scenario (e.g., a malicious website hitting localhost to exfiltrate files), but this requires substantial evidence of actual harm, not just a theoretical possibility.
- **Requires attacker-controlled config**: If exploitation requires the attacker to modify `astro.config.mjs` or application source code, it's not a vulnerability — the attacker already has full control.
- **Requires specific application patterns**: If the vulnerability only works with a very specific, unusual application setup (e.g., a catch-all API route that mirrors protected data), consider whether this pattern is realistic.

## Common Patterns in Invalid Advisories

### "The code looks insecure, therefore it's a vulnerability"

Pointing out that a `catch` block silently swallows an error, or that a function falls back to a less-strict behavior, is identifying a code quality concern — not a vulnerability. The question is always whether this leads to actual exploitation, considering the full pipeline.

### "Middleware sees a weird pathname"

If middleware receives a non-normalized pathname, that's only a vulnerability if:
1. A real route actually matches the non-normalized path
2. The route serves genuinely different (sensitive) content for that path
3. The middleware check would have blocked the normalized version

All three conditions must hold simultaneously. Many advisories prove only condition 3.

### "I bypassed the previous CVE fix"

Claims of incomplete fixes for prior CVEs deserve attention but also extra scrutiny. Check whether the "bypass" actually reaches the same impact as the original CVE, or whether it's a different (possibly non-exploitable) code path that happens to touch the same area.

### "Double/triple encoding bypass"

URL encoding attacks are a common advisory pattern. When evaluating these, trace what *each layer* of the pipeline does with the encoded input. Often the route matching layer decodes differently than the middleware normalization layer, and the route simply doesn't match — so the middleware "bypass" leads to a 404, not a security breach.

### "I configured security wide open and then got hacked"

A common pattern in AI-generated advisories is a PoC that uses maximally permissive security configuration — things like `allowedDomains: [{}]`, `remotePatterns: [{}]`, or similar wildcard/empty-object patterns that explicitly disable protections. If the user opts in to lax security settings, that is the user choosing to disable a safeguard, not a vulnerability in the framework. The framework providing a footgun is a documentation or DX concern, not a security vulnerability. The advisory needs to show exploitation under *default* or *reasonable* configuration to count.

## Writing Your Assessment

Structure your review as:

1. **Summary**: One paragraph restating what the advisory claims.
2. **Analysis**: Walk through the request path step by step. For each claim in the advisory, explain whether it holds up against the actual code. Cite specific files and line numbers.
3. **PoC Evaluation**: Assess whether the PoC demonstrates real exploitation or an artificial scenario.
4. **Verdict**: One of:
   - **Valid vulnerability** — The advisory demonstrates real, exploitable harm in realistic applications. Recommend a fix.
   - **Bug, not a vulnerability** — The code behavior is suboptimal but not exploitable due to other protections. May still be worth fixing as defense-in-depth.
   - **Not a vulnerability** — The advisory does not demonstrate exploitable harm. Explain why.
   - **Needs more information** — The advisory might describe a real issue but doesn't provide sufficient proof. Specify exactly what additional evidence would be needed.
5. **If valid**: Suggest the severity level and a fix approach.


