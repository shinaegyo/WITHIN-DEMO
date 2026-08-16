/**
 * The daily nudge.
 *
 * Runs every hour on a schedule. The database decides who is due — it is their
 * chosen hour in their own timezone, they have not been reminded today, and
 * they have not played today — and this only carries the message to Expo.
 *
 * Deploy:
 *   supabase functions deploy daily-reminder
 *   supabase secrets set CRON_SECRET=<something long>
 *
 * Schedule it hourly with pg_cron or an external scheduler, sending the secret
 * as a header. It runs on the service role and can read every player's state,
 * so an open endpoint would be a way to ask who has not played today.
 */

const EXPO_URL = 'https://exp.host/--/api/v2/push/send';
/** Expo's own limit. Sending more in one request is refused. */
const CHUNK = 100;

interface Due {
  userId: string;
  tokens: string[];
  streak: number;
  title: string;
  body: string;
}

async function rpc(name: string, args: Record<string, unknown> = {}) {
  const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`${name}: ${res.status} ${await res.text()}`);
  return res.json();
}

Deno.serve(async (req) => {
  // The schedule knows the secret; nothing else should be able to run this.
  if (req.headers.get('x-cron-secret') !== Deno.env.get('CRON_SECRET')) {
    return new Response('no', { status: 401 });
  }

  const due: Due[] = await rpc('players_to_remind');
  if (due.length === 0) {
    return Response.json({ sent: 0, note: 'nobody due this hour' });
  }

  const messages = due.flatMap((d) =>
    d.tokens.map((to) => ({
      to,
      title: d.title,
      body: d.body,
      sound: 'default',
      // Opening the notification should land on the game, not the home screen.
      data: { screen: 'daily' },
      channelId: 'daily',
    })),
  );

  const dead: string[] = [];
  let sent = 0;

  for (let i = 0; i < messages.length; i += CHUNK) {
    const batch = messages.slice(i, i + CHUNK);
    const res = await fetch(EXPO_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'accept-encoding': 'gzip, deflate' },
      body: JSON.stringify(batch),
    });
    const json = await res.json();

    // Expo answers per message. A device that uninstalled comes back as
    // DeviceNotRegistered, and keeping that token means pushing into a void
    // for as long as the row survives.
    (json.data ?? []).forEach((r: any, n: number) => {
      if (r.status === 'ok') sent += 1;
      else if (r.details?.error === 'DeviceNotRegistered') dead.push(batch[n].to);
    });
  }

  // Marked whatever Expo said, because a second push is worse than none.
  await rpc('mark_reminded', { p_user_ids: due.map((d) => d.userId) });
  if (dead.length) await rpc('drop_push_tokens', { p_tokens: dead });

  return Response.json({ due: due.length, sent, dropped: dead.length });
});
