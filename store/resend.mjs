// 799 News in Resend: one topic ("799 News", so unsubscribing never touches the account's other lists)
// and one segment per store (live / test). Vars: NEWS_TOPIC, NEWS_SEGMENT. Secret: RESEND_API_KEY
// (Full access: contacts need it). Shared by the store Worker and Pitwall.
const API = 'https://api.resend.com';
const enc = encodeURIComponent;
function call(env, fetchFn, method, path, body) {
  return fetchFn(API + path, { method, headers: { Authorization: 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
    .catch(e => ({ ok: false, status: 0, json: async () => ({ message: String(e?.message || e) }) }));
}
export const newsReady = env => !!(env.RESEND_API_KEY && env.NEWS_TOPIC && env.NEWS_SEGMENT);

// Put the person on (subscribed = true) or take them off (false) 799 News. Returns true when Resend agreed.
export async function syncNews(env, fetchFn, { email, firstName = '', lastName = '', subscribed }) {
  if (!newsReady(env)) return false;
  const subscription = subscribed ? 'opt_in' : 'opt_out';
  if (subscribed) {
    const created = await call(env, fetchFn, 'POST', '/contacts', { email, first_name: firstName || undefined, last_name: lastName || undefined,
      segments: [{ id: env.NEWS_SEGMENT }], topics: [{ id: env.NEWS_TOPIC, subscription }] });
    if (created.ok) return true;
    const seg = await call(env, fetchFn, 'POST', '/contacts/' + enc(email) + '/segments/' + enc(env.NEWS_SEGMENT));
    const top = await call(env, fetchFn, 'PATCH', '/contacts/' + enc(email) + '/topics', [{ id: env.NEWS_TOPIC, subscription }]);
    return (seg.ok || seg.status === 409 || seg.status === 422) && top.ok;
  }
  const top = await call(env, fetchFn, 'PATCH', '/contacts/' + enc(email) + '/topics', [{ id: env.NEWS_TOPIC, subscription }]);
  return top.ok || top.status === 404; // not in Resend at all = nothing to unsubscribe
}

// 'opt_out' if they unsubscribed in Resend (from 799 News or from everything), 'opt_in', or null if unknown.
export async function newsStatus(env, fetchFn, email) {
  if (!newsReady(env)) return null;
  const c = await call(env, fetchFn, 'GET', '/contacts/' + enc(email));
  if (c.status === 404) return null;
  if (!c.ok) return null;
  const contact = await c.json().catch(() => ({}));
  if (contact.unsubscribed) return 'opt_out';
  const t = await call(env, fetchFn, 'GET', '/contacts/' + enc(email) + '/topics');
  if (!t.ok) return null;
  const list = (await t.json().catch(() => ({}))).data || [];
  const mine = list.find(x => x.id === env.NEWS_TOPIC);
  return mine?.subscription === 'opt_out' ? 'opt_out' : 'opt_in';
}
