---
name: Private gate assets
description: Keeps unauthenticated login and password pages from breaking when static assets are protected.
---

The production access gate must allowlist the static assets used by the blocked/login page, including branding images and PWA metadata/service-worker files.

**Why:** A protected asset request can be redirected to the login page, which makes an image appear missing even though the asset exists and works in development.

**How to apply:** When adding an asset to a public entry screen, add its exact path to the gate's public request rules and verify it in production mode without an access cookie.