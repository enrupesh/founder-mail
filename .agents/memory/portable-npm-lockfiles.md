---
name: Portable npm lockfiles
description: Prevents Replit package-firewall URLs from breaking external npm deployments.
---

Lockfiles intended for external deployment providers must not contain Replit package-firewall tarball URLs or their `/npm/` path prefix. Use registry-independent lockfile entries and keep the install command pointed at the public npm registry.

**Why:** External builders such as Render cannot resolve `package-firewall.replit.local`; npm's registry flag alone does not reliably override a `resolved` URL embedded in the lockfile.

**How to apply:** When importing or preparing a Node project for an external builder, inspect `package-lock.json` for internal registry URLs, regenerate it without embedded registry-resolved URLs, and verify with a clean `npm ci` followed by the production build.