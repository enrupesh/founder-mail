---
name: Mailbox deletion state
description: Keeps dashboard deletions durable when messages are periodically re-synced from a provider.
---

When a dashboard mirrors messages from an external mail provider, deleting only the local message row is not enough. Persist a tombstone for the provider message ID and skip that ID during webhook and refresh syncs.

**Why:** The provider still retains the message and will return it on the next sync, which makes a supposedly permanent dashboard deletion reappear.

**How to apply:** Keep deletion markers alongside the local message store, check them before saving inbound messages, and remove the visible message plus its marker atomically enough for the storage model.