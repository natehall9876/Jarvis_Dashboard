# Google OAuth branding publication review

Status: prepared for owner review; not production-published by this change.

## Why
Calendar authorization and actual event retrieval succeeded in production on October 10, 2026. Google's Audience screen still blocks moving out of Testing because Branding is incomplete. The owner's screenshots show empty homepage, privacy-policy, and terms fields. Google documents these links as required for external production apps.

## Proposed change
- Add static /about, /privacy, and /terms pages.
- Make only those exact informational routes public in the app proxy. They query no account or business data.
- Add policy links to sign-in and Settings.
- Preserve dashboard, integration, and database access controls.
- Match the existing Jarvis palette, readable line lengths, wrapping navigation, and mobile-friendly tap targets.

## Draft policy review
The text describes the current read-only Calendar implementation: server-side OAuth credentials and selected-calendar metadata in Supabase, on-demand event previews kept separate from Homeworks, and disconnection without deleting source events. It identifies Vercel, Supabase, Google, AI behavior, browser storage/voice, and the operator's contact. The owner must review and approve these public disclosures and terms before production publication.

## Hosting findings
An anonymous GET of https://jarvis-dashboard-weedeater.vercel.app/login redirects to Vercel SSO.
The project's registered production domain is jarvis-dashboard-fawn.vercel.app. An anonymous GET of its /login returns HTTP 200 with the Jarvis title.
Use the registered production domain for the public information pages. No Vercel protection setting needs to be disabled.

Proposed fields, to be checked live after approved deployment:
- Application home page: https://jarvis-dashboard-fawn.vercel.app/about
- Privacy policy: https://jarvis-dashboard-fawn.vercel.app/privacy
- Terms: https://jarvis-dashboard-fawn.vercel.app/terms
- Add jarvis-dashboard-fawn.vercel.app as an authorized domain in Google Branding, preserving the existing weedeater domain and OAuth callback.

## Validation
- Typecheck passed.
- Production build passed; all three information pages generated statically.
- 42 targeted tests passed, including exact public-path access during auth outages, protected neighboring/business paths, recovery behavior, and privileged integration-owner access.
- Live publication, Google domain/branding acceptance, production consent, long-term refresh reliability, mobile viewport rendering, and physical iPhone acceptance remain unverified.

## Next gate
Owner approval to merge and publish these public pages. After publication verify anonymous 200 responses, privacy/terms links, and continued sign-in requirements on business pages. Then enter the verified URLs into Google Branding, complete any domain verification Google requests, save, and inspect Audience publishing readiness. Publishing and successful consent do not guarantee permanent tokens.

References:
- https://support.google.com/cloud/answer/15549049
- https://developers.google.com/identity/protocols/oauth2
