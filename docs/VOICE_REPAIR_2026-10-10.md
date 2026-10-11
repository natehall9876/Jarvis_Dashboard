# Jarvis voice repair — October 10, 2026

## Assignment and acceptance

Nate requested a natural, Jarvis-like voice, working in-app hands-free conversation, and an error review. Preserve the current interface design. Success requires actual microphone capture, intelligible output, repeat turns, interruption, hang-up, and recovery on the intended phone. Automated tests alone do not establish that result.

## Confirmed causes

- Production b572e645e6633a981d1c29d78dace89258e0ba34: clicking Hands-free toggled its label to On while the microphone stayed idle. Reproduced in the authenticated production browser.
- Speech output used the browser default voice, fixed en-US, with separate utterances for sentence fragments. No dedicated natural-voice provider was wired.
- Hands-free had no recovery after a silent recognition end; fatal microphone errors left the mode enabled.
- Final recognition did not release capture before speaking.
- The spoken character offset included tool preambles while the final answer excluded them, which could omit part of the actual answer.
- Public Stop speaking cancelled its restart timer and stranded hands-free. Independent review caught this path.

## Implemented

- First hands-free tap starts capture; switching it off cancels request, speech, microphone, and pending restarts.
- Guarded, deduplicated restarts after silence, replies, mute, and interruption. Repeated silence pauses with a recovery message instead of spinning.
- Capture is detached and stopped before submitting a final transcript. Late and duplicate results cannot repeat a command.
- Microphone start, denied permission, speech playback, and recognition failures report safe errors.
- Prefer an installed British English voice, with preference for enhanced/natural variants. This remains browser speech, not a neural voice service.
- Speak the complete final answer as one utterance, preserving sentence-to-sentence phrasing and excluding preambles.
- Voice requests use concise conversational instructions: composed, attentive, understated British character, occasional dry wit, no reports or Markdown spoken aloud. Current data/tools and explicit write confirmations remain intact.
- No layout, CSS, visual components, permissions, credentials, or business records changed.

## Verification

Twelve new regressions were observed failing before their corresponding changes. The targeted suite passes 16 tests (11 lifecycle/phrasing/interrupt cases plus five API request-control tests, including one new voice-mode validation).
Independent code review approved the repaired scope after the interruption fix.
Full release gates and production release identifiers are recorded below after completion.

The existing browser-based simulated suite was updated for whole-answer speech but was not launched through terminal. The new suite executes real provider callbacks and API route code with controlled browser/provider boundaries; it is not a real-browser microphone test.

## Remaining requirements

- No OPENAI_API_KEY was present in the original local project or the live Vercel environment inventory. The existing advisor uses Anthropic; that key does not supply speech synthesis.
- Natural-voice service connection, implementation, audio evaluation, and real iPhone conversation acceptance remain incomplete. Do not describe this release as a cinematic-quality voice engine.
- The available cloud browser reports blocked microphone permission. No actual microphone signal or perceived speech quality was verified there.
- Browser speech recognition and audio remain dependent on the device/browser and foreground execution. This is an in-app hands-free flow, not a cellular phone call.
- Full application health is not claimed: the live dashboard separately showed the existing QuickBooks 403/3100 failure.
- npm audit found pre-existing dependency advisories (Next.js, sharp, and development dependencies). No dependency upgrade was bundled into the voice repair. Next's critical next/og advisory specifically requires attacker-controlled SVG content; the inspected icon route uses fixed literals. The full attack surface was not assessed.
  References: https://github.com/advisories/GHSA-vcvr-r3jv-pc5j and https://github.com/advisories/GHSA-wq5f-xc86-pv6w

## Continuity

Isolated worktree: C:\Users\nateh\Jarvis_Voice_20261010.
Branch: fix/voice-call-reliability-20261010; base b572e645e6633a981d1c29d78dace89258e0ba34.
Original checkout, other worktrees, and unrelated draft PR #1 were preserved.
Next step after this repair is secure authorization of a natural-voice provider, followed by implementation and a physical-phone acceptance test.


## Completed release gates

- Typecheck: passed.
- ESLint: passed with zero warnings.
- Full isolated regression suite: 530 passed (17.1 seconds).
- Production build: passed.
- Client-secret scan: passed across 30 client JavaScript files.
- Database ownership, anti-spoofing, projection, idempotency, invoice, timezone, Homeworks synchronization, and schedule-authority regressions: passed; test fixtures rolled back.
- git diff --check: passed.
- Independent review: approved after the public speech-interruption regression was repaired.

The pull request for this branch records the exact tested commit, merge, deployment, and post-deployment observations. Physical-phone microphone and sound-quality acceptance remain pending.
