# Third-party code, services and licences

| What | Where | Licence / terms | Notes |
| --- | --- | --- | --- |
| @vercel/blob | api/_storage.js | Apache-2.0 | only used with STORAGE=blob |
| web-push | api/_push.js | MPL-2.0 | phone notifications |
| jsPDF 2.5.2 | loaded in the browser from cdn.jsdelivr.net (fallback unpkg.com) | MIT | pinned version with a subresource-integrity hash |
| Figtree font | Google Fonts | SIL Open Font License 1.1 | used by the Team app, Price Builder and proposals |
| Spotify embed | Team → Music | Spotify terms | only loads when someone opens the player |
| wa.me, t.me links | Leads | – | plain links that open WhatsApp or Telegram |

## Fonts: please read

The original apps used **Söhne** (Klim Type Foundry), a commercial font licensed to the
original agency. Its licence does not transfer, so the font files were **not copied**. This
edition uses **Figtree** (free, the same font as the portfolio). If you buy a Söhne web licence
you can put it back: add the `@font-face` rules to `public/team/index.html`,
`public/price/index.html` and `public/price/proposal.html` and change `--font`.

## Icons and logo

The original agency's logo and app icons were removed. The app icons in `public/team/icons/`
are new, generic ones (a check mark on the accent colour). Your own logo comes from Brand &
region and appears in the apps, proposals and PDFs.
