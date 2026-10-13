// Story text: turns the filtered numbers into plain-language tour steps. No DOM.
(function (root) {
  const { CH, TIERS } = root.SY;
  const fmt = n => Math.round(n).toLocaleString('en-US');
  const pct = (a, b, d) => b > 0 ? (a / b * 100).toFixed(d == null ? 0 : d) + '%' : '—';
  const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const quote = s => '“' + esc(s) + '”';
  function oneIn(a, b) {
    if (!(a > 0) || !(b > 0)) return '';
    const r = b / a;
    if (r < 1.3) return 'almost all of them';
    const n = r < 10 ? Math.round(r) : r < 100 ? Math.round(r / 5) * 5 : r < 1000 ? Math.round(r / 10) * 10 : Math.round(r / 100) * 100;
    return 'about 1 in ' + fmt(n);
  }
  const per = (a, b, base) => b > 0 ? fmt(a / b * base) : '—';
  const list = arr => arr.length < 2 ? arr.join('') : arr.slice(0, -1).join(', ') + ' and ' + arr[arr.length - 1];

  // ctx: { D, A, T, Tall, sel (array of channel objects, or null for everyone), period, nDays, N }
  function buildSteps(ctx) {
    const { D, A, T, Tall, sel, period, nDays, N } = ctx;
    const has = D.meta.has;
    const steps = [];
    const day = v => fmt(v / nDays);
    const all = !sel;
    const who = all ? 'visitors' : sel.length === 1 ? sel[0].who + ' visitors' : 'these visitors';
    const stay = T.vis - T.bounces, stayAll = Tall.vis - Tall.bounces;
    const vsAll = (a, b, d) => all || !(b > 0) ? '' : ' (all sources: ' + pct(a, b, d) + ')';
    const best = (num, den) => {
      let bi = -1, bv = -1;
      CH.forEach((c, i) => { const d = den(i); if (d < Math.max(50, Tall.vis * 0.01)) return; const v = num(i) / d; if (v > bv) { bv = v; bi = i; } });
      return bi < 0 ? null : { c: CH[bi], v: bv };
    };

    // ---- Outside ----
    if (all) {
      steps.push({ scene: 'out', at: 'overview', title: 'Where our visitors come from',
        html: `<p>${period}, <b>${fmt(T.vis)}</b> visits reached the site, about <b>${day(T.vis)}</b> a day. Each moving shape is about ${fmt(N)} visitors travelling from where they found us to the website.</p>` });
      TIERS.forEach(t => {
        const idx = CH.map((c, i) => c.tier === t.id ? i : -1).filter(i => i >= 0);
        const tv = idx.reduce((s, i) => s + A.ch.vis[i], 0);
        if (!tv) return;
        let extra = '';
        if (t.id === 'paid') {
          const i = CH.findIndex(c => c.id === 'paidsearch');
          if (A.ch.reach[i]) extra = ` For every 1,000 times a search ad was shown, about <b>${per(A.ch.vis[i], A.ch.reach[i], 1000)}</b> people clicked through.`;
        }
        if (t.id === 'owned') {
          const i = CH.findIndex(c => c.id === 'email'), j = CH.findIndex(c => c.id === 'direct');
          if (A.ch.reach[i]) extra = ` We sent <b>${fmt(A.ch.reach[i])}</b> emails${A.ch.opens[i] ? `; ${pct(A.ch.opens[i], A.ch.reach[i])} were opened` : ''}, and ${fmt(A.ch.vis[i])} led to a visit.`;
          if (A.ch.vis[j]) extra += ` Another ${day(A.ch.vis[j])} a day came straight to us by typing the address or using a bookmark.`;
        }
        if (t.id === 'earned') {
          let bi = idx[0]; idx.forEach(i => { if (A.ch.vis[i] > A.ch.vis[bi]) bi = i; });
          extra = ` We did not pay for these. ${esc(CH[bi].name)} was the biggest single source.`;
        }
        steps.push({ scene: 'out', at: 'tier:' + t.id, title: t.long, hl: ['gw-' + t.id, ...idx.map(i => CH[i].id)],
          html: `<p><b>${day(tv)}</b> visits a day (${pct(tv, T.vis)} of all) came from ${t.long.toLowerCase()}.${extra}</p>` });
      });
    } else if (sel.length === 1) {
      const c = sel[0], i = CH.indexOf(c);
      const reach = A.ch.reach[i], opens = A.ch.opens[i], vis = A.ch.vis[i];
      let html, fun = null;
      if (c.id === 'email' && reach) {
        html = `<p>${period}, we sent <b>${fmt(reach)}</b> emails.${opens ? ` <b>${fmt(opens)}</b> were opened (${pct(opens, reach)}), and` : ''} <b>${fmt(vis)}</b> led to a visit. That is about ${per(vis, reach, 1000)} visits for every 1,000 emails sent.</p>`;
        fun = [['Sent', reach], ...(opens ? [['Opened', opens]] : []), ['Visited the site', vis]];
      } else if (reach && c.reachNoun) {
        const lead = { paidsearch: 'our search ads were shown', display: 'our banner ads were shown', search: 'our pages appeared in search results', social: 'our posts reached' }[c.id];
        const unit = c.id === 'social' ? ' people' : ' times';
        html = `<p>${period}, ${lead} <b>${fmt(reach)}</b>${unit}. <b>${fmt(vis)}</b> clicked through to the site, ${oneIn(vis, reach)}.</p>`;
        fun = [[c.id === 'social' ? 'Reached' : 'Shown', reach], ['Visited the site', vis]];
      } else if (c.id === 'direct') {
        html = `<p>${period}, <b>${fmt(vis)}</b> visits came from people who typed our address or used a bookmark. Nobody sent them; they already knew where to find us.</p>`;
      } else if (c.id === 'referral') {
        html = `<p>${period}, <b>${fmt(vis)}</b> visits came from links on other websites, such as news sites, partners and blogs.</p>`;
      } else {
        html = `<p>${period}, <b>${fmt(vis)}</b> visits came from ${esc(c.name.toLowerCase())}.</p>`;
      }
      steps.push({ scene: 'out', at: 'ch:' + c.id, title: 'How ' + c.name.toLowerCase() + ' brings people in', hl: [c.id], html, funnel: fun, color: 'var(--c-' + c.id + ')' });
    } else {
      steps.push({ scene: 'out', at: 'overview', title: 'The visitors we are following', hl: sel.map(c => c.id),
        html: `<p>${period}, <b>${fmt(T.vis)}</b> visits came from ${list(sel.map(c => esc(c.name.toLowerCase())))}, about <b>${day(T.vis)}</b> a day.</p>` });
    }

    // ---- Inside the site ----
    if (has.bounces && T.vis) {
      steps.push({ scene: 'in', at: 'home', title: 'Arriving on the site', hl: ['home', 'exitBounce'],
        html: `<p>Every visit starts on a first page. <b>${pct(T.bounces, T.vis)}</b> of ${who} looked at that one page and left${vsAll(Tall.bounces, Tall.vis)}. You can see them walking straight to the exit.</p>` });
    }
    if (has.logins && T.vis) {
      const b = best(i => A.ch.logins[i], i => A.ch.vis[i]);
      steps.push({ scene: 'in', at: 'signin', title: 'Signing in', hl: ['signin'],
        html: `<p><b>${pct(T.logins, T.vis)}</b> of visits included signing in to an account, about ${day(T.logins)} a day${vsAll(Tall.logins, Tall.vis)}. Their heads turn light blue once they have signed in.${all && b ? ` ${esc(b.c.name)} visitors were the most likely to sign in.` : ''}</p>` });
    }
    if (D.K && T.vis) {
      const order = [...Array(D.K).keys()].sort((x, y) => T.reads[y] - T.reads[x]);
      const top = order[0];
      let more = '';
      if (all) {
        more = order.slice(1, 3).map(k => {
          let bi = 0; CH.forEach((c, i) => { if (A.chReads[i * D.K + k] > A.chReads[bi * D.K + k]) bi = i; });
          return ` ${quote(D.meta.articles[k])} got most of its readers from ${esc(CH[bi].name.toLowerCase())}.`;
        }).join('');
      } else {
        const topAll = [...Array(D.K).keys()].sort((x, y) => Tall.reads[y] - Tall.reads[x])[0];
        if (topAll !== top) more = ` Across all sources, ${quote(D.meta.articles[topAll])} was read most, so this group is different.`;
      }
      steps.push({ scene: 'in', at: 'articles', title: 'What people read', hl: ['art-0', 'art-1', 'art-2'],
        html: `<p>The most read article was ${quote(D.meta.articles[top])}, with about <b>${day(T.reads[top])}</b> reads a day.${more}</p>` });
    }
    if (has.pv && stay > 0) {
      const depth = (T.pv - T.bounces) / stay, depthAll = stayAll > 0 ? (Tall.pv - Tall.bounces) / stayAll : 0;
      steps.push({ scene: 'in', at: 'browse', title: 'Browsing around', hl: ['browse'],
        html: `<p>${all ? 'Visitors' : 'Those'} who stayed looked at <b>${depth.toFixed(1)} pages</b> on average${all ? '' : ` (all sources: ${depthAll.toFixed(1)})`}. Walkers stop at the marker for the number of pages they viewed.</p>` });
    }
    if (T.vis) {
      const b = best(i => A.ch.conv[i], i => A.ch.vis[i]);
      steps.push({ scene: 'in', at: 'goal', title: 'Converting', hl: ['goal', 'exitBrowse'],
        html: `<p><b>${fmt(T.conv)}</b> visits ended in a purchase or sign-up. That is <b>${pct(T.conv, T.vis, 1)}</b> of ${who}, ${oneIn(T.conv, T.vis)}${vsAll(Tall.conv, Tall.vis, 1)}.${all && b ? ` ${esc(b.c.name)} visitors converted best, at ${(b.v * 100).toFixed(1)}%.` : ''}</p>` });
    }
    steps.push({ scene: 'in', at: 'overview', title: 'Now it is your turn',
      html: `<p>Pick a source under <b>Follow visitors from</b> to watch only those people, or narrow it down by region, device, user type or age. Exact numbers and definitions are under <b>Numbers &amp; glossary</b>.</p>` });
    return steps;
  }
  root.SY.buildSteps = buildSteps;
})(typeof window !== 'undefined' ? window : globalThis);
