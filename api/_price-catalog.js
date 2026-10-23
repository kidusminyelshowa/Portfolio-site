/* Starting price list for the Price Builder.
   Used only until the agency saves its own list from /price → Price list
   (stored privately at pricing/catalog.json). Server-side only: never served
   to browsers except to a signed-in team member.
   EVERY PRICE HERE IS A SAMPLE (placeholder amounts in the home currency). The
   Price list page shows a "Sample prices" warning until the list is saved. */

const it = (id, label, price, desc, unitLabel) => ({ id, label, price, desc: desc || '', unitLabel: unitLabel || '' });
const cat = (id, label, items) => ({ id, label, items });

export default {
  version: 1,
  usdRate: 163.40,
  usdDiscountPct: 15,
  goodwillPct: 5,
  vatPct: 15,
  vatOn: true,          // new quotes start with VAT switched on
  validDays: 30,
  intro: "We built this estimate around the scope we discussed. It is live: switch options on or off, choose a delivery pace, and the investment updates as you go. When it feels right, send it back to us and we will take it from there.",
  samplePrices: true,       // cleared the first time the price list is saved
  /* who contracts and invoices come from: the agency's Brand & region settings
     (Team → Settings), also editable from Price list → Contracts & invoices */
  depositPct: 50,           // the usual first payment; 100 = paid in full up front
  invoiceDueDays: 7,
  invoiceNote: 'Please use the invoice number as the payment reference. Thank you for working with us.',
  /* Contract clauses. Words in {{double braces}} are filled in for each contract:
     studio, client, project, total, deposit, depositPct, balance, balancePct, paymentSchedule,
     paymentDays, startDate, days, timeline, revisions, team, country, city.
     A plain-English template, not legal advice: have a lawyer read it once. */
  contractTerms: [
    { title: 'The work', body: '{{studio}} will deliver the work listed in Schedule A (the scope) for {{project}}. Anything not listed there is outside this agreement and will be quoted separately before any work on it starts.' },
    { title: 'Timeline', body: 'Work starts on {{startDate}}, or when the first payment is received if that is later. The planned delivery time is {{days}} days ({{timeline}}). If feedback, content or approvals from the client arrive late, the delivery date moves by the same amount of time.' },
    { title: 'Revisions', body: 'The fee includes {{revisions}}. Further changes, or changes to work that was already approved, are charged separately and only after the client agrees to the cost in writing.' },
    { title: 'Fees and payment', body: 'The total fee is {{total}}. {{paymentSchedule}} Each invoice is payable within {{paymentDays}} days of its date. Work starts once the first payment is received.' },
    { title: 'What the client provides', body: 'The client provides content, information, feedback and approvals on time, names one person who can approve the work, and confirms that they hold the rights to any material they supply (logos, photos, text, music).' },
    { title: 'Ownership and portfolio', body: 'When every invoice has been paid in full, the client owns the final approved deliverables. {{studio}} keeps ownership of drafts, unused concepts and working files, and may show the finished work in its portfolio unless the client asks otherwise in writing.' },
    { title: 'Confidentiality', body: 'Both parties keep each other\'s confidential information private and use it only for this project, during and after the agreement.' },
    { title: 'Cancellation', body: 'Either party may end this agreement by written notice. The first payment is non-refundable, and the client pays for all work done up to the date of the notice. Ownership passes only for work that has been paid for.' },
    { title: 'Governing law', body: 'This agreement is governed by the laws of {{country}}. The parties will first try to settle any disagreement in good faith; if that fails, it goes to the courts of {{city}}.' },
    { title: 'Whole agreement', body: 'This agreement and Schedule A are the whole agreement between {{studio}} and {{client}}. Any change must be in writing and accepted by both parties.' }
  ],
  timeline: [
    { id: 'standard', label: 'Standard', days: 14, pct: 0 },
    { id: 'fast', label: 'Fast', days: 10, pct: 10 },
    { id: 'rush', label: 'Rush', days: 5, pct: 25 }
  ],
  revisions: [
    { id: 'r2', label: '2 revision rounds', pct: 0 },
    { id: 'r3', label: '3 revision rounds', pct: 5 },
    { id: 'r4', label: '4 revision rounds', pct: 10 },
    { id: 'unl', label: 'Unlimited revisions', pct: 25 }
  ],
  team: [
    { id: 'core', label: 'Core team', desc: '2 people: a lead and a designer', pct: 0 },
    { id: 'extended', label: 'Extended team', desc: '3 people, more hands on the work', pct: 20 },
    { id: 'full', label: 'Full team', desc: '4+ people, fastest turnaround', pct: 40 }
  ],
  complexity: [
    { id: 'standard', label: 'Standard', pct: 0 },
    { id: 'complex', label: 'Complex', pct: 15 },
    { id: 'high', label: 'High complexity', pct: 30 }
  ],
  otherFactors: [
    { id: 'intl', label: 'International client', pct: 10 },
    { id: 'weekend', label: 'Weekend / after-hours work', pct: 15 }
  ],
  costTypes: ['Production', 'Photography', 'Printing', 'Travel', 'Third-party services', 'Other'],
  sectors: ['Food & hospitality', 'Retail', 'Finance', 'Real estate', 'Health', 'Education', 'Tech',
            'NGO / development', 'Government', 'Culture & events', 'Manufacturing', 'Other'],
  projectTypes: [
    { id: 'branding', label: 'Branding', days: [21, 15, 10], categories: [
      cat('strategy', 'Brand Strategy', [
        it('strategy', 'Brand strategy', 35000, 'Research, audience and the idea the brand stands on.'),
        it('positioning', 'Brand positioning', 20000, 'Where the brand sits, and why it wins there.'),
        it('naming', 'Naming', 25000, 'Name exploration, screening and a shortlist.'),
        it('architecture', 'Brand architecture', 20000, 'How the brand, sub-brands and products relate.'),
        it('messaging', 'Brand messaging', 15000, 'Tagline, tone of voice and key messages.')
      ]),
      cat('identity', 'Visual Identity', [
        it('logo', 'Logo', 40000, 'Primary logo, secondary lock-ups and mark.'),
        it('identity', 'Visual identity system', 35000, 'The full look: layout, imagery and rules.'),
        it('type', 'Typography system', 8000, 'Typefaces and hierarchy.'),
        it('color', 'Color system', 6000, 'Palette with print and screen values.'),
        it('graphics', 'Graphic elements', 15000, 'Patterns, shapes and the brand’s visual language.'),
        it('icons', 'Iconography', 12000, 'A custom icon set.', 'sets'),
        it('guidelines', 'Brand guidelines', 20000, 'A clear book so anyone can use the brand well.')
      ]),
      cat('collaterals', 'Collaterals', [
        it('card', 'Business card', 3000, 'Design and print-ready files.'),
        it('letterhead', 'Letterhead', 2500, 'Letterhead and document template.'),
        it('menu', 'Menu', 12000, 'Menu design, ready for print.'),
        it('packaging', 'Packaging', 30000, 'Packaging design for the core product.'),
        it('signage', 'Signage', 15000, 'Storefront and wayfinding signage.'),
        it('uniform', 'Uniform', 8000, 'Staff uniform and apparel.'),
        it('social', 'Social media templates', 12000, 'Post and story templates in the new identity.')
      ])
    ]},
    { id: 'refresh', label: 'Brand Refresh', days: [14, 10, 7], categories: [
      cat('audit', 'Brand Audit', [
        it('audit', 'Brand audit', 15000, 'What works, what doesn’t, and what to keep.'),
        it('competitors', 'Competitor review', 10000, 'How the category looks and speaks.')
      ]),
      cat('refresh', 'Refresh', [
        it('logo', 'Logo refinement', 20000, 'A sharper, more usable version of the logo.'),
        it('identity', 'Visual identity refresh', 25000, 'Updated palette, type and graphic language.'),
        it('guidelines', 'Updated guidelines', 12000, 'The refreshed rules in one document.')
      ]),
      cat('rollout', 'Rollout', [
        it('collateral', 'Collateral updates', 3000, 'Existing materials brought into the refresh.', 'items'),
        it('social', 'Social media templates', 12000, 'Post and story templates.')
      ])
    ]},
    { id: 'campaign', label: 'Campaign', days: [21, 14, 7], categories: [
      cat('strategy', 'Campaign Strategy', [
        it('strategy', 'Campaign strategy', 25000, 'Audience, message and channel plan.'),
        it('concept', 'Creative concept', 30000, 'The big idea, shown in key executions.'),
        it('copy', 'Key message & copywriting', 15000, 'Headlines and body copy across the campaign.')
      ]),
      cat('visuals', 'Key Visuals', [
        it('kv', 'Key visual', 20000, 'The master artwork for the campaign.'),
        it('adapt', 'Adaptations', 2500, 'The key visual resized for each format.', 'sizes')
      ]),
      cat('channels', 'Channels', [
        it('posts', 'Social media posts', 3000, 'Designed posts for the launch.', 'posts'),
        it('ooh', 'Billboard / outdoor', 10000, 'Outdoor and billboard artwork.'),
        it('print', 'Print ad', 6000, 'Newspaper and magazine ads.'),
        it('radio', 'Radio script', 8000, 'Script for a radio spot.'),
        it('tv', 'TV / video script', 12000, 'Script and direction for a film.')
      ]),
      cat('launch', 'Launch', [
        it('event', 'Launch event concept', 20000, 'Concept and look for a launch event.')
      ])
    ]},
    { id: 'social', label: 'Social Media', days: [14, 10, 5], categories: [
      cat('strategy', 'Strategy', [
        it('strategy', 'Social media strategy', 15000, 'Pillars, tone and a posting rhythm.'),
        it('calendar', 'Content calendar', 6000, 'A planned month of content.', 'months')
      ]),
      cat('content', 'Content', [
        it('static', 'Static posts', 2500, 'Designed single-image posts.', 'posts'),
        it('carousel', 'Carousels', 4000, 'Multi-slide posts.', 'carousels'),
        it('reel', 'Reels / short videos', 8000, 'Short vertical videos.', 'videos'),
        it('stories', 'Story sets', 2000, 'Sets of stories.', 'sets')
      ]),
      cat('management', 'Management', [
        it('community', 'Community management', 20000, 'Replies, moderation and posting.', 'months'),
        it('report', 'Monthly report', 4000, 'What worked, and what to do next.', 'months')
      ])
    ]},
    { id: 'website', label: 'Website', days: [42, 30, 21], categories: [
      cat('planning', 'Planning', [
        it('discovery', 'Discovery & sitemap', 15000, 'Goals, audience and the site structure.'),
        it('wireframes', 'Wireframes', 4000, 'Page layouts before design.', 'pages')
      ]),
      cat('design', 'Design', [
        it('pages', 'Page design', 8000, 'Designed pages for desktop.', 'pages'),
        it('mobile', 'Mobile design', 10000, 'Every page designed for phones.')
      ]),
      cat('build', 'Build', [
        it('dev', 'Development', 10000, 'Built, responsive pages.', 'pages'),
        it('cms', 'Content management setup', 25000, 'So your team can update the site.'),
        it('copy', 'Copywriting', 3000, 'Written content for the site.', 'pages')
      ]),
      cat('launch', 'Launch', [
        it('hosting', 'Domain & hosting setup', 5000, 'Connected, secured and live.'),
        it('seo', 'SEO basics', 8000, 'Titles, descriptions and search setup.')
      ])
    ]},
    { id: 'video', label: 'Video', days: [21, 14, 10], categories: [
      cat('pre', 'Pre-production', [
        it('script', 'Concept & script', 15000, 'The idea, written for film.'),
        it('storyboard', 'Storyboard', 10000, 'Shot-by-shot plan.'),
        it('casting', 'Casting & locations', 10000, 'Finding the people and places.')
      ]),
      cat('production', 'Production', [
        it('shoot', 'Shoot days', 45000, 'Crew and camera for a day.', 'days'),
        it('drone', 'Drone footage', 15000, 'Aerial shots.')
      ]),
      cat('post', 'Post-production', [
        it('edit', 'Editing', 10000, 'Edit of the final film.', 'minutes'),
        it('motion', 'Motion graphics', 20000, 'Animated titles and graphics.'),
        it('grade', 'Color grading', 8000, 'The final look.'),
        it('sound', 'Sound design & music', 8000, 'Mix, effects and licensed music.'),
        it('subs', 'Subtitles', 3000, 'Subtitles in one language.', 'languages')
      ])
    ]},
    { id: 'photography', label: 'Photography', days: [10, 7, 4], categories: [
      cat('planning', 'Planning', [
        it('direction', 'Art direction & shot list', 8000, 'The look and every shot planned.')
      ]),
      cat('shoot', 'Shoot', [
        it('half', 'Half-day shoot', 25000, 'Photographer and assistant, 4 hours.'),
        it('full', 'Full-day shoot', 40000, 'Photographer and assistant, 8 hours.', 'days'),
        it('studio', 'Studio rental', 10000, 'A day in the studio.', 'days'),
        it('styling', 'Styling', 8000, 'Food, product or wardrobe styling.')
      ]),
      cat('post', 'Post-production', [
        it('retouch', 'Retouched images', 800, 'Final edited images.', 'images')
      ])
    ]},
    { id: 'packaging', label: 'Packaging', days: [21, 15, 10], categories: [
      cat('strategy', 'Strategy', [
        it('strategy', 'Packaging strategy', 15000, 'Shelf, audience and range structure.')
      ]),
      cat('design', 'Design', [
        it('primary', 'Primary packaging design', 30000, 'The main pack, designed.'),
        it('label', 'Label design', 12000, 'Label design for one product.'),
        it('variants', 'Variant adaptations', 5000, 'Flavours, sizes or SKUs.', 'SKUs'),
        it('dieline', 'Dielines & print files', 6000, 'Production-ready artwork.')
      ]),
      cat('mockups', 'Presentation', [
        it('mockups', '3D mockups', 8000, 'Realistic renders of the packs.')
      ])
    ]},
    { id: 'print', label: 'Print', days: [10, 7, 4], categories: [
      cat('design', 'Design', [
        it('brochure', 'Brochure', 2500, 'Brochure layout.', 'pages'),
        it('flyer', 'Flyer', 4000, 'Single flyer, both sides.'),
        it('poster', 'Poster', 5000, 'Poster artwork.'),
        it('catalogue', 'Catalogue', 2000, 'Catalogue layout.', 'pages'),
        it('annual', 'Annual report', 3000, 'Annual report layout.', 'pages')
      ]),
      cat('prep', 'Production', [
        it('prepress', 'Print-ready files & proofing', 3000, 'Checked files and a proof with the printer.')
      ])
    ]},
    { id: 'retainer', label: 'Marketing / Retainer', days: [30, 30, 30], categories: [
      cat('retainer', 'Monthly Retainer', [
        it('brand', 'Brand management', 60000, 'A dedicated team looking after the brand.', 'months'),
        it('hours', 'Design hours (block of 10)', 15000, 'Flexible design time.', 'blocks'),
        it('social', 'Social media', 45000, 'Content and community every month.', 'months'),
        it('strategy', 'Strategy sessions', 10000, 'A working session with our strategists.', 'sessions')
      ]),
      cat('reporting', 'Reporting', [
        it('report', 'Monthly report', 5000, 'Results and next steps.', 'months')
      ])
    ]},
    // benchmark: the Blue Oven & Antachia growth partnership (Sept 2026), priced per month
    { id: 'growth', label: 'Growth Partnership', days: [180, 180, 180], categories: [
      cat('core', 'Monthly retainer · core', [
        it('strategy', 'Monthly strategy & planning', 22000, 'Each month starts with one question: what does the business need to move forward right now?', 'months'),
        it('direction', 'Creative direction', 20000, 'One creative standard held across every brand and platform.', 'months'),
        it('content', 'Content production', 40000, 'Content made and published for every brand, every week.', 'months'),
        it('community', 'Social media community management', 16000, 'Replies, moderation and conversations that build a following.', 'months'),
        it('reporting', 'Monthly reporting & review', 8000, 'Priority → execution → results → next priority.', 'months')
      ]),
      cat('production', 'Production & design', [
        it('photovideo', 'Photography & video for social media', 30000, 'Photo and video made for the feed.', 'months'),
        it('design', 'Design & campaign work', 14000, 'Campaign visuals and everyday design.', 'months'),
        it('print', 'Printable designs', 5000, 'Flyers, posters and print-ready files.', 'months'),
        it('cafe', 'Cafe essential designs', 5000, 'The everyday materials a cafe needs.', 'months'),
        it('holiday', 'Holiday campaigns', 8000, 'Campaigns for the holidays that matter to the brand.', 'months'),
        it('packaging', 'Packaging refresh support', 6000, 'Updates to packaging as the range grows.', 'months'),
        it('menu', 'Menu & in-store signage updates', 5000, 'Menus and signage kept current.', 'months'),
        it('seasonal', 'Seasonal & brand-specific materials', 7000, 'Materials as new moments arise.', 'months')
      ])
    ]},
    { id: 'custom', label: 'Custom', days: [14, 10, 5], categories: [] }
  ]
};
