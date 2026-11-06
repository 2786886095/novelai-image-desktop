# Issue 83 follow-up candidate (not released)

Version remains 2.7.9+200. Baseline: 2b8064c1afdae43a4aa3d428d68fc74aa738ca75.

The previous change only covered RandomArtistLab. The reported artist-string weight draw uses a different screen on both desktop and Android. That screen now exposes always/random per selected style tag and minimum/maximum per-string random library-tag counts. Typed tags and always-included tags remain unchanged. Limits persist on reopen; zero is allowed; the sampler orders swapped limits and caps to the unique available pool. Changing controls invalidates the prepared batch and never automatically generates an image. Old selections with no mode remain always-included.

Both random draw and string draw keep count controls discoverable, disabled until a random tag exists. The shared `.random-custom-tag-random-range` numeric inputs now reuse the existing themed form styling and 44px sizing, with focus, disabled and reduced-motion states rather than native browser boxes.

Checks: 43 related desktop tests; 34 related Flutter tests including actual string-draw screen controls, persistence and local reroll at 320x700, 420x860 and 800x360; renderer/Electron typecheck; targeted Flutter analyze; Playwright actual production component, count persistence and no horizontal page overflow. A supplementary same-input CSS probe observes 25px/radius0 before, 44px/radius10 after, and 25px/radius0 on rollback. No real accounts or paid generation are used.

This is scoped evidence, not a claim that all product pages or Redmi hardware have been fully audited. Local Windows portable and isolated Android candidates only; no version bump, no release or issue closure. Android test identity is `com.codex.novelai.novelai_mobile.issue83tagscandidate`, locally debug-signed, so it can coexist with the official app. Do not import real account data for this fixture test.
