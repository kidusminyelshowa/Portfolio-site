# UX audit (Phase 1)

How it was done: a fresh local install (`STORAGE=local`), first with no data, then with the
fictional demo team, one creative partner and one sent proposal. Every screen was captured at
1440×900 and 375×812 for the admin, a manager (Hanna), a team member (Samuel), a creative partner
(Dawit), the Price Builder and the client proposal page: 182 screenshots. Contrast was measured
from the CSS colours; tap targets and keyboard focus were measured in the browser.

The suite already looks good. Most problems are about **who it is for**: it assumes a studio
with a team, while the owner of this site is a freelancer. The rest are consistency, white-label
and phone issues.

Ranks: **H** high, **M** medium, **L** low.

## 1. First run

| # | Rank | Screen | Issue |
| --- | --- | --- | --- |
| 1.1 | H | Team → Dashboard (new install) | After setup the dashboard is a wall of empty team charts ("Nobody to show", "Employee of the month: not decided yet"). Nothing says what to do first: company details, prices, first proposal. |
| 1.2 | H | Everywhere | Built for a team of 5–50. A freelancer working alone sees a team strip, employee of the month, leaderboards, team reviews, leave requests, approvals and team messages that never apply. |
| 1.3 | M | Team → Settings | Brand & region sits among department, track and skills editors (89 controls on one page). The thing a new owner needs first is not obviously first. |
| 1.4 | M | Price Builder → Dashboard | With no quotes the list is empty with no button inside it; the "Create new quote" button is in the header. |
| 1.5 | L | Sign-in pages | The app is called "Team" in the tab title and home-screen name even when a brand name is set. |

## 2. Consistency

| # | Rank | Screen | Issue |
| --- | --- | --- | --- |
| 2.1 | H | Price Builder vs Team | Two different visual systems: Team is cool grey + orange/black/lime; the Price Builder is warm beige + pure red (`#F10103`) + plum + teal. Moving between them feels like two products. |
| 2.2 | M | All | Colours are defined three times (team `index.html`, price `index.html`, `proposal.html`) with different names for the same idea (`--mute` is three different greys). |
| 2.3 | M | Price Builder | "Delete" is a red pill on every quote row, as loud as the main action. |
| 2.4 | L | Status colours | To do / in progress / blocked / handed in / done are consistent in Team (grey / black / red / yellow / lime) but "Handed in on time" uses green text on pale green (2.9:1). |

## 3. Clarity and wording

| # | Rank | Screen | Issue |
| --- | --- | --- | --- |
| 3.1 | M | Dashboard | "Ask Claude about the studio", "the studio's Spotify playlist", "Phone notifications are not switched on for the studio": studio wording where the brand name or "you" fits. |
| 3.2 | M | Sales pipeline | One chart label says "scale up to … ETB" even when the currency is USD (hard-coded). |
| 3.3 | L | Dashboard | "Q1 2026/27" quarter labels are clear to the Ethiopian review year but odd for a calendar year; they follow the preset already, so only wording. |

## 4. States

| # | Rank | Screen | Issue |
| --- | --- | --- | --- |
| 4.1 | M | Lists (pipeline, projects, people, goals, milestones, leads, quotes) | Empty states explain but most have no button to do the next thing. |
| 4.2 | L | Loading | Pages show "Loading…" text; fine, nothing jumps badly. |
| 4.3 | OK | Delete | Deletes ask for confirmation. |
| 4.4 | OK | Errors | Errors show as toasts or inline notes with a reason (storage errors now name the fix). |

## 5. Phone (375 px)

| # | Rank | Screen | Issue |
| --- | --- | --- | --- |
| 5.1 | H | Price Builder → Contract | Page scrolls sideways by 48 px. |
| 5.2 | M | Price Builder → Price list | Page scrolls sideways by 4 px. |
| 5.3 | M | All | Many buttons are 32–37 px tall (target: 44 px on touch screens). Proposal switches are 23 px. |
| 5.4 | M | Team → Dashboard | 6,000 px long for an admin: every card stacks. |
| 5.5 | OK | Team | Bottom tab bar with "More" sheet, tables become cards, no sideways scrolling. |

## 6. Accessibility

| # | Rank | Where | Issue |
| --- | --- | --- | --- |
| 6.1 | H | Team | Secondary text `#8F8F8A` on the page is 2.85:1 (needs 4.5:1); on cards 3.25:1. |
| 6.2 | H | Team | White text on the default orange `#F2541B` is 3.47:1 (pipeline card, buttons). A brand colour chosen in Settings can be worse: text colour does not adapt. |
| 6.3 | M | Price Builder | Secondary text `#8B7E77` is 3.35:1; white on red buttons 4.42:1. |
| 6.4 | M | Price Builder | No `prefers-reduced-motion` rule and no custom focus ring (browser default only). |
| 6.5 | OK | All | Keyboard focus is visible on all tab stops tested; icon buttons have labels. |

## 7. White-label

| # | Rank | Where | Issue |
| --- | --- | --- | --- |
| 7.1 | H | Client proposal | The brand colour does not reach the proposal page: it only offers five fixed palettes. |
| 7.2 | M | Price Builder | Only the main button follows the brand colour; the rest is a fixed red/plum palette. |
| 7.3 | OK | PDFs, names, logo, emails | Come from Brand & region. |

## 8. Speed

| # | Rank | Where | Issue |
| --- | --- | --- | --- |
| 8.1 | L | All | One Google font, no big images; pages are light. Nothing to fix. |

## Fonts

The font is **Figtree** (SIL Open Font License, full character set, reselling allowed). The
cut-down commercial font from the original was never copied. No change needed.
