# UX plan (Phase 2)

## Direction

"Look I want" was left blank, so the current Team look stays (calm grey page, white cards, one
brand accent, black for secondary emphasis, lime for wins) and everything else is made to match
it. Two new principles:

1. **Solo first, team ready.** The owner is a freelancer. A new **"Just me"** mode (Settings →
   Brand & region, on by default while you are the only person) hides what only makes sense with
   staff and words the rest for one person. Nothing is deleted: switching it off brings every
   team screen back, and creative partners (freelancers you hire) work in both modes.
2. **Your brand everywhere.** One accent colour from Settings colours the Team app, the Price
   Builder, the client proposal and the PDFs, and text on it switches between white and black so
   it stays readable whatever colour you choose.

## Design system (one file: `public/suite.css`)

| Token | Value | Use |
| --- | --- | --- |
| `--accent` | brand accent (default `#F2541B`) | main buttons, highlights, charts series 1 |
| `--on-accent` | white or near-black, picked for contrast | text on the accent |
| `--accent-soft` | accent mixed 14% into white | selected rows, chips |
| `--highlight` | brand highlight (default lime `#C8F23C`) | "done", wins |
| `--ink` / `--ink-2` / `--mute` | `#141414` / `#5E5E5A` / `#6B6B66` | text; `--mute` now passes 4.5:1 |
| `--page` / `--card` / `--soft` / `--line` | `#F0F0EE` / `#FFFFFF` / `#F5F5F3` / `#EAEAE7` | surfaces |
| status | to do `#EFEFEC`, in progress `#141414`, blocked `#E5372B`, handed in `#F6C445`, done = highlight | task states everywhere |
| `--ok` / `--warn` / `--bad` | `#157238` / `#8A5F00` / `#C42B20` | messages; all ≥4.5:1 on their soft backgrounds |
| type scale | 12 · 13.5 · 15 · 18 · 22 · 28 · 40 px | |
| spacing | 4 · 8 · 12 · 16 · 20 · 24 · 32 px | |
| radius | 10 (inputs) · 16 (cards) · 24 (panels) · 999 (pills) | |
| shadow | `0 1px 2px rgb(20 20 20/.03), 0 8px 24px rgb(20 20 20/.04)` | cards |
| focus | 2px accent ring with 2px offset | every control |
| touch | controls at least 44 px tall on touch screens | phones |
| motion | animations off with "reduce motion" | |

Buttons: primary (accent), secondary (black), ghost (outline), danger (only red on hover/focus
and in confirm dialogs). Inputs: soft fill, 10 px radius, accent focus ring. Chips: pill, soft
fill. Tables: become cards under 640 px (already so in Team). Dialogs: centred on desktop,
bottom sheet on phones (already so).

## Fixes, in order

1. **Shared tokens** in `public/suite.css`, loaded by Team, Price Builder and proposal; each
   page maps its old variable names onto them so no screen is rewritten. (2.1, 2.2, 6.1–6.4, 7.2)
2. **Brand reaches everything:** `--on-accent` picked automatically; the Price Builder uses the
   Team neutrals and the brand accent; the client proposal gets a new default theme **"Your
   brand"** built from the brand colours (the five palettes stay as options). (6.2, 7.1, 7.2)
3. **"Just me" mode.** Hides from navigation and the dashboard: team overview, people reviews,
   team goals, leave requests, approvals, team messages, reports, insights, employee of the month,
   leaderboard, the team strip, career path, skills, reviews and leave. Keeps: dashboard, tasks,
   projects, timeline, sales pipeline and leads, goals and milestones (as personal targets),
   music, settings, and **People** (renamed "Partners") for creative partners. Wording switches
   from "the team / the studio" to "you" or the brand name. (1.2)
4. **First-run checklist** on the admin dashboard: Add your business details → Set your prices →
   Send your first proposal → (team mode) Add your team / (solo) Add a creative partner,
   optional. Each step links to the screen; the card disappears when done or dismissed. (1.1)
5. **Empty states with a next button** on pipeline, projects, tasks, people, goals, milestones,
   leads and the Price Builder quote list. (1.4, 4.1)
6. **Phone:** fix the contract editor and price list sideways scroll; 44 px touch targets;
   bigger proposal switches; in solo mode the dashboard loses the team cards, so it is much
   shorter. (5.1–5.4)
7. **Quieter delete** in the Price Builder list. (2.3)
8. **Wording:** "studio" lines, the hard-coded "ETB" in the pipeline chart, and the app name
   ("Team" → your brand name, "Workspace" when solo). (3.1, 3.2, 1.5)
9. **Settings order:** Brand & region and "Just me" first; departments, tracks and skills
   further down under "Team structure". (1.3)

Not changed: features, permissions, API actions, data fields (one optional field, `solo`, is
added to Brand & region), the proposal's five palettes, the task board layout and charts.

## Mockups

Instead of drawings, the before/after comparison uses screenshots of the real build of the four
most-used screens (dashboard, task board, Price Builder, client proposal), taken at 1440 and 375
px. They are in `docs/suite/ux-shots/`. Nothing is merged until the owner approves.
