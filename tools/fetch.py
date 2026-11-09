#!/usr/bin/env python3
"""Archive public Snapchat stories for every campaign whose window is open.

campaigns.json: [{slug, title, client, from, to, handles:[...]}], from/to are ISO times (+03:00).
Writes campaigns/<slug>/snaps.json + media files. Only snaps posted inside [from, to] are kept.
Stories live 24h, so this must run at least every few hours while a campaign is open.
"""
import json, os, re, sys, time, urllib.request
from datetime import datetime, timezone, timedelta

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'
GRACE = timedelta(hours=3)  # keep polling a bit after `to` in case a run was delayed


def handle_of(s):
    """'@x', 'x', 'snapchat.com/add/x', 'snapchat.com/@x?..' -> 'x'. Short /t/ links stay as URLs."""
    s = s.strip()
    m = re.search(r'snapchat\.com/(?:add/|@)([A-Za-z0-9._-]+)', s)
    if m: return m.group(1).lower()
    if '/' in s: return s
    return s.lstrip('@').lower()


def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=40) as r:
        return r.read()


def story(handle):
    """-> (username, [snap dicts]) for the profile's current public story."""
    url = handle if handle.startswith('http') else f'https://www.snapchat.com/@{handle}'
    html = get(url).decode('utf-8', 'replace')
    m = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', html, re.S)
    if not m: raise RuntimeError('no page data (private or missing account?)')
    pp = json.loads(m.group(1))['props']['pageProps']
    prof = (pp.get('userProfile') or {})
    user = (prof.get('publicProfileInfo') or prof.get('userInfo') or {}).get('username') or handle
    return user, ((pp.get('story') or {}).get('snapList') or [])


def link(a): return a.get('value', '') if isinstance(a, dict) else (a or '')


def ts(s): return datetime.fromisoformat(s).astimezone(timezone.utc)


def run_campaign(c, now):
    lo, hi = ts(c['from']), ts(c['to'])
    if now < lo or now > hi + GRACE: return 0
    d = os.path.join(ROOT, 'campaigns', c['slug'])
    os.makedirs(d, exist_ok=True)
    path = os.path.join(d, 'snaps.json')
    data = json.load(open(path)) if os.path.exists(path) else {'snaps': [], 'checks': {}}
    have = {s['id'] for s in data['snaps']}
    added = 0
    for raw in c['handles']:
        h = handle_of(raw)
        try:
            user, snaps = story(h)
        except Exception as e:
            data['checks'][h] = {'at': now.isoformat(), 'error': str(e)[:200]}
            print(f'  {h}: ERROR {e}'); continue
        new = 0
        for s in snaps:
            sid = s['snapId']['value']
            t = datetime.fromtimestamp(int(s['timestampInSec']['value']), timezone.utc)
            if sid in have or not (lo <= t <= hi): continue
            u = s['snapUrls']
            ext = 'mp4' if s.get('snapMediaType') == 1 else 'jpg'
            base = f'{user}/{int(t.timestamp())}_{sid[:12]}'
            os.makedirs(os.path.join(d, user), exist_ok=True)
            try:
                open(os.path.join(d, f'{base}.{ext}'), 'wb').write(get(u['mediaUrl']))
                prev = (u.get('mediaPreviewUrl') or {}).get('value')
                if prev: open(os.path.join(d, f'{base}_p.jpg'), 'wb').write(get(prev))
                if u.get('overlayUrl'): open(os.path.join(d, f'{base}_o.png'), 'wb').write(get(u['overlayUrl']))
            except Exception as e:
                print(f'  {user}/{sid}: download failed {e}'); continue
            data['snaps'].append({'id': sid, 'user': user, 't': int(t.timestamp()), 'f': f'{base}.{ext}',
                                  'p': f'{base}_p.jpg' if prev else '', 'o': f'{base}_o.png' if u.get('overlayUrl') else '',
                                  'link': link(u.get('attachmentUrl')),
                                  'saved': int(now.timestamp())})
            have.add(sid); new += 1
        data['checks'][h] = {'at': now.isoformat(), 'user': user, 'live': len(snaps), 'new': new}
        print(f'  {user}: {len(snaps)} live, {new} new')
        added += new
    data['snaps'].sort(key=lambda s: (s['user'], s['t']))
    data['lastRun'] = now.isoformat()
    json.dump(data, open(path, 'w'), ensure_ascii=False, indent=1)
    return added


def test():
    assert handle_of('@Abc.d') == 'abc.d'
    assert handle_of('https://www.snapchat.com/add/x_y?share_id=1') == 'x_y'
    assert handle_of('https://snapchat.com/@zz') == 'zz'
    assert handle_of('https://snapchat.com/t/AbC') == 'https://snapchat.com/t/AbC'
    assert ts('2026-11-09T10:00:00+03:00') == datetime(2026, 11, 9, 7, tzinfo=timezone.utc)
    print('ok')


if __name__ == '__main__':
    if sys.argv[1:] == ['test']: sys.exit(test())
    now = datetime.now(timezone.utc)
    for c in json.load(open(os.path.join(ROOT, 'campaigns.json'))):
        print(c['slug'])
        run_campaign(c, now)
