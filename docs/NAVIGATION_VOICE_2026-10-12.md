# Navigation and voice follow-up — October 12, 2026

Nate requested an out/back arrow on every Jarvis page and a faster, natural voice.

## Confirmed causes

- Production had no shared back control. The global root layout now includes a sticky Back and Home bar, with 44px touch targets and safe-area clearance. Real in-app browser history includes filters, survives refresh, and does not treat browser-global history length as permission to leave Jarvis. Direct record links fall back to their section.
- Dialogs and the conversation drawer now expose a larger arrow-and-Back exit. Workshop fullscreen has its own exit arrow inside the fullscreen element.
- Authenticated production Voice diagnostics explicitly reported browser fallback because neural speech is not configured. Redacted checks found no OPENAI_API_KEY in Vercel production, the main project .env.local, or NatesPC process/user environment. No credential was created or changed.
- Device speech ranked a basic British voice above an enhanced US voice. Quality now wins first, with British delivery preferred among equal-quality voices. Device pacing is 1.15 instead of 1.0, and Markdown line breaks become ordinary sentence boundaries. The existing full-answer speech and interruption safeguards are preserved.

## Verification before release

- Five new regressions were observed failing, then passing after implementation.
- 54 focused tests passed: history boundaries, direct-link fallback, refresh and replace, voice selection, numeric text, speech lifecycle, mocked neural streaming/cancellation and existing Jarvis behavior.
- Typecheck passed after all changes. Full lint and targeted lint for dialog/fullscreen changes passed.
- Production build passed; client bundle scan found no server secret references in 37 files.
- Git diff whitespace check passed. Base origin/main was 0b7a1d7, with no concurrent change at the precommit fetch.

## Incomplete acceptance

Natural neural speech is not activated. Secure provisioning of the missing OpenAI API credential requires owner approval. Faster device speech is an interim improvement, not a claim of natural voice quality. No physical iPhone microphone or perceived audio-quality acceptance was performed. Release and live navigation observations will be recorded after deployment.

Workspace: C:\Users\nateh\Jarvis_Navigation_Voice_20261012. Branch: fix/navigation-voice-20261012. Other worktrees and original checkout preserved. No business records changed.
