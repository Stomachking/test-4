// Data core: no DOM, no rendering
(function (root) {
  const TIERS = [
    { id: 'paid',   name: 'Paid',   long: 'Paid ads',                 desc: 'Bought clicks and impressions', hex: 0x6f5fc9, css: 'var(--t-paid)',   b: -16 },
    { id: 'owned',  name: 'Owned',  long: 'Email and direct',         desc: 'Channels you control',          hex: 0xc46c32, css: 'var(--t-owned)',  b: 0 },
    { id: 'earned', name: 'Earned', long: 'Search, social and links', desc: 'Traffic others send you',       hex: 0x2f86c4, css: 'var(--t-earned)', b: 16 },
  ];
  const CH = [
    { id: 'paidsearch', tier: 'paid',   name: 'Paid search',    short: 'Paid search',  adobe: 'Paid Search',       hex: 0x7a5cf0, a: -28, dur: 4.4, reachNoun: 'ad views',       who: 'paid search' },
    { id: 'display',    tier: 'paid',   name: 'Programmatic',   short: 'Programmatic', adobe: 'Display',           hex: 0x5f9e12, a: -20, dur: 4.6, reachNoun: 'banner views',   who: 'banner ad' },
    { id: 'email',      tier: 'owned',  name: 'Email',          short: 'Email',        adobe: 'Email',             hex: 0xe8661c, a: -28, dur: 5.2, reachNoun: 'emails sent',    who: 'email' },
    { id: 'direct',     tier: 'owned',  name: 'Direct',         short: 'Direct',       adobe: 'Direct',            hex: 0x0fa58b, a: -20, dur: 3.4, reachNoun: '',               who: 'direct' },
    { id: 'search',     tier: 'earned', name: 'Organic search', short: 'Organic',      adobe: 'Natural Search',    hex: 0x1f86de, a: -32, dur: 4.8, reachNoun: 'search views',   who: 'organic search' },
    { id: 'social',     tier: 'earned', name: 'Social',         short: 'Social',       adobe: 'Social Networks',   hex: 0xe0418a, a: -24, dur: 4.2, reachNoun: 'people reached', who: 'social' },
    { id: 'referral',   tier: 'earned', name: 'Referral',       short: 'Referral',     adobe: 'Referring Domains', hex: 0xb4884a, a: -16, dur: 4.4, reachNoun: '',               who: 'referral' },
  ];
  const CH_INDEX = Object.fromEntries(CH.map((c, i) => [c.id, i]));
  const METRICS = ['vis', 'conv', 'reach', 'opens', 'logins', 'pv', 'bounces'];
  const norm = s => String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, '');

  const CHANNEL_ALIASES = {
    paidsearch: ['paidsearch', 'sem', 'ppc', 'cpc', 'searchpaid', 'googleads', 'paid'],
    display: ['display', 'programmatic', 'programmaticdisplay', 'dsp', 'banner', 'displayads'],
    email: ['email', 'emailmarketing', 'newsletter', 'crm'],
    direct: ['direct', 'typedbookmarked', 'none', 'directtraffic'],
    search: ['naturalsearch', 'organicsearch', 'organic', 'seo', 'search', 'freesearch'],
    social: ['socialnetworks', 'social', 'organicsocial', 'socialmedia'],
    referral: ['referringdomains', 'referral', 'referrals', 'referrer', 'referringdomain', 'referring'],
  };
  const CHANNEL_LOOKUP = {};
  Object.entries(CHANNEL_ALIASES).forEach(([id, list]) => list.forEach(a => CHANNEL_LOOKUP[a] = id));

  const REGION_LISTS = {
    APAC: ['Australia', 'New Zealand', 'Japan', 'China', 'Hong Kong', 'Macau', 'Taiwan', 'South Korea', 'Korea', 'Singapore', 'Malaysia', 'Indonesia', 'Thailand', 'Vietnam', 'Philippines', 'India', 'Pakistan', 'Bangladesh', 'Sri Lanka'],
    EMEA: ['United Kingdom', 'UK', 'Great Britain', 'Ireland', 'Germany', 'France', 'Spain', 'Italy', 'Netherlands', 'Belgium', 'Switzerland', 'Austria', 'Sweden', 'Norway', 'Denmark', 'Finland', 'Poland', 'Portugal', 'Czech Republic', 'Czechia', 'Greece', 'Turkey', 'Israel', 'United Arab Emirates', 'UAE', 'Saudi Arabia', 'Qatar', 'Egypt', 'South Africa', 'Nigeria', 'Kenya', 'Morocco'],
    LATAM: ['Brazil', 'Mexico', 'Argentina', 'Chile', 'Colombia', 'Peru', 'Ecuador', 'Uruguay', 'Paraguay', 'Bolivia', 'Venezuela', 'Costa Rica', 'Panama', 'Guatemala', 'Dominican Republic', 'Puerto Rico'],
    'North America': ['United States', 'USA', 'US', 'Canada'],
  };
  const COUNTRY_REGION = {};
  Object.entries(REGION_LISTS).forEach(([r, list]) => list.forEach(c => COUNTRY_REGION[norm(c)] = r));

  function normRegion(v) {
    const n = norm(v);
    if (!n) return '';
    if (['apac', 'asiapacific', 'asia', 'apj'].includes(n)) return 'APAC';
    if (['emea', 'europe', 'eu', 'mea', 'middleeast', 'africa'].includes(n)) return 'EMEA';
    if (['latam', 'latinamerica', 'southamerica', 'lac'].includes(n)) return 'LATAM';
    if (['na', 'northamerica', 'amer', 'americas'].includes(n)) return 'North America';
    return String(v).trim();
  }
  function normDevice(v) {
    const n = norm(v);
    if (!n) return 'Unknown';
    if (n.includes('tablet') || n === 'ipad') return 'Tablet';
    if (n.includes('mobile') || n.includes('phone') || n === 'smartphone') return 'Mobile';
    if (n.includes('desktop') || n === 'other' || n === 'computer' || n === 'pc') return 'Desktop';
    return String(v).trim();
  }
  function normUser(v) {
    const n = norm(v);
    if (!n) return 'External';
    if (n.includes('intern') || n === 'employee' || n === 'staff') return 'Internal';
    if (n.includes('extern') || n === 'customer' || n === 'public' || n === 'visitor') return 'External';
    return String(v).trim();
  }
  const cleanAge = v => { const s = String(v == null ? '' : v).trim().replace(/\s*-\s*/, '–'); return s || 'Unknown'; };
  function toNum(v) {
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    const n = parseFloat(String(v == null ? '' : v).replace(/[,\s%]/g, ''));
    return isFinite(n) ? n : 0;
  }
  const pad = n => String(n).padStart(2, '0');
  function normDate(v) {
    if (v == null || v === '') return '';
    if (v instanceof Date && !isNaN(v)) { const d = new Date(v.getTime() + 43200000); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
    if (typeof v === 'number' && v > 20000 && v < 80000) { const d = new Date(Math.round((v - 25569) * 86400000)); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
    const s = String(v).trim();
    const m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (m) return m[1] + '-' + pad(m[2]) + '-' + pad(m[3]);
    const t = Date.parse(s);
    if (!isNaN(t)) { const d = new Date(t); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
    return s;
  }

  const HEADER_ALIASES = {
    date: ['date', 'day', 'period', 'reportdate'],
    channel: ['channel', 'marketingchannel', 'lasttouchchannel', 'lasttouchmarketingchannel', 'firsttouchchannel', 'source', 'trafficsource', 'channelgroup'],
    region: ['region', 'salesregion', 'georegion', 'geo', 'territory'],
    country: ['country', 'countries', 'market', 'countryname'],
    device: ['device', 'devicetype', 'mobiledevicetype', 'devicecategory', 'platform'],
    user: ['usertype', 'user', 'users', 'internalexternal', 'internalvsexternal', 'audience', 'visitortype', 'traffictype'],
    age: ['agegroup', 'age', 'agerange', 'agebracket', 'agebucket'],
    vis: ['visits', 'sessions', 'visit', 'session', 'traffic'],
    conv: ['conversions', 'conversion', 'orders', 'order', 'leads', 'lead', 'goals', 'goalcompletions', 'purchases', 'signups'],
    reach: ['reach', 'impressions', 'impr', 'sent', 'emailssent', 'delivered', 'emailsdelivered', 'adimpressions', 'searchimpressions', 'peoplereached'],
    opens: ['opens', 'emailopens', 'opened', 'uniqueopens'],
    logins: ['logins', 'login', 'signins', 'signin', 'accountlogins', 'loggedinvisits'],
    pv: ['pageviews', 'pages', 'pagesviewed', 'views', 'pageview'],
    bounces: ['bounces', 'singlepagevisits', 'bounce', 'bouncedvisits'],
  };
  const ARTICLE_RE = /^\s*(read|reads|article|articles|articleviews|content)\s*[:\-–—|]\s*(.+?)\s*$/i;
  function mapHeaders(headers) {
    const H = {}, articles = [];
    headers.forEach(h => {
      const am = String(h).match(ARTICLE_RE);
      if (am) { articles.push({ header: h, name: am[2] }); return; }
      const n = norm(h);
      for (const [key, list] of Object.entries(HEADER_ALIASES)) if (!H[key] && list.includes(n)) { H[key] = h; break; }
    });
    return { H, articles };
  }

  function parseRecords(rows) {
    if (!rows.length) return { error: 'The first sheet is empty.' };
    const headers = Object.keys(rows[0]);
    const { H, articles } = mapHeaders(headers);
    const missing = ['channel', 'vis'].filter(k => !H[k]);
    if (missing.length) return { error: 'Could not find a ' + missing.map(m => m === 'channel' ? '"Channel"' : '"Visits"').join(' or ') + ' column. Found: ' + headers.slice(0, 12).join(', ') + '.' };
    const recs = [], unknown = {}; let skipped = 0;
    rows.forEach(r => {
      const chId = CHANNEL_LOOKUP[norm(r[H.channel])];
      const vis = toNum(r[H.vis]);
      if (!chId) { const k = String(r[H.channel] || '').trim(); if (k) unknown[k] = (unknown[k] || 0) + vis; skipped++; return; }
      if (vis <= 0) { skipped++; return; }
      const country = H.country ? String(r[H.country] || '').trim() || 'Unknown' : 'All countries';
      let region = H.region ? normRegion(r[H.region]) : '';
      if (!region) region = COUNTRY_REGION[norm(country)] || 'Other';
      const rec = {
        date: H.date ? (normDate(r[H.date]) || 'Unknown') : 'All dates',
        ch: chId, region, country,
        device: H.device ? normDevice(r[H.device]) : 'All devices',
        user: H.user ? normUser(r[H.user]) : 'External',
        age: H.age ? cleanAge(r[H.age]) : 'All ages',
        reads: articles.map(a => Math.max(0, toNum(r[a.header]))),
      };
      METRICS.forEach(m => rec[m] = H[m] ? Math.max(0, toNum(r[H[m]])) : 0);
      rec.vis = vis;
      recs.push(rec);
    });
    if (!recs.length) return { error: 'No rows matched the seven channels. Channel values found: ' + Object.keys(unknown).slice(0, 8).join(', ') + '.' };
    const has = {}; METRICS.forEach(m => has[m] = !!H[m]);
    return { recs, unknown, skipped, mapped: H, meta: { has, articles: articles.map(a => a.name) } };
  }

  function buildDataset(recs, source, meta) {
    const dims = ['date', 'region', 'country', 'device', 'user', 'age'];
    const K = meta.articles.length;
    const dict = {}; dims.forEach(d => dict[d] = new Map());
    const n = recs.length;
    const cols = { ch: new Uint8Array(n), reads: new Float64Array(n * K) };
    METRICS.forEach(m => cols[m] = new Float64Array(n));
    dims.forEach(d => cols[d] = new Uint16Array(n));
    recs.forEach((r, i) => {
      cols.ch[i] = CH_INDEX[r.ch];
      METRICS.forEach(m => cols[m][i] = r[m] || 0);
      for (let k = 0; k < K; k++) cols.reads[i * K + k] = r.reads[k] || 0;
      dims.forEach(d => { const mp = dict[d]; let k = mp.get(r[d]); if (k === undefined) { k = mp.size; mp.set(r[d], k); } cols[d][i] = k; });
    });
    const rank = (v, list) => { const i = list.indexOf(v); return i < 0 ? list.length : i; };
    const order = {
      date: (a, b) => a < b ? -1 : a > b ? 1 : 0,
      region: (a, b) => rank(a, ['APAC', 'EMEA', 'LATAM', 'North America']) - rank(b, ['APAC', 'EMEA', 'LATAM', 'North America']) || a.localeCompare(b),
      country: (a, b) => a.localeCompare(b),
      device: (a, b) => rank(a, ['Desktop', 'Mobile', 'Tablet']) - rank(b, ['Desktop', 'Mobile', 'Tablet']) || a.localeCompare(b),
      user: (a, b) => rank(a, ['External', 'Internal']) - rank(b, ['External', 'Internal']) || a.localeCompare(b),
      age: (a, b) => (parseFloat(a) || 999) - (parseFloat(b) || 999) || a.localeCompare(b),
    };
    const lists = {};
    dims.forEach(d => {
      const names = [...dict[d].keys()].sort(order[d]);
      const remap = new Uint16Array(names.length);
      names.forEach((nm, j) => remap[dict[d].get(nm)] = j);
      const col = cols[d]; for (let i = 0; i < n; i++) col[i] = remap[col[i]];
      lists[d] = names;
    });
    const regionCountries = lists.region.map(() => new Set());
    for (let i = 0; i < n; i++) regionCountries[cols.region[i]].add(cols.country[i]);
    let total = 0; for (let i = 0; i < n; i++) total += cols.vis[i];
    const chHasReach = CH.map(() => false);
    for (let i = 0; i < n; i++) if (cols.reach[i] > 0) chHasReach[cols.ch[i]] = true;
    return { n, K, cols, lists, regionCountries, total, source, meta, chHasReach };
  }

  // Seeded sample: 30 days, 14 countries, 3 devices, 2 user types, 5 age groups, with funnel and on-site actions
  function makeSample() {
    let s = 20260901;
    const rnd = () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    const rd = x => Math.floor(x + rnd());
    const REG = { APAC: [['Hong Kong', .26], ['Singapore', .20], ['Australia', .20], ['Japan', .18], ['India', .16]],
                  EMEA: [['United Kingdom', .32], ['Germany', .26], ['France', .20], ['United Arab Emirates', .12], ['South Africa', .10]],
                  LATAM: [['Brazil', .40], ['Mexico', .32], ['Argentina', .16], ['Chile', .12]] };
    const REG_SHARE = { APAC: .42, EMEA: .36, LATAM: .22 };
    const CH_SHARE = { paidsearch: .15, display: .08, email: .09, direct: .10, search: .30, social: .20, referral: .08 };
    const REG_CH = { APAC: { paidsearch: 1.25, display: 1.2 }, EMEA: { email: 1.4, paidsearch: 0.9 }, LATAM: { social: 1.6, search: 0.85, email: 0.6 } };
    const DEV = ['Desktop', 'Mobile', 'Tablet'];
    const DEV_SHARE = { paidsearch: [.42, .50, .08], display: [.25, .68, .07], email: [.50, .42, .08], direct: [.62, .32, .06], search: [.40, .52, .08], social: [.12, .83, .05], referral: [.48, .45, .07] };
    const AGES = ['18–24', '25–34', '35–44', '45–54', '55+'];
    const AGE_SHARE = { base: [.16, .31, .25, .16, .12], social: [.30, .36, .18, .10, .06], email: [.07, .22, .27, .24, .20], internal: [.05, .40, .35, .15, .05] };
    const INTERNAL = { direct: .14, email: .08, referral: .03 };
    const CVR = { paidsearch: .045, display: .009, email: .058, direct: .044, search: .032, social: .014, referral: .027 };
    const DEV_CVR = [1.35, 0.75, 1.0], AGE_CVR = [0.6, 1.15, 1.2, 1.0, 0.85], REG_CVR = { APAC: 1, EMEA: 1.1, LATAM: 0.8 };
    const OPEN = { APAC: .24, EMEA: .30, LATAM: .21 };
    const CTR = { paidsearch: [.038, .031, .034], display: [.0016, .0024, .0019], search: [.046, .040, .042], social: [.010, .012, .011] };
    const BOUNCE = { display: .62, social: .55, paidsearch: .38, search: .42, email: .28, direct: .30, referral: .45 };
    const BOUNCE_DEV = [0.92, 1.1, 1.0];
    const LOGIN = { email: .42, direct: .35, paidsearch: .10, display: .04, search: .12, social: .08, referral: .09 };
    const LOGIN_DEV = [1.15, 0.9, 1.0];
    const DEPTH = { email: 5.2, direct: 6.1, search: 3.8, paidsearch: 3.4, display: 2.6, social: 2.9, referral: 4.0 };
    const ARTICLES = ['How to choose the right plan', 'Customer story: Harbour Logistics', '2026 Industry Outlook'];
    // share of all visits that read each article
    const READ = { base: [.12, .07, .06], email: [.13, .29, .09], search: [.20, .06, .07], social: [.07, .05, .14], paidsearch: [.20, .05, .05], display: [.05, .02, .02], direct: [.14, .10, .13], referral: [.10, .07, .15] };
    const DAILY = 42000;
    const recs = [];
    for (let d = 0; d < 30; d++) {
      const date = new Date(2026, 8, 1 + d);
      const dateStr = date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
      const dow = date.getDay(), weekend = dow === 0 || dow === 6;
      for (const c of CH) {
        let dayF = (1 + d * 0.004) * (0.94 + rnd() * 0.12);
        if (c.id === 'social') dayF *= weekend ? 1.15 : 1; else dayF *= weekend ? 0.78 : 1;
        if (c.id === 'email') dayF *= dow === 2 ? 2.6 : 0.85;
        for (const [reg, countries] of Object.entries(REG)) {
          let regF = REG_SHARE[reg] * ((REG_CH[reg] || {})[c.id] || 1);
          if (reg === 'APAC' && d >= 14 && (c.id === 'paidsearch' || c.id === 'display')) regF *= c.id === 'display' ? 1.5 : 1.35;
          for (const [country, cShare] of countries) {
            const base = DAILY * CH_SHARE[c.id] * dayF * regF * cShare;
            const intShare = INTERNAL[c.id] || 0.01;
            for (const user of ['External', 'Internal']) {
              const internal = user === 'Internal';
              const uShare = internal ? intShare : 1 - intShare;
              const dev = DEV_SHARE[c.id].slice();
              if (reg === 'LATAM') dev[1] *= 1.25;
              if (internal) { dev[0] *= 2; dev[1] *= 0.4; }
              const dsum = dev[0] + dev[1] + dev[2];
              const ages = internal ? AGE_SHARE.internal : (AGE_SHARE[c.id] || AGE_SHARE.base);
              for (let k = 0; k < 3; k++) for (let a = 0; a < 5; a++) {
                const vis = rd(base * uShare * (dev[k] / dsum) * ages[a]);
                if (!vis) continue;
                const bounces = Math.min(vis, rd(vis * Math.min(0.9, BOUNCE[c.id] * BOUNCE_DEV[k] * (internal ? 0.6 : 1))));
                const stay = vis - bounces;
                const logins = Math.min(stay, rd(vis * Math.min(0.95, LOGIN[c.id] * LOGIN_DEV[k] * (internal ? 2 : 1))));
                const pv = bounces + rd(stay * (internal ? 7 : DEPTH[c.id]));
                const rp = READ[c.id] || READ.base;
                const reads = rp.map(p => Math.min(stay, rd(vis * p * (internal ? 0.5 : 1))));
                const conv = Math.min(stay, rd(vis * CVR[c.id] * DEV_CVR[k] * AGE_CVR[a] * REG_CVR[reg] * (internal ? 0.08 : 1)));
                let reach = 0, opens = 0;
                if (c.id === 'email') { opens = rd(vis / (k === 1 ? 0.14 : 0.16)); reach = rd(opens / OPEN[reg]); }
                else if (CTR[c.id]) { let ctr = CTR[c.id][k]; if (c.id === 'social' && reg === 'LATAM') ctr *= 1.25; reach = rd(vis / ctr); }
                recs.push({ date: dateStr, ch: c.id, region: reg, country, device: DEV[k], user, age: AGES[a], vis, conv, reach, opens, logins, pv, bounces, reads });
              }
            }
          }
        }
      }
    }
    const has = {}; METRICS.forEach(m => has[m] = true);
    return { recs, meta: { has, articles: ARTICLES } };
  }

  // Cross-filtered aggregation. Per-channel sums ignore the channel filter (so a followed source
  // can be compared with everyone); the audience breakdowns respect it and ignore their own filter.
  function aggregate(D, F) {
    const { n, cols, lists, K } = D;
    const nCh = CH.length, nD = lists.date.length;
    const ch = {}; METRICS.forEach(m => ch[m] = new Float64Array(nCh));
    const out = { ch, chReads: new Float64Array(nCh * K), chDay: new Float64Array(nCh * nD), bk: {}, nDays: F.day == null ? nD : 1 };
    const keys = ['region', 'country', 'device', 'user', 'age'];
    keys.forEach(k => out.bk[k] = { vis: new Float64Array(lists[k].length), conv: new Float64Array(lists[k].length) });
    const fDay = F.day, fReg = F.region, fCty = F.country;
    const fDev = F.devices.size ? F.devices : null, fUsr = F.users.size ? F.users : null, fAge = F.ages.size ? F.ages : null, fCh = F.channels.size ? F.channels : null;
    for (let i = 0; i < n; i++) {
      const day = cols.date[i], reg = cols.region[i], cty = cols.country[i], dev = cols.device[i], usr = cols.user[i], age = cols.age[i], c = cols.ch[i];
      let core = 0;
      if (fReg != null && reg !== fReg) core |= 2;
      if (fCty != null && cty !== fCty) core |= 4;
      if (fDev && !fDev.has(dev)) core |= 8;
      if (fUsr && !fUsr.has(usr)) core |= 16;
      if (fAge && !fAge.has(age)) core |= 32;
      if (core & (core - 1)) continue;
      const v = cols.vis[i];
      if (core === 0) out.chDay[c * nD + day] += v;
      if (fDay != null && day !== fDay) continue;
      if (core === 0) {
        for (const m of METRICS) ch[m][c] += cols[m][i];
        for (let k = 0; k < K; k++) out.chReads[c * K + k] += cols.reads[i * K + k];
      }
      if (fCh && !fCh.has(c)) continue;
      const cv = cols.conv[i];
      if (core === 0) {
        for (const k of keys) { const idx = cols[k][i]; out.bk[k].vis[idx] += v; out.bk[k].conv[idx] += cv; }
      } else {
        const k = core === 2 ? 'region' : core === 4 ? 'country' : core === 8 ? 'device' : core === 16 ? 'user' : 'age';
        const idx = cols[k][i]; out.bk[k].vis[idx] += v; out.bk[k].conv[idx] += cv;
      }
    }
    return out;
  }

  function totals(D, A, chSet) {
    const T = { reads: new Float64Array(D.K) };
    METRICS.forEach(m => T[m] = 0);
    CH.forEach((c, i) => {
      if (chSet && chSet.size && !chSet.has(i)) return;
      METRICS.forEach(m => T[m] += A.ch[m][i]);
      for (let k = 0; k < D.K; k++) T.reads[k] += A.chReads[i * D.K + k];
    });
    return T;
  }

  root.SY = { TIERS, CH, METRICS, parseRecords, buildDataset, makeSample, aggregate, totals };
})(typeof window !== 'undefined' ? window : globalThis);
