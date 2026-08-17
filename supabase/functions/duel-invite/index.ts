/**
 * "Someone is up for a duel."
 *
 * Called by the app immediately after a player joins the duel queue. Unlike the
 * daily reminder this is not on a schedule - it is an invitation about somebody
 * else's timing, and it is only worth anything in the minute it is sent.
 *
 * Deploy:
 *   supabase functions deploy duel-invite
 *
 * Invoked by the player themselves rather than by a cron, so it authenticates
 * as them: the caller's token identifies who is waiting, and the function
 * refuses if the database does not agree they are actually in the queue. That
 * check is the whole security model here - without it, anybody could make the
 * app tell twenty strangers that somebody is waiting when nobody is.
 *
 * Who receives it is decided by duel_invitees, which is deliberately mean about
 * it: opted in, has finished a duel before, not already in one, one a day at
 * most, daylight hours in their own timezone.
 */

const EXPO_URL = 'https://exp.host/--/api/v2/push/send';
const CHUNK = 100;

interface Invitee {
  userId: string;
  tokens: string[];
  title: string;
  body: string;
}

const SERVICE = () => Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

async function rpc(name: string, args: Record<string, unknown> = {}) {
  const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: SERVICE(),
      Authorization: `Bearer ${SERVICE()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`${name}: ${res.status} ${await res.text()}`);
  return res.json();
}

/** Who is calling, according to their own token rather than their claim. */
async function callerId(req: Request): Promise<string | null> {
  const auth = req.headers.get('Authorization');
  if (!auth) return null;
  const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/auth/v1/user`, {
    headers: { apikey: Deno.env.get('SUPABASE_ANON_KEY')!, Authorization: auth },
  });
  if (!res.ok) return null;
  const user = await res.json();
  return user?.id ?? null;
}

Deno.serve(async (req) => {
  const uid = await callerId(req);
  if (!uid) return new Response('no', { status: 401 });

  // The database decides whether they are really waiting. A caller who has not
  // joined the queue cannot summon anybody.
  const queued = await rpc('is_queued', { p_uid: uid });
  if (queued !== true) {
    return Response.json({ sent: 0, note: 'not waiting' });
  }

  const invitees: Invitee[] = await rpc('duel_invitees', { p_waiting: uid });
  if (invitees.length === 0) {
    return Response.json({ sent: 0, note: 'nobody to invite' });
  }

  const messages = invitees.flatMap((i) =>
    i.tokens.map((to) => ({
      to,
      title: i.title,
      body: i.body,
      sound: 'default',
      // Straight to the duels screen, where the button is.
      data: { screen: 'duels' },
      channelId: 'duels',
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
    (json.data ?? []).forEach((r: any, n: number) => {
      if (r.status === 'ok') sent += 1;
      else if (r.details?.error === 'DeviceNotRegistered') dead.push(batch[n].to);
    });
  }

  await rpc('mark_duel_pinged', { p_user_ids: invitees.map((i) => i.userId) });
  if (dead.length) await rpc('drop_push_tokens', { p_tokens: dead });

  return Response.json({ invited: invitees.length, sent, dropped: dead.length });
});
