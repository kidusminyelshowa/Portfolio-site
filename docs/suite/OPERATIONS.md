# Running it

## Backups

- **Vercel:** the data is in the two Blob stores. Download the private store now and then
  (Vercel → Storage → the store → Browse, or `vercel blob` with the CLI). The public store only
  holds photos and the logo.
- **Self-hosting:** copy the `STORAGE_DIR` folder (default `./data`, or the `suite-data`
  Docker volume). Stop the server or copy twice if you want a perfectly consistent copy.

## Passwords

- **A team member forgot theirs:** an admin opens Settings → Accounts → Edit next to the person
  and types a new password. They are reminded to choose their own after signing in.
- **Change your own:** your profile (top right) → Change password.
- **Price Builder password:** it starts as the password you chose at setup. There is no screen
  to change it in this version (as in the original). To change it, sign in to `/price` and run
  this in the browser console:
  `fetch('/api/price-auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'change',password:'OLD',newPassword:'NEW'})}).then(r=>r.json()).then(console.log)`
- **Lost the Price Builder password:** delete `config/auth.json` from the private store (or
  data folder), then set a new one with the setup key:
  `curl -X POST https://<domain>/api/price-auth -H 'Content-Type: application/json' -d '{"action":"setup","password":"NEW-PASSWORD","setupToken":"<SETUP_TOKEN>"}'`
- **Lost every admin account:** with the server stopped, remove the `users` entries from
  `team/db.json` (keep a copy first). `/team` then shows Set up again (setup key needed).

## Turning setup off

After your first admin exists, setup is refused anyway. You can also delete `SETUP_TOKEN`
from the environment: setup then always answers "The setup key is wrong, or SETUP_TOKEN is not
set on the server."

## Moving between Vercel and self-hosting

The documents are the same in both. Copy every file from the private store into
`<STORAGE_DIR>/private/<same path>`, and the public store into `<STORAGE_DIR>/public/`.
Photo and logo links stored inside the documents point at the old store, so either keep that
store or upload them again.

## Cron jobs

`/api/cron?run=morning|evening|hourly` with the header `Authorization: Bearer <CRON_SECRET>`.
Vercel calls morning and evening itself (see `vercel.json`). `server.js` calls all three. Any
outside scheduler (cron-job.org, GitHub Actions) can call the hourly one on Vercel Hobby if you
want the reminders there.

## Push notifications

Need `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`. Without them everything still works and
notifications appear in the app's bell, just not on the phone's lock screen. Each person turns
them on in their profile on each device.
