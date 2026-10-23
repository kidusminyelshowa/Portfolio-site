# Known issues and limits

- **Hourly reminders on Vercel Hobby.** Hobby only allows daily jobs, so due-date reminders
  run only when self-hosting, on Vercel Pro, or from an outside scheduler (see OPERATIONS).
- **Change the region before quoting.** Amounts are stored as plain numbers in the home
  currency. Switching the currency (for example ETB → USD) relabels existing quotes, contracts
  and invoices; it does not convert them.
- **Sign-in needs HTTPS when self-hosting.** Cookies are marked Secure; browsers keep them only
  on `https://` or `localhost`. Behind plain `http://` on a LAN address, sign-in seems to work
  but you stay signed out.
- **PDFs need internet.** The PDF maker (jsPDF 2.5.2) loads from a CDN the first time someone
  downloads a PDF, with an integrity check. Offline, the download shows "Could not load the PDF
  maker".
- **The Price Builder password has no change screen** (inherited). See OPERATIONS.
- **Phone layout, Price Builder:** on a 375 px wide screen the price list ("Delete this project
  type" button, 4 px) and the contract editor (about 50 px) are slightly wider than the screen
  and scroll sideways. The client proposal page and the Team app fit. Left as is because the
  rule for this port was not to redesign; it is on the list for the UI pass.
- **Theme colours of client proposals** are fixed palettes (Classic, Blossom, Ember, Sage,
  Cobalt). Your brand accent colours the Team app, the Price Builder buttons and the PDFs,
  not the proposal themes.
- **Demo data uses fixed UTC+3 working hours** for its fictional activity history, so the
  Insights heatmap of the demo team looks shifted in other time zones. Real activity uses your
  time zone.
- **Website contact form leads are separate.** The portfolio's "Yes, let's talk" form still
  saves to Supabase; it does not feed Team → Sales pipeline → Leads (import those as CSV).
- **Data limits.** The Team app keeps everything in one document; that is fine for a studio
  (tens of people, thousands of tasks) but not for hundreds of staff.
