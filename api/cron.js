/* Daily runs for the Team app (vercel.json → crons):
   morning: tasks due today, scheduled messages, work anniversaries
   evening: clean-sweep achievements; on Fridays, zero-overdue weeks
   hourly: due-date reminders (a day before, on the day, 6 h and 2 h before) */
import { json } from './_lib.js';
import { mutate } from './_team-lib.js';
import { morningRun, eveningRun, reminderRun } from './_team-notify.js';
import { sendPush } from './_push.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const secret = process.env.CRON_SECRET || '';
  if (!secret || req.headers.authorization !== 'Bearer ' + secret) return json(res, 401, { error: 'Not allowed' });
  const asked = new URL(req.url, 'http://x').searchParams.get('run');
  const run = ['evening', 'hourly'].includes(asked) ? asked : 'morning';
  try {
    const { result, db, outbox } = await mutate(async d => (run === 'evening' ? eveningRun(d) : run === 'hourly' ? reminderRun(d) : morningRun(d)));
    const dead = await sendPush(db, outbox);
    if (dead.length) await mutate(async d => { d.pushSubs = (d.pushSubs || []).filter(s => !dead.includes(s.endpoint)); });
    return json(res, 200, { ok: true, run, ...result, pushes: outbox.length });
  } catch (e) {
    return json(res, 500, { error: String(e && e.message || e) });
  }
}
