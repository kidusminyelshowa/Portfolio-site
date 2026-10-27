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
- **Client toggles are 23 px tall on a desktop.** Their tap area is larger than the drawn
  switch (an invisible margin around it), so they are easy to hit, but a tool that measures
  the element alone reports them as small. On phones every control is at least 44 px.
- **Older quotes have no week-by-week timeline.** The timeline shows only for services that
  have steps; quotes made before this update have none until you add steps and send a new link.
- **The client's timeline follows the service steps, not the pace's day count.** If the steps
  add up to more or fewer days than the quoted pace, the Price Builder says so under
  "Delivery pace"; the chart is stretched or squeezed in proportion when the client picks a
  faster or slower pace.
- **The older proposal themes keep their own colours.** "Your brand" (the default for new
  quotes) follows Settings → Brand & region; Classic, Blossom, Ember, Sage and Cobalt are still
  offered as fixed palettes.
- **Demo data uses fixed UTC+3 working hours** for its fictional activity history, so the
  Insights heatmap of the demo team looks shifted in other time zones. Real activity uses your
  time zone.
- **Website contact form leads are separate.** The portfolio's "Yes, let's talk" form still
  saves to Supabase; it does not feed Team → Sales pipeline → Leads (import those as CSV).
- **Data limits.** The Team app keeps everything in one document; that is fine for a studio
  (tens of people, thousands of tasks) but not for hundreds of staff.
