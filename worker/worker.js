// GET /?u=<username or snapchat link>  ->  {user, name, avatar, snaps:[{id,t,video,media,preview,overlay}]}
// Snapchat profile pages have no CORS, so the browser asks here; the media itself (sc-cdn) is CORS-open.
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const H = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
const out = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: H });

function target(s) {
  s = (s || '').trim();
  let m = s.match(/snapchat\.com\/(?:add\/|@)([A-Za-z0-9._-]+)/);
  if (m) return `https://www.snapchat.com/@${m[1]}`;
  m = s.match(/snapchat\.com\/t\/[A-Za-z0-9]+/);           // short share links
  if (m) return 'https://www.' + m[0].replace(/^www\./, '');
  m = s.replace(/^@/, '').match(/^[A-Za-z0-9._-]{2,40}$/);
  return m ? `https://www.snapchat.com/@${m[0]}` : null;
}

export default {
  async fetch(req) {
    const url = target(new URL(req.url).searchParams.get('u'));
    if (!url) return out({ error: 'bad' }, 400);
    const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'ar,en' }, redirect: 'follow' });
    if (r.status === 404) return out({ error: 'notfound' }, 404);
    const html = await r.text();
    const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    if (!m) return out({ error: 'blocked', status: r.status }, 502);
    const pp = JSON.parse(m[1]).props.pageProps;
    const p = pp.userProfile?.publicProfileInfo || pp.userProfile?.userInfo || {};
    if (!p.username) return out({ error: 'notfound' }, 404);
    const v = x => (x && typeof x === 'object' ? x.value : x) || '';
    const snaps = (pp.story?.snapList || []).map(s => ({
      id: s.snapId.value, t: +s.timestampInSec.value, video: s.snapMediaType === 1,
      media: s.snapUrls.mediaUrl, preview: v(s.snapUrls.mediaPreviewUrl), overlay: v(s.snapUrls.overlayUrl),
    }));
    return out({ user: p.username, name: p.title || p.displayName || '', avatar: p.profilePictureUrl || '', snaps });
  },
};
