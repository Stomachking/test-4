// App: two places (outside, inside), tour, filters, drawer
(function () {
  const { TIERS, CH, parseRecords, buildDataset, makeSample, aggregate, totals, buildSteps } = window.SY;
  const RM = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const V3 = THREE.Vector3;
  const fmt = n => Math.round(n).toLocaleString('en-US');
  const pct = (a, b, d) => b > 0 ? (a / b * 100).toFixed(d == null ? 0 : d) + '%' : '—';
  const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const el = id => document.getElementById(id);
  const toXZ = (a, b) => ({ x: (a + b) / 2, z: (b - a) / 2 }); // a: screen left→right, b: screen back→front
  const byId = Object.fromEntries(CH.map(c => [c.id, c]));
  const tierById = Object.fromEntries(TIERS.map(t => [t.id, t]));
  CH.forEach(c => { c.css = 'var(--c-' + c.id + ')'; Object.assign(c, toXZ(c.a, tierById[c.tier].b)); });
  TIERS.forEach(t => { t.gw = toXZ(-9, t.b * 0.55); t.channels = CH.filter(c => c.tier === t.id); });

  // ---------- Renderer and camera ----------
  const stage = el('stage');
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;
  stage.prepend(renderer.domElement);
  const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 300);
  const OFFSET = new V3(40, 40, 40);
  const VIEWS = { out: { overview: { a: -13.5, b: 0, zoom: 1 }, halfW: 15.8 }, in: { overview: { a: 2, b: 0, zoom: 1 }, halfW: 18.5 } };
  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.08; controls.screenSpacePanning = true;
  const ISO = Math.acos(1 / Math.sqrt(3));
  controls.minPolarAngle = ISO - 0.3; controls.maxPolarAngle = ISO + 0.2;
  controls.minAzimuthAngle = Math.PI / 4 - 0.5; controls.maxAzimuthAngle = Math.PI / 4 + 0.5;
  controls.minZoom = 0.6; controls.maxZoom = 4;
  function placeCamera(a, b, zoom) {
    const p = toXZ(a, b);
    controls.target.set(p.x, 1.0, p.z);
    camera.position.copy(controls.target).add(OFFSET);
    camera.zoom = zoom; camera.updateProjectionMatrix(); controls.update();
  }

  const sceneOut = new THREE.Scene(), sceneIn = new THREE.Scene();
  function addLights(scene, cx, cz) {
    scene.add(new THREE.HemisphereLight(0xffffff, 0xb9c3da, 0.95));
    const sun = new THREE.DirectionalLight(0xfff1e0, 0.9);
    sun.position.set(cx - 14, 30, cz + 10); sun.target.position.set(cx, 0, cz);
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 90 });
    sun.shadow.bias = -0.0006;
    scene.add(sun, sun.target);
    const fill = new THREE.DirectionalLight(0xcdd8ff, 0.35); fill.position.set(cx + 14, 8, cz - 6); scene.add(fill);
  }
  let S = sceneOut; // the scene currently being built
  const std = (color, extra) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.75, metalness: 0.1 }, extra || {}));
  function mesh(geo, mat, x, y, z, parent) {
    const m = new THREE.Mesh(geo, mat); m.position.set(x || 0, y || 0, z || 0);
    m.castShadow = true; m.receiveShadow = true; (parent || S).add(m); return m;
  }
  function island(x, z, size, edgeHex, opts) {
    opts = opts || {};
    const g = new THREE.Group();
    const top = std(opts.top || 0xf8f9fc), side = std(0xdce2ee);
    const h = opts.h || 0.6;
    const box = new THREE.Mesh(new THREE.BoxGeometry(size, h, size), [side, side, top, side, side, side]);
    box.position.y = -h / 2; box.receiveShadow = true; g.add(box);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(size, h, size)), new THREE.LineBasicMaterial({ color: edgeHex, transparent: true, opacity: 0.5 }));
    edges.position.y = -h / 2; g.add(edges);
    const grid = new THREE.GridHelper(size, Math.round(size), edgeHex, edgeHex);
    grid.material.transparent = true; grid.material.opacity = 0.1; grid.position.y = 0.01; g.add(grid);
    g.position.set(x, 0, z); S.add(g); return g;
  }
  function textTexture(lines, w, h, bg) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
    x.fillStyle = bg; x.fillRect(0, 0, w, h);
    x.textAlign = 'center'; x.textBaseline = 'middle';
    lines.forEach(([txt, size, y, col]) => { x.font = '600 ' + size + 'px sans-serif'; x.fillStyle = col; x.fillText(txt, w / 2, y); });
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t;
  }

  // =====================================================================
  // OUTSIDE: sources → tier gateways → website
  // =====================================================================
  S = sceneOut;
  addLights(sceneOut, -6.75, 6.75);
  const nodesOut = [], anim = {};
  TIERS.forEach(t => {
    const as = t.channels.map(c => c.a);
    const aMin = Math.min(...as) - 3.6, aMax = Math.max(...as) + 3.6;
    const len = (aMax - aMin) / Math.SQRT2, dep = 7.4 / Math.SQRT2;
    const ctr = toXZ((aMin + aMax) / 2, t.b);
    const g = new THREE.Group(); g.position.set(ctr.x, -0.95, ctr.z); g.rotation.y = Math.PI / 4; S.add(g);
    const slab = new THREE.Mesh(new THREE.BoxGeometry(len, 0.3, dep), std(0xe6eaf3)); slab.receiveShadow = true; g.add(slab);
    g.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(len, 0.3, dep)), new THREE.LineBasicMaterial({ color: t.hex, transparent: true, opacity: 0.7 })));
    const strip = new THREE.Mesh(new THREE.BoxGeometry(len, 0.02, 0.18), new THREE.MeshBasicMaterial({ color: t.hex, transparent: true, opacity: 0.55 }));
    strip.position.set(0, 0.16, dep / 2 - 0.25); g.add(strip);
  });
  function windowTexture() {
    const c = document.createElement('canvas'); c.width = 64; c.height = 128;
    const x = c.getContext('2d'); x.fillStyle = '#cfd8ea'; x.fillRect(0, 0, 64, 128);
    for (let r = 0; r < 14; r++) for (let k = 0; k < 4; k++) { x.fillStyle = Math.random() < 0.62 ? (Math.random() < 0.8 ? '#ffffff' : '#ffe7b0') : '#9fb0cf'; x.fillRect(5 + k * 15, 4 + r * 9, 9, 5); }
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t;
  }
  const hq = new THREE.Group(); S.add(hq);
  island(0, 0, 7, 0x4f7fe0);
  mesh(new THREE.BoxGeometry(5, 0.5, 5), std(0xd3dbeb), 0, 0.25, 0, hq);
  const winTex = windowTexture();
  const winMat = std(0xffffff, { map: winTex, emissive: 0xffffff, emissiveMap: winTex, emissiveIntensity: 0.55, roughness: 0.5 });
  const roofMat = std(0xc3cce0), towerMats = [winMat, winMat, roofMat, roofMat, winMat, winMat];
  mesh(new THREE.BoxGeometry(2.6, 6.2, 2.6), towerMats, -0.5, 3.6, -0.5, hq);
  mesh(new THREE.BoxGeometry(1.9, 3.6, 1.9), towerMats, 1.25, 2.3, 1.25, hq);
  mesh(new THREE.BoxGeometry(1.5, 2.2, 1.5), towerMats, 1.4, 1.6, -1.4, hq);
  mesh(new THREE.BoxGeometry(1.5, 1.6, 1.5), towerMats, -1.4, 1.3, 1.4, hq);
  mesh(new THREE.CylinderGeometry(0.05, 0.08, 1.6, 6), std(0x8a96b6), -0.5, 7.5, -0.5, hq);
  const beacon = mesh(new THREE.SphereGeometry(0.16, 12, 8), new THREE.MeshBasicMaterial({ color: 0xe5484d }), -0.5, 8.35, -0.5, hq);
  const rings = [];
  for (let i = 0; i < 4; i++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(2.9, 0.05, 6, 64), new THREE.MeshBasicMaterial({ color: 0x4f7fe0, transparent: true, opacity: 0 }));
    r.rotation.x = Math.PI / 2; r.position.y = 0.55; r.userData.life = 1; S.add(r); rings.push(r);
  }
  nodesOut.push({ group: hq, id: 'hq', labelY: 9.2, kind: 'site' });

  const builders = {
    paidsearch(c) {
      const g = new THREE.Group(); const sign = new THREE.Group(); sign.rotation.y = Math.PI / 4; g.add(sign);
      [-0.75, 0.75].forEach(px => mesh(new THREE.CylinderGeometry(0.07, 0.09, 2.3, 6), std(0x8a96b6), px, 1.15, 0, sign));
      const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128; const x = cv.getContext('2d');
      x.fillStyle = '#7a5cf0'; x.fillRect(0, 0, 256, 128); x.fillStyle = 'rgba(255,255,255,0.94)'; x.fillRect(10, 10, 236, 108);
      x.fillStyle = '#7a5cf0'; x.font = '600 22px sans-serif'; x.fillText('Ad', 24, 44);
      x.fillStyle = '#1b2340'; x.fillRect(66, 30, 150, 12); x.fillStyle = '#5a6482'; x.fillRect(24, 62, 200, 8); x.fillRect(24, 80, 170, 8);
      x.fillStyle = '#e2a300'; x.fillRect(24, 96, 64, 12);
      const tex = new THREE.CanvasTexture(cv); tex.encoding = THREE.sRGBEncoding;
      const face = new THREE.MeshBasicMaterial({ map: tex }), side = std(0xc3cce0);
      mesh(new THREE.BoxGeometry(2.3, 1.2, 0.12), [side, side, side, side, face, side], 0, 2.85, 0, sign);
      return { g, emit: new V3(0, 3.5, 0), labelY: 4.3 };
    },
    display(c) {
      const g = new THREE.Group(); const leds = [];
      [[-0.55, 0.45], [0.55, -0.45]].forEach(([px, pz], k) => {
        mesh(new THREE.BoxGeometry(0.8, 2 - k * 0.5, 0.8), std(0x9aa6c6), px, 1 - k * 0.25, pz, g);
        for (let i = 0; i < 5 - k; i++) leds.push(mesh(new THREE.BoxGeometry(0.55, 0.06, 0.02), new THREE.MeshBasicMaterial({ color: c.hex }), px, 0.35 + i * 0.33, pz + 0.41, g));
      });
      mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.8, 6), std(0x8a96b6), -0.55, 2.4, 0.45, g);
      mesh(new THREE.SphereGeometry(0.12, 10, 8), new THREE.MeshBasicMaterial({ color: c.hex }), -0.55, 2.85, 0.45, g);
      anim.displayLeds = leds;
      return { g, emit: new V3(-0.55, 2.85, 0.45), labelY: 3.6 };
    },
    email(c) {
      const g = new THREE.Group();
      mesh(new THREE.BoxGeometry(2.2, 1.4, 1.7), std(0xc3cce0), 0, 0.7, 0, g);
      const roof = mesh(new THREE.CylinderGeometry(1.15, 1.15, 2.4, 3), std(c.hex, { emissive: c.hex, emissiveIntensity: 0.2 }), 0, 1.72, 0, g);
      roof.rotation.z = Math.PI / 2; roof.rotation.x = Math.PI / 2; roof.scale.set(1, 1, 0.42);
      mesh(new THREE.BoxGeometry(0.95, 0.58, 0.06), new THREE.MeshBasicMaterial({ color: c.hex }), 0, 0.8, 0.88, g);
      const flap = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.07, 3), new THREE.MeshBasicMaterial({ color: 0x5a6688 }));
      flap.rotation.x = Math.PI / 2; flap.rotation.y = Math.PI; flap.position.set(0, 0.92, 0.92); flap.scale.set(1.1, 1, 0.55); g.add(flap);
      return { g, emit: new V3(0, 2.4, 0), labelY: 3.2 };
    },
    direct(c) {
      const g = new THREE.Group();
      mesh(new THREE.CylinderGeometry(1.3, 1.45, 0.3, 6), std(0xc3cce0), 0, 0.15, 0, g);
      mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.06, 32), new THREE.MeshBasicMaterial({ color: c.hex }), 0, 0.33, 0, g);
      const ring = mesh(new THREE.TorusGeometry(1.12, 0.06, 6, 40), std(0xf2f5fc, { emissive: c.hex, emissiveIntensity: 0.6 }), 0, 0.5, 0, g);
      ring.rotation.x = Math.PI / 2;
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.9, 2.8, 24, 1, true), new THREE.MeshBasicMaterial({ color: c.hex, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false, blending: THREE.NormalBlending }));
      beam.position.y = 1.7; g.add(beam);
      anim.directRing = ring; anim.directBeam = beam;
      return { g, emit: new V3(0, 0.75, 0), labelY: 3.5 };
    },
    search(c) {
      const g = new THREE.Group();
      mesh(new THREE.CylinderGeometry(0.9, 1.05, 0.4, 8), std(0xd3dbeb), 0, 0.2, 0, g);
      mesh(new THREE.CylinderGeometry(0.2, 0.4, 2.8, 8), std(0x8a96b6), 0, 1.8, 0, g);
      const head = new THREE.Group(); head.position.y = 3.35; g.add(head);
      const dish = mesh(new THREE.SphereGeometry(0.95, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2.8), std(0xf2f5fc, { side: THREE.DoubleSide, roughness: 0.4 }), 0, 0, 0, head);
      dish.rotation.x = -Math.PI / 2.4;
      mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.0, 6), std(c.hex, { emissive: c.hex, emissiveIntensity: 0.3 }), 0, 0.22, 0.4, head).rotation.x = Math.PI / 2.4;
      mesh(new THREE.SphereGeometry(0.12, 10, 8), new THREE.MeshBasicMaterial({ color: c.hex }), 0, 0.45, 0.82, head);
      anim.searchHead = head;
      return { g, emit: new V3(0, 3.7, 0), labelY: 4.7 };
    },
    social(c) {
      const g = new THREE.Group();
      mesh(new THREE.ConeGeometry(0.85, 1.1, 4), std(0xc3cce0), 0, 0.55, 0, g).rotation.y = Math.PI / 4;
      mesh(new THREE.CylinderGeometry(0.09, 0.14, 3.4, 8), std(0x8a96b6), 0, 2.7, 0, g);
      for (let i = 0; i < 3; i++) mesh(new THREE.BoxGeometry(0.65 - i * 0.15, 0.06, 0.06), std(0x8a96b6), 0, 2.0 + i * 0.7, 0, g);
      mesh(new THREE.SphereGeometry(0.2, 14, 10), new THREE.MeshBasicMaterial({ color: c.hex }), 0, 4.5, 0, g);
      const waves = [];
      for (let i = 0; i < 3; i++) {
        const w = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.035, 6, 40), new THREE.MeshBasicMaterial({ color: c.hex, transparent: true, opacity: 0.6 }));
        w.rotation.x = Math.PI / 2; w.position.y = 4.5; w.userData.phase = i / 3; g.add(w); waves.push(w);
      }
      anim.socialWaves = waves;
      return { g, emit: new V3(0, 4.5, 0), labelY: 5.5 };
    },
    referral(c) {
      const g = new THREE.Group();
      mesh(new THREE.BoxGeometry(1.5, 2.2, 1.5), std(0xc3cce0), -0.35, 1.1, -0.35, g);
      mesh(new THREE.BoxGeometry(1.1, 1.3, 1.1), std(0xd3dbeb), 0.75, 0.65, 0.75, g);
      const link = new THREE.Group(); link.position.set(-0.35, 2.75, -0.35); g.add(link);
      const lm = std(c.hex, { emissive: c.hex, emissiveIntensity: 0.5, roughness: 0.4 });
      const l1 = mesh(new THREE.TorusGeometry(0.3, 0.07, 8, 24), lm, -0.2, 0, 0, link);
      const l2 = mesh(new THREE.TorusGeometry(0.3, 0.07, 8, 24), lm, 0.2, 0, 0, link);
      l2.rotation.y = Math.PI / 2; l1.scale.set(1, 1.3, 1); l2.scale.set(1, 1.3, 1);
      anim.refLink = link;
      return { g, emit: new V3(-0.35, 2.75, -0.35), labelY: 3.9 };
    },
  };
  CH.forEach(c => {
    island(c.x, c.z, 3.2, c.hex);
    const b = builders[c.id](c);
    b.g.position.set(c.x, 0, c.z); S.add(b.g);
    c.emitW = b.emit.clone().add(new V3(c.x, 0, c.z));
    nodesOut.push({ group: b.g, id: c.id, labelY: b.labelY, kind: 'src' });
  });
  TIERS.forEach(t => {
    const g = new THREE.Group(); g.position.set(t.gw.x, 0, t.gw.z); S.add(g);
    island(t.gw.x, t.gw.z, 2.4, t.hex);
    mesh(new THREE.CylinderGeometry(0.85, 0.95, 0.35, 6), std(0xd3dbeb), 0, 0.17, 0, g);
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 2.8, 16, 1, true), new THREE.MeshBasicMaterial({ color: t.hex, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false, blending: THREE.NormalBlending }));
    col.position.y = 1.75; g.add(col);
    const ring = mesh(new THREE.TorusGeometry(0.62, 0.05, 6, 32), std(0xf2f5fc, { emissive: t.hex, emissiveIntensity: 0.8 }), 0, 2.2, 0, g);
    ring.rotation.x = Math.PI / 2;
    t.col = col; t.ring = ring;
    nodesOut.push({ group: g, id: 'gw-' + t.id, labelY: 3.4, kind: 'tier', tier: t });
  });
  const HQ_IN = new V3(-0.5, 3.2, -0.5);
  const pathMats = {};
  CH.forEach(c => {
    const t = tierById[c.tier]; let pts;
    if (c.id === 'direct') {
      const gw = new V3(t.gw.x, 0.85, t.gw.z), end = new V3(-1.6, 0.7, 1.6);
      const m1 = c.emitW.clone().lerp(gw, 0.5); m1.y = 0.8;
      const m2 = gw.clone().lerp(end, 0.5); m2.y = 0.8;
      pts = [c.emitW.clone(), m1, gw, m2, end];
    } else {
      const gw = new V3(t.gw.x, 2.2, t.gw.z);
      const m1 = c.emitW.clone().lerp(gw, 0.5); m1.y = Math.max(c.emitW.y, gw.y) + 1.6;
      const m2 = gw.clone().lerp(HQ_IN, 0.5); m2.y += 1.4;
      pts = [c.emitW.clone(), m1, gw, m2, HQ_IN.clone()];
    }
    c.curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    if (c.id === 'direct') c.curve.getSpacedPoints(14).slice(1, -1).forEach(p => mesh(new THREE.CylinderGeometry(0.05, 0.08, p.y + 0.6, 6), std(0xc3cce0), p.x, (p.y - 0.6) / 2, p.z));
    const mat = new THREE.MeshBasicMaterial({ color: c.hex, transparent: true, opacity: c.id === 'direct' ? 0.55 : 0.26, depthWrite: false });
    mat.userData.base = mat.opacity;
    S.add(new THREE.Mesh(new THREE.TubeGeometry(c.curve, 120, c.id === 'direct' ? 0.08 : 0.035, 6, false), mat));
    pathMats[c.id] = mat;
  });
  const MAX = 500, dummy = new THREE.Object3D();
  const geos = {
    paidsearch: new THREE.CylinderGeometry(0.16, 0.16, 0.05, 14), display: new THREE.BoxGeometry(0.21, 0.21, 0.21),
    email: new THREE.BoxGeometry(0.36, 0.04, 0.25), direct: new THREE.BoxGeometry(0.21, 0.19, 0.46),
    search: new THREE.SphereGeometry(0.14, 10, 8), social: new THREE.OctahedronGeometry(0.18, 0), referral: new THREE.TorusGeometry(0.12, 0.04, 6, 12),
  };
  CH.forEach(c => {
    const mat = new THREE.MeshStandardMaterial({ color: c.hex, emissive: c.hex, emissiveIntensity: 0.35, transparent: true, opacity: 1 });
    c.inst = new THREE.InstancedMesh(geos[c.id], mat, MAX);
    c.inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    c.inst.count = 0; c.inst.frustumCulled = false; S.add(c.inst);
    c.parts = []; c.acc = 0; c.dayVis = 0; c.shownVis = 0;
  });

  // =====================================================================
  // INSIDE: rooms people walk through (rebuilt when the article list changes)
  // =====================================================================
  const ROOM = {
    home: { a: -16, b: 0, s: 6, hex: 0x4f7fe0, css: '#4f7fe0', title: 'First page', labelY: 2.4 },
    exitBounce: { a: -17, b: -10, s: 3.4, hex: 0xe45a43, css: 'var(--exit)', title: 'Left after one page', labelY: 2.7 },
    signin: { a: -7, b: -7, s: 4.6, hex: 0x16a9cc, css: 'var(--signed)', title: 'Signed in', labelY: 2.2 },
    goal: { a: 24, b: 0, s: 5, hex: 0xe2a300, css: 'var(--c-goal)', title: 'Converted', labelY: 3.3 },
    exitBrowse: { a: 20, b: -10, s: 3.4, hex: 0xe45a43, css: 'var(--exit)', title: 'Left without converting', labelY: 2.7 },
  };
  const ART_HEX = [0x6b7fe6, 0xd9893a, 0x1e9e78], ART_CSS = ['#6b7fe6', '#d9893a', '#1e9e78'];
  const CORRIDOR = { a0: 7, a1: 17.5, b: 0 };
  const DOOR = { a: -22.5, b: 0 };
  const DEPTH_MARK = [8.5, 10.5, 12.5, 14.5, 16.5]; // 2, 3, 4, 5, 6+ pages
  let rooms = {}, nodesIn = [], gem = null, walkerBody = null, walkerHead = null, artShown = [];
  const WMAX = 650, walkers = [];

  function wall(cx, cz, s, h, color) {
    const m = new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.3, roughness: 0.5, depthWrite: false });
    const w1 = new THREE.Mesh(new THREE.BoxGeometry(0.1, h, s), m); w1.position.set(cx - s / 2, h / 2, cz); S.add(w1);
    const w2 = new THREE.Mesh(new THREE.BoxGeometry(s, h, 0.1), m); w2.position.set(cx, h / 2, cz - s / 2); S.add(w2);
    const g = new THREE.BufferGeometry().setFromPoints([new V3(cx - s / 2, h, cz + s / 2), new V3(cx - s / 2, h, cz - s / 2), new V3(cx + s / 2, h, cz - s / 2)]);
    S.add(new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.8 })));
  }
  function walkway(a1, b1, a2, b2) {
    const p = toXZ(a1, b1), q = toXZ(a2, b2);
    const dx = q.x - p.x, dz = q.z - p.z, len = Math.hypot(dx, dz);
    const m = new THREE.Mesh(new THREE.BoxGeometry(len, 0.08, 0.7), new THREE.MeshStandardMaterial({ color: 0xd4dbe9, roughness: 0.9 }));
    m.position.set((p.x + q.x) / 2, -0.06, (p.z + q.z) / 2); m.rotation.y = -Math.atan2(dz, dx); m.receiveShadow = true; S.add(m);
  }
  function gate(x, z, hex, label) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = Math.PI / 4; S.add(g);
    const m = std(hex, { emissive: hex, emissiveIntensity: 0.35 });
    mesh(new THREE.BoxGeometry(0.16, 1.8, 0.16), m, -0.9, 0.9, 0, g); mesh(new THREE.BoxGeometry(0.16, 1.8, 0.16), m, 0.9, 0.9, 0, g);
    mesh(new THREE.BoxGeometry(2.0, 0.16, 0.16), m, 0, 1.8, 0, g);
    if (label) { const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.4), new THREE.MeshBasicMaterial({ map: textTexture([[label, 40, 32, '#e45a43']], 256, 64, '#fde9e5') })); sign.position.set(0, 2.15, 0.01); g.add(sign); }
    return g;
  }

  function buildInterior(articleNames, order) {
    while (sceneIn.children.length) sceneIn.remove(sceneIn.children[0]);
    S = sceneIn;
    addLights(sceneIn, 1, -1);
    rooms = {}; nodesIn = [];
    artShown = order.slice(0, 3);
    Object.entries(ROOM).forEach(([k, v]) => rooms[k] = Object.assign({}, v));
    const bs = artShown.length === 1 ? [0] : artShown.length === 2 ? [-5, 5] : [-10, 0, 10];
    if (!artShown.length) rooms['art-0'] = { a: 1, b: 0, s: 4.4, hex: 0x9aa3bd, css: 'var(--faint)', title: 'Articles', labelY: 2.4, empty: true };
    artShown.forEach((k, j) => rooms['art-' + j] = { a: 1, b: bs[j], s: 4.4, hex: ART_HEX[j], css: ART_CSS[j], title: articleNames[k], labelY: 2.4, article: k });
    const art = Object.keys(rooms).filter(k => k.startsWith('art-'));
    // Walkways under the rooms
    walkway(DOOR.a, DOOR.b, rooms.home.a, rooms.home.b);
    walkway(rooms.home.a, rooms.home.b, rooms.exitBounce.a, rooms.exitBounce.b);
    walkway(rooms.home.a, rooms.home.b, rooms.signin.a, rooms.signin.b);
    art.forEach(k => { walkway(rooms.home.a, rooms.home.b, rooms[k].a, rooms[k].b); walkway(rooms.signin.a, rooms.signin.b, rooms[k].a, rooms[k].b); walkway(rooms[k].a, rooms[k].b, CORRIDOR.a0, CORRIDOR.b); });
    walkway(rooms.home.a, rooms.home.b, CORRIDOR.a0, CORRIDOR.b);
    walkway(CORRIDOR.a1, CORRIDOR.b, rooms.goal.a, rooms.goal.b);
    walkway(CORRIDOR.a1, CORRIDOR.b, rooms.exitBrowse.a, rooms.exitBrowse.b);
    // Rooms
    Object.entries(rooms).forEach(([k, def]) => {
      const p = toXZ(def.a, def.b);
      island(p.x, p.z, def.s, def.hex, { top: 0xffffff, h: 0.4 });
      const glow = new THREE.Mesh(new THREE.BoxGeometry(def.s * 0.94, 0.02, def.s * 0.94), new THREE.MeshBasicMaterial({ color: def.hex, transparent: true, opacity: 0.07 }));
      glow.position.set(p.x, 0.02, p.z); S.add(glow);
      if (k.startsWith('exit')) gate(p.x, p.z, def.hex, 'EXIT');
      else wall(p.x, p.z, def.s, k === 'home' ? 1.6 : 1.2, def.hex);
      if (k === 'home') {
        const screen = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.1), new THREE.MeshBasicMaterial({ map: textTexture([['Welcome', 46, 50, '#1b2340'], ['your first page', 22, 98, '#5a6482']], 320, 140, '#eef2fb') }));
        screen.position.set(p.x - def.s / 2 + 0.07, 0.95, p.z); screen.rotation.y = Math.PI / 2; S.add(screen);
        const d = toXZ(DOOR.a + 2.2, DOOR.b);
        const g = new THREE.Group(); g.position.set(d.x, 0, d.z); g.rotation.y = -Math.PI / 4; S.add(g);
        const m = std(0xf2f5fc, { emissive: 0x4f7fe0, emissiveIntensity: 0.5 });
        mesh(new THREE.BoxGeometry(0.16, 2.0, 0.16), m, -0.85, 1.0, 0, g); mesh(new THREE.BoxGeometry(0.16, 2.0, 0.16), m, 0.85, 1.0, 0, g);
        mesh(new THREE.BoxGeometry(1.86, 0.16, 0.16), m, 0, 2.0, 0, g);
      }
      if (k === 'signin') {
        mesh(new THREE.BoxGeometry(1.6, 0.8, 0.7), std(0xc3cce0), p.x - 0.6, 0.4, p.z - 0.9);
        mesh(new THREE.BoxGeometry(0.5, 0.06, 0.4), new THREE.MeshBasicMaterial({ color: def.hex }), p.x - 0.6, 0.84, p.z - 0.9);
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.55), new THREE.MeshBasicMaterial({ map: textTexture([['Sign in', 34, 40, '#16a9cc']], 200, 80, '#e3f6fb') }));
        sign.position.set(p.x - def.s / 2 + 0.07, 0.85, p.z + 0.8); sign.rotation.y = Math.PI / 2; S.add(sign);
      }
      if (k.startsWith('art-')) {
        const shelfMat = std(0xc3cce0);
        for (let s = 0; s < 2; s++) {
          mesh(new THREE.BoxGeometry(0.45, 1.0, 1.4), shelfMat, p.x - def.s / 2 + 0.3, 0.5, p.z - 0.9 + s * 1.8);
          for (let r = 0; r < 3; r++) mesh(new THREE.BoxGeometry(0.05, 0.2, 1.2), new THREE.MeshBasicMaterial({ color: def.hex }), p.x - def.s / 2 + 0.55, 0.22 + r * 0.32, p.z - 0.9 + s * 1.8);
        }
        mesh(new THREE.BoxGeometry(0.5, 0.75, 0.4), std(0xd3dbeb), p.x + 0.3, 0.37, p.z - 0.2);
        mesh(new THREE.BoxGeometry(0.6, 0.04, 0.5), new THREE.MeshBasicMaterial({ color: def.hex }), p.x + 0.3, 0.77, p.z - 0.2);
      }
      if (k === 'goal') {
        mesh(new THREE.CylinderGeometry(1.4, 1.6, 0.5, 6), std(0xc3cce0), p.x, 0.25, p.z);
        gem = mesh(new THREE.OctahedronGeometry(0.75, 0), std(def.hex, { emissive: def.hex, emissiveIntensity: 0.45, roughness: 0.3, metalness: 0.4, flatShading: true }), p.x, 2.0, p.z);
      }
      nodesIn.push({ id: k, pos: new V3(p.x, def.labelY, p.z), def });
    });
    // Browse corridor with page markers
    const c0 = toXZ(CORRIDOR.a0, CORRIDOR.b), c1 = toXZ(CORRIDOR.a1, CORRIDOR.b);
    const len = Math.hypot(c1.x - c0.x, c1.z - c0.z);
    const cg = new THREE.Group(); cg.position.set((c0.x + c1.x) / 2, 0, (c0.z + c1.z) / 2); cg.rotation.y = Math.PI / 4; S.add(cg);
    const side = std(0xdce2ee);
    const floor = new THREE.Mesh(new THREE.BoxGeometry(len, 0.4, 2.6), [side, side, std(0xffffff), side, side, side]);
    floor.position.y = -0.2; floor.receiveShadow = true; cg.add(floor);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(len, 0.4, 2.6)), new THREE.LineBasicMaterial({ color: 0x2f86c4, transparent: true, opacity: 0.5 }));
    edges.position.y = -0.2; cg.add(edges);
    const back = new THREE.Mesh(new THREE.BoxGeometry(len, 1.2, 0.1), new THREE.MeshStandardMaterial({ color: 0x2f86c4, transparent: true, opacity: 0.22, depthWrite: false }));
    back.position.set(0, 0.6, -1.3); cg.add(back);
    ['2', '3', '4', '5', '6+'].forEach((t, i) => {
      const p = toXZ(DEPTH_MARK[i], CORRIDOR.b);
      const lx = (p.x - cg.position.x) * Math.SQRT1_2 - (p.z - cg.position.z) * Math.SQRT1_2;
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ map: textTexture([[t, 54, 52, '#1b2340'], ['pages', 20, 100, '#5a6482']], 128, 128, '#eef2fb') }));
      panel.position.set(lx, 0.75, -1.22); cg.add(panel);
    });
    rooms.browse = { a: (CORRIDOR.a0 + CORRIDOR.a1) / 2, b: 0, css: '#2f86c4', title: 'Kept browsing' };
    const bp = toXZ(rooms.browse.a, -1.4);
    nodesIn.push({ id: 'browse', pos: new V3(bp.x, 1.7, bp.z), def: rooms.browse });
    // Walkers: body + head, instanced, coloured per walker
    walkerBody = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.17, 0.48, 8), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }), WMAX);
    walkerHead = new THREE.InstancedMesh(new THREE.SphereGeometry(0.12, 10, 8), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 }), WMAX);
    const white = new THREE.Color(0xffffff);
    for (let i = 0; i < WMAX; i++) { walkerBody.setColorAt(i, white); walkerHead.setColorAt(i, white); }
    [walkerBody, walkerHead].forEach(m => { m.count = 0; m.frustumCulled = false; m.castShadow = true; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); S.add(m); });
    walkers.length = 0;
    buildLabelsIn();
  }

  // ---- Walkers follow the filtered numbers ----
  const P = { pBounce: 0, pLogin: 0, pRead: [], depth: 3, pConv: 0, weights: CH.map(() => 0), hasDepth: false };
  const COL = { head: new THREE.Color(0x2f3858), signed: new THREE.Color(0x16a9cc), gold: new THREE.Color(0xe2a300) };
  const chCol = CH.map(c => new THREE.Color(c.hex));
  function spot(def, spread) { const p = toXZ(def.a, def.b), s = def.s * spread; return new V3(p.x + (Math.random() - 0.5) * 2 * s, 0, p.z + (Math.random() - 0.5) * 2 * s); }
  function corridorSpot(a) { const p = toXZ(a, CORRIDOR.b + 0.1 + Math.random() * 0.7); return new V3(p.x, 0, p.z); }
  function pickChannel() {
    const tot = P.weights.reduce((s, v) => s + v, 0); if (!tot) return -1;
    let r = Math.random() * tot;
    for (let i = 0; i < CH.length; i++) { r -= P.weights[i]; if (r <= 0) return i; }
    return CH.length - 1;
  }
  function spawnWalker() {
    if (walkers.length >= WMAX) return null;
    const ci = pickChannel(); if (ci < 0) return null;
    const d = toXZ(DOOR.a, DOOR.b);
    const pts = [new V3(d.x, 0, d.z), spot(rooms.home, 0.3)], dw = [0, 0.4 + Math.random() * 0.4], ev = [null, null];
    if (Math.random() < P.pBounce) { pts.push(spot(rooms.exitBounce, 0.2)); dw.push(0); ev.push('exit'); }
    else {
      if (Math.random() < P.pLogin) { pts.push(spot(rooms.signin, 0.3)); dw.push(0.7); ev.push('signin'); }
      artShown.forEach((k, j) => { if (Math.random() < (P.pRead[k] || 0)) { pts.push(spot(rooms['art-' + j], 0.3)); dw.push(1.2 + Math.random()); ev.push(null); } });
      pts.push(corridorSpot(CORRIDOR.a0 + 0.4)); dw.push(0); ev.push(null);
      let depth = 2;
      if (P.hasDepth) depth = Math.min(6, 2 + Math.floor(-Math.log(1 - Math.random()) * Math.max(0.2, P.depth - 2)));
      pts.push(corridorSpot(DEPTH_MARK[depth - 2])); dw.push(0.4); ev.push(null);
      if (Math.random() < P.pConv) { pts.push(spot(rooms.goal, 0.25)); dw.push(0.8); ev.push('goal'); }
      else { pts.push(spot(rooms.exitBrowse, 0.2)); dw.push(0); ev.push('exit'); }
    }
    const w = { ci, pts, dw, ev, seg: 0, t: 0, wait: 0, pos: pts[0].clone(), head: COL.head, sp: 2.2 + Math.random() * 0.8, phase: Math.random() * 6, fade: 1, born: 0 };
    walkers.push(w);
    return w;
  }
  let walkAcc = 0;
  function updateWalkers(dt, time) {
    if (!walkerBody) return;
    walkAcc += P.weights.reduce((s, v) => s + v, 0) / PARTICLE_VISITS / 60 * dt;
    while (walkAcc >= 1) { walkAcc -= 1; spawnWalker(); }
    for (let i = walkers.length - 1; i >= 0; i--) {
      const w = walkers[i];
      w.born = Math.min(1, w.born + dt * 3);
      if (w.wait > 0) w.wait -= dt;
      else if (w.seg < w.pts.length - 1) {
        const a = w.pts[w.seg], b = w.pts[w.seg + 1];
        w.t += (w.sp * dt) / (a.distanceTo(b) || 0.001);
        if (w.t >= 1) {
          w.t = 0; w.seg++; w.wait = w.dw[w.seg] || 0; w.pos.copy(b);
          const e = w.ev[w.seg];
          if (e === 'signin') w.head = COL.signed;
          if (e === 'goal') { w.head = COL.gold; gemPulse = 1; }
        } else w.pos.lerpVectors(a, b, w.t);
      } else {
        w.fade -= dt * 1.6;
        if (w.fade <= 0) { walkers.splice(i, 1); continue; }
      }
    }
    if (scene !== 'in') return;
    let n = 0;
    for (const w of walkers) {
      const moving = w.wait <= 0 && w.seg < w.pts.length - 1;
      const bob = moving && !RM ? Math.abs(Math.sin(time * 9 + w.phase)) * 0.06 : 0;
      const sc = Math.max(0.001, Math.min(w.born, w.fade));
      dummy.position.set(w.pos.x, 0.24 * sc + bob, w.pos.z); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(sc); dummy.updateMatrix();
      walkerBody.setMatrixAt(n, dummy.matrix);
      dummy.position.y = 0.6 * sc + bob; dummy.updateMatrix();
      walkerHead.setMatrixAt(n, dummy.matrix);
      walkerBody.setColorAt(n, chCol[w.ci]);
      walkerHead.setColorAt(n, w.head);
      n++;
    }
    walkerBody.count = n; walkerHead.count = n;
    walkerBody.instanceMatrix.needsUpdate = true; walkerHead.instanceMatrix.needsUpdate = true;
    if (walkerBody.instanceColor) walkerBody.instanceColor.needsUpdate = true;
    if (walkerHead.instanceColor) walkerHead.instanceColor.needsUpdate = true;
  }

  // ---------- Labels ----------
  const labelsOut = el('labelsOut'), labelsIn = el('labelsIn');
  const tagsOut = {}, tagsIn = {};
  nodesOut.forEach(nd => {
    const t = document.createElement('div'); let title, color;
    if (nd.kind === 'tier') { t.className = 'tag tier'; t.style.setProperty('--t', nd.tier.css); title = nd.tier.name; color = nd.tier.css; }
    else if (nd.kind === 'src') { t.className = 'tag src'; const c = byId[nd.id]; title = c.short; color = c.css; }
    else { t.className = 'tag'; title = 'Website'; color = 'var(--fg)'; }
    t.innerHTML = '<b style="color:' + color + '">' + title + '</b><span>—</span>';
    if (nd.id === 'hq') {
      const go = document.createElement('button'); go.type = 'button'; go.className = 'go'; go.textContent = 'Go inside →';
      go.addEventListener('click', () => { hideTour(); goScene('in'); });
      t.appendChild(go);
    }
    labelsOut.appendChild(t);
    tagsOut[nd.id] = { el: t, val: t.querySelector('span'), pos: new V3(nd.group.position.x, nd.labelY, nd.group.position.z) };
  });
  function buildLabelsIn() {
    labelsIn.innerHTML = ''; for (const k in tagsIn) delete tagsIn[k];
    nodesIn.forEach(nd => {
      const t = document.createElement('div'); t.className = 'tag room'; t.style.setProperty('--rc', nd.def.css);
      t.innerHTML = '<b>' + esc(nd.def.title) + '</b><span>—</span>';
      labelsIn.appendChild(t);
      tagsIn[nd.id] = { el: t, val: t.querySelector('span'), pos: nd.pos };
    });
  }
  const pv = new V3();
  function placeLabels(tags) {
    const w = stage.clientWidth, h = stage.clientHeight;
    for (const k in tags) {
      const L = tags[k]; pv.copy(L.pos).project(camera);
      L.el.style.transform = 'translate(' + ((pv.x * 0.5 + 0.5) * w).toFixed(1) + 'px,' + ((-pv.y * 0.5 + 0.5) * h).toFixed(1) + 'px) translate(-50%,-100%)';
    }
  }

  // ---------- Numbers drawer: channels ----------
  const tiersEl = el('tiers');
  TIERS.forEach(t => {
    const box = document.createElement('div'); box.className = 'tier'; box.style.setProperty('--t', t.css);
    box.innerHTML = '<div class="thead" tabindex="0" role="button"><span class="tn">' + t.name + '</span><span class="tr"><span class="trv">—</span> <small>/day</small></span><span class="td">—</span></div><div class="rows"></div>';
    tiersEl.appendChild(box);
    t.box = box; t.trv = box.querySelector('.trv'); t.td = box.querySelector('.td');
    const head = box.querySelector('.thead');
    const act = () => followSet(t.channels.map(c => CH.indexOf(c)));
    head.addEventListener('click', act);
    head.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(); } });
    const rowsEl = box.querySelector('.rows');
    t.channels.forEach(c => {
      const r = document.createElement('div'); r.className = 'row'; r.tabIndex = 0; r.setAttribute('role', 'button');
      r.style.setProperty('--c', c.css);
      r.innerHTML = '<span class="nm">' + c.name + '<code>' + c.adobe + '</code></span><span class="rate"><span class="rv">—</span> <small>/day</small></span>' +
        '<span class="bar"><i style="width:0%"></i></span><span class="meta">—</span><canvas width="176" height="48"></canvas>';
      rowsEl.appendChild(r);
      c.row = r; c.rv = r.querySelector('.rv'); c.barEl = r.querySelector('.bar i'); c.metaEl = r.querySelector('.meta'); c.spark = r.querySelector('canvas');
      const go = () => followSet([CH.indexOf(c)]);
      r.addEventListener('click', go);
      r.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    });
  });
  const cssVar = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  function drawSpark(c, series, mark) {
    const cv = c.spark, x = cv.getContext('2d'), W = cv.width, H = cv.height;
    x.clearRect(0, 0, W, H);
    const col = cssVar('--c-' + c.id);
    x.strokeStyle = cssVar('--line'); x.lineWidth = 1; x.beginPath(); x.moveTo(0, H - 1); x.lineTo(W, H - 1); x.stroke();
    if (series.length < 2) return;
    const max = Math.max(...series) || 1;
    const px = i => (i / (series.length - 1)) * (W - 8) + 4, py = v => H - 4 - (v / max) * (H - 10);
    if (mark != null) { x.strokeStyle = cssVar('--muted'); x.globalAlpha = 0.6; x.beginPath(); x.moveTo(px(mark), 2); x.lineTo(px(mark), H); x.stroke(); x.globalAlpha = 1; }
    x.beginPath(); series.forEach((v, i) => i ? x.lineTo(px(i), py(v)) : x.moveTo(px(i), py(v)));
    x.lineTo(px(series.length - 1), H); x.lineTo(px(0), H); x.closePath();
    x.globalAlpha = 0.18; x.fillStyle = col; x.fill(); x.globalAlpha = 1;
    x.beginPath(); series.forEach((v, i) => i ? x.lineTo(px(i), py(v)) : x.moveTo(px(i), py(v)));
    x.strokeStyle = col; x.lineWidth = 2.5; x.stroke();
    const e = mark != null ? mark : series.length - 1;
    x.beginPath(); x.arc(px(e), py(series[e]), 4, 0, Math.PI * 2); x.fillStyle = col; x.fill();
  }

  // ---------- State ----------
  let D = null, A = null, T = null, Tall = null, SAMPLE = null;
  let PARTICLE_VISITS = 50, gemPulse = 0;
  const F = { day: null, region: null, country: null, devices: new Set(), users: new Set(), ages: new Set(), channels: new Set() };
  let scene = 'out';

  function dateLabel(s, long) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) return s;
    return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString('en-GB', long ? { weekday: 'long', day: 'numeric', month: 'long' } : { weekday: 'short', day: 'numeric', month: 'short' });
  }
  function periodText() {
    const L = D.lists.date, n = L.length;
    if (F.day != null) return 'On ' + dateLabel(L[F.day], true);
    if (n > 1 && /^\d{4}-/.test(L[0])) {
      const f = s => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s); return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' }); };
      return 'Between ' + f(L[0]) + ' and ' + f(L[n - 1]);
    }
    return 'In this report';
  }

  function chip(label, pressed, onClick, color) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'chip';
    if (color) { b.style.setProperty('--c', color); b.innerHTML = '<span class="sw"></span>' + esc(label); } else b.textContent = label;
    b.setAttribute('aria-pressed', pressed ? 'true' : 'false');
    b.addEventListener('click', onClick); return b;
  }
  function renderFilters() {
    const L = D.lists;
    const ff = el('fFollow'); ff.innerHTML = '';
    ff.appendChild(chip('Everyone', F.channels.size === 0, () => followSet([])));
    CH.forEach((c, i) => ff.appendChild(chip(c.name, F.channels.has(i), () => followSet(F.channels.size === 1 && F.channels.has(i) ? [] : [i]), c.css)));
    const fr = el('fRegion'); fr.innerHTML = '';
    fr.appendChild(chip('All', F.region == null, () => { F.region = null; F.country = null; refresh(); }));
    L.region.forEach((r, i) => fr.appendChild(chip(r, F.region === i, () => { F.region = F.region === i ? null : i; if (F.country != null && F.region != null && !D.regionCountries[F.region].has(F.country)) F.country = null; refresh(); })));
    fr.closest('.fg').hidden = L.region.length <= 1;
    const sel = el('fCountry');
    const allowed = L.country.map((c, i) => i).filter(i => F.region == null || D.regionCountries[F.region].has(i));
    sel.innerHTML = '<option value="">All countries</option>' + allowed.map(i => '<option value="' + i + '"' + (F.country === i ? ' selected' : '') + '>' + esc(L.country[i]) + '</option>').join('');
    sel.closest('.fg').hidden = L.country.length <= 1;
    const multi = (id, key, list) => {
      const box = el(id); box.innerHTML = '';
      const set = F[key];
      box.appendChild(chip('All', set.size === 0, () => { set.clear(); refresh(); }));
      list.forEach((v, i) => box.appendChild(chip(v, set.has(i), () => { set.has(i) ? set.delete(i) : set.add(i); if (set.size === list.length) set.clear(); refresh(); })));
      box.closest('.fg').hidden = list.length <= 1;
    };
    multi('fDevice', 'devices', L.device);
    multi('fUser', 'users', L.user);
    multi('fAge', 'ages', L.age);
    const nD = L.date.length;
    el('dateGroup').hidden = nD <= 1;
    const r = el('fDay'); r.max = Math.max(0, nD - 1); r.value = F.day == null ? 0 : F.day;
    el('fAllDays').setAttribute('aria-pressed', F.day == null ? 'true' : 'false');
    el('fDayLbl').textContent = F.day == null ? (nD > 1 ? dateLabel(L.date[0]) + ' – ' + dateLabel(L.date[nD - 1]) : '') : dateLabel(L.date[F.day]);
  }
  function followSet(list) { F.channels = new Set(list); refresh(); restartTour(); }

  function bars(container, key, names, agg, isSel, hasSel, onPick, color, limit) {
    const box = el(container); box.innerHTML = '';
    const vis = agg.vis, conv = agg.conv;
    const idx = names.map((_, i) => i).filter(i => vis[i] > 0);
    if (key === 'country') idx.sort((a, b) => vis[b] - vis[a]);
    const max = Math.max(1, ...idx.map(i => vis[i]));
    const total = idx.reduce((s, i) => s + vis[i], 0);
    const shown = limit ? idx.slice(0, limit) : idx;
    shown.forEach(i => {
      const b = document.createElement('button'); b.type = 'button';
      b.className = 'bk' + (isSel(i) ? ' on' : hasSel ? ' off' : '');
      b.style.setProperty('--bc', typeof color === 'function' ? color(i) : color);
      const sub = key === 'country' ? '<small>' + esc(regionOfCountry(i)) + '</small>' : '';
      b.innerHTML = '<span class="bn">' + esc(names[i]) + sub + '</span><span class="bb"><i style="width:' + (vis[i] / max * 100).toFixed(1) + '%"></i></span>' +
        '<span class="bv">' + fmt(vis[i] / A.nDays) + '/d · ' + pct(vis[i], total) + '<small>' + pct(conv[i], vis[i], 1) + '</small></span>';
      b.setAttribute('aria-pressed', isSel(i) ? 'true' : 'false');
      b.addEventListener('click', () => onPick(i));
      box.appendChild(b);
    });
    if (!shown.length) box.innerHTML = '<div class="more">No visits for these filters.</div>';
    if (limit && idx.length > limit) { const m = document.createElement('div'); m.className = 'more'; m.textContent = (idx.length - limit) + ' more countries with fewer visits'; box.appendChild(m); }
  }
  function regionOfCountry(ci) { for (let r = 0; r < D.lists.region.length; r++) if (D.regionCountries[r].has(ci)) return D.lists.region[r]; return ''; }
  function toggle(set, i, n) { set.has(i) ? set.delete(i) : set.add(i); if (set.size === n) set.clear(); refresh(); }

  function refresh() {
    A = aggregate(D, F);
    T = totals(D, A, F.channels);
    Tall = totals(D, A, null);
    const L = D.lists, nD = L.date.length, nDays = A.nDays, has = D.meta.has;
    renderFilters();
    const followed = i => F.channels.size === 0 || F.channels.has(i);
    CH.forEach((c, i) => {
      c.dayVis = A.ch.vis[i] / nDays;
      const dim = !followed(i);
      pathMats[c.id].opacity = dim ? 0.05 : pathMats[c.id].userData.base;
      c.inst.material.opacity = dim ? 0.1 : 1;
      tagsOut[c.id].el.classList.toggle('dim', dim);
      const reach = A.ch.reach[i];
      tagsOut[c.id].val.innerHTML = '<em>' + fmt(c.dayVis) + '</em> visits/day' + (reach && c.reachNoun ? '<br>from ' + fmt(reach / nDays) + ' ' + c.reachNoun : '');
    });
    TIERS.forEach(t => {
      const tv = t.channels.reduce((s, c) => s + c.dayVis, 0);
      t.dayVis = tv;
      tagsOut['gw-' + t.id].val.textContent = fmt(tv) + ' /day · ' + pct(tv * nDays, Tall.vis);
      tagsOut['gw-' + t.id].el.classList.toggle('dim', F.channels.size > 0 && !t.channels.some(c => followed(CH.indexOf(c))));
    });
    tagsOut.hq.val.textContent = fmt(T.vis / nDays) + ' visits/day' + (F.channels.size ? ' you are following' : '');
    // Walker behaviour from the followed visitors
    const stay = Math.max(0, T.vis - T.bounces);
    P.weights = CH.map((c, i) => followed(i) ? A.ch.vis[i] / nDays : 0);
    P.pBounce = has.bounces && T.vis ? T.bounces / T.vis : 0;
    P.pLogin = has.logins && stay ? Math.min(1, T.logins / stay) : 0;
    P.pRead = Array.from(T.reads, r => stay ? Math.min(1, r / stay) : 0);
    P.hasDepth = has.pv && stay > 0;
    P.depth = P.hasDepth ? (T.pv - T.bounces) / stay : 3;
    P.pConv = stay ? Math.min(1, T.conv / stay) : 0;
    // Room labels: exact numbers
    const per = v => fmt(v / nDays);
    const setRoom = (k, html) => { if (tagsIn[k]) tagsIn[k].val.innerHTML = html; };
    setRoom('home', '<em>' + per(T.vis) + '</em> visits a day arrive here');
    setRoom('exitBounce', has.bounces ? '<em>' + pct(T.bounces, T.vis) + '</em> of visits · ' + per(T.bounces) + '/day' : 'Add a Bounces column to see this');
    setRoom('signin', has.logins ? '<em>' + pct(T.logins, T.vis) + '</em> of visits · ' + per(T.logins) + '/day' : 'Add a Logins column to see this');
    Object.keys(tagsIn).filter(k => k.startsWith('art-')).forEach(k => {
      const r = rooms[k];
      setRoom(k, r.empty ? 'Add "Read: title" columns to see this' : '<em>' + per(T.reads[r.article]) + '</em> reads a day · ' + pct(T.reads[r.article], T.vis) + ' of visits');
    });
    setRoom('browse', P.hasDepth ? '<em>' + P.depth.toFixed(1) + ' pages</em> on average for those who stayed' : 'Add a Page views column to see this');
    setRoom('goal', '<em>' + per(T.conv) + '</em> a day · ' + pct(T.conv, T.vis, 1) + ' of visits');
    setRoom('exitBrowse', '<em>' + pct(Math.max(0, stay - T.conv), T.vis) + '</em> of visits');
    // KPIs
    el('kVisitsLbl').textContent = F.day == null && nD > 1 ? 'Visits (' + nD + ' days)' : 'Visits';
    el('kVisits').innerHTML = fmt(T.vis) + (F.day == null && nD > 1 ? '<small>' + fmt(T.vis / nDays) + '/day</small>' : '');
    el('kLogin').innerHTML = has.logins ? pct(T.logins, T.vis) + '<small>of visits</small>' : '—';
    el('kConv').textContent = fmt(T.conv);
    el('kCvr').innerHTML = T.vis ? (T.conv / T.vis * 100).toFixed(2) + '<small>%</small>' : '—';
    // Drawer
    TIERS.forEach(t => {
      const tv = t.dayVis, tc = t.channels.reduce((s, c) => s + A.ch.conv[CH.indexOf(c)], 0) / nDays;
      t.trv.textContent = fmt(tv);
      t.td.textContent = t.desc + ' · ' + pct(tv * nDays, Tall.vis) + ' of visits · CVR ' + pct(tc, tv, 1);
      t.box.classList.toggle('off', F.channels.size > 0 && !t.channels.some(c => followed(CH.indexOf(c))));
      t.channels.forEach(c => {
        const ci = CH.indexOf(c);
        c.rv.textContent = fmt(c.dayVis);
        c.barEl.style.width = (tv ? c.dayVis / tv * 100 : 0).toFixed(1) + '%';
        c.metaEl.textContent = pct(c.dayVis, tv) + ' of ' + t.name.toLowerCase() + ' · CVR ' + pct(A.ch.conv[ci], A.ch.vis[ci], 1);
        c.row.classList.toggle('on', F.channels.has(ci));
        c.row.classList.toggle('off', F.channels.size > 0 && !F.channels.has(ci));
        drawSpark(c, Array.from(A.chDay.subarray(ci * nD, ci * nD + nD)), F.day);
      });
    });
    const ageCols = ['#2f86c4', '#6f5fc9', '#c46c32', '#0fa58b', '#e8661c', '#b4884a', '#e0418a', '#5f9e12'];
    bars('bkAge', 'age', L.age, A.bk.age, i => F.ages.has(i), F.ages.size > 0, i => toggle(F.ages, i, L.age.length), i => ageCols[i % ageCols.length]);
    bars('bkDevice', 'device', L.device, A.bk.device, i => F.devices.has(i), F.devices.size > 0, i => toggle(F.devices, i, L.device.length), 'var(--c-search)');
    bars('bkUser', 'user', L.user, A.bk.user, i => F.users.has(i), F.users.size > 0, i => toggle(F.users, i, L.user.length), i => L.user[i] === 'Internal' ? 'var(--t-owned)' : 'var(--c-direct)');
    bars('bkRegion', 'region', L.region, A.bk.region, i => F.region === i, F.region != null, i => { F.region = F.region === i ? null : i; F.country = null; refresh(); }, 'var(--t-earned)');
    bars('bkCountry', 'country', L.country, A.bk.country, i => F.country === i, F.country != null, i => { F.country = F.country === i ? null : i; refresh(); }, 'var(--t-paid)', 15);
    // Summary chip on the stage
    const parts = [F.channels.size ? [...F.channels].map(i => CH[i].name).join(' + ') + ' visitors' : 'All visitors'];
    if (F.region != null) parts.push(L.region[F.region]);
    if (F.country != null) parts.push(L.country[F.country]);
    if (F.devices.size) parts.push([...F.devices].map(i => L.device[i]).join(' + '));
    if (F.users.size) parts.push([...F.users].map(i => L.user[i]).join(' + ') + ' users');
    if (F.ages.size) parts.push('Age ' + [...F.ages].sort((a, b) => a - b).map(i => L.age[i]).join(', '));
    const when = F.day != null ? dateLabel(L.date[F.day]) : nD > 1 ? 'daily average' : '';
    el('viewSum').innerHTML = '<b>' + esc(parts[0]) + '</b>' + (parts.length > 1 ? ' · ' + esc(parts.slice(1).join(' · ')) : '') + (when ? ' · ' + esc(when) : '');
    el('fReset').disabled = !(parts.length > 1 || F.day != null || F.channels.size);
    renderLegend();
    rebuildStory();
  }

  function renderLegend() {
    const lg = el('legend');
    if (scene === 'out') lg.innerHTML = '<span><i style="background:var(--fg)"></i>Each shape ≈ ' + fmt(PARTICLE_VISITS) + ' visits</span><span>1 minute here ≈ 1 day</span><span>Click a building to follow it</span>';
    else lg.innerHTML = '<span><i style="background:var(--fg)"></i>Each walker ≈ ' + fmt(PARTICLE_VISITS) + ' visits; body colour shows where they came from</span><span><i style="background:var(--signed)"></i>Signed in</span><span><i style="background:var(--c-goal)"></i>Converted</span>';
  }

  // ---------- Tour ----------
  let steps = [], stepIdx = 0, tourOpen = true;
  const storyEl = el('story');
  function rebuildStory() {
    const sel = F.channels.size ? [...F.channels].map(i => CH[i]) : null;
    steps = buildSteps({ D, A, T, Tall, sel, period: periodText(), nDays: A.nDays, N: PARTICLE_VISITS });
    if (stepIdx >= steps.length) stepIdx = steps.length - 1;
    renderStory(false);
  }
  function restartTour() { stepIdx = 0; tourOpen = true; renderStory(true); }
  function hideTour() { if (tourOpen) { tourOpen = false; renderStory(false); } }
  function renderStory(move) {
    if (!tourOpen) {
      storyEl.className = 'story closed';
      storyEl.innerHTML = '<button type="button" class="primary" id="tourOpen">' + (stepIdx > 0 ? 'Resume the tour' : 'Take the guided tour') + '</button>';
      el('tourOpen').addEventListener('click', () => { tourOpen = true; renderStory(true); });
      highlight([]);
      return;
    }
    storyEl.className = 'story';
    const s = steps[stepIdx];
    let fun = '';
    if (s.funnel) {
      const max = s.funnel[0][1] || 1;
      fun = '<div class="funnel" style="--c:' + s.color + '">' + s.funnel.map(([l, v]) => '<div class="fstep"><span class="fl2">' + esc(l) + '</span><span class="fb"><i style="width:' + Math.max(0.6, v / max * 100).toFixed(2) + '%"></i></span><span class="fv">' + fmt(v) + '</span></div>').join('') + '</div>';
    }
    storyEl.innerHTML = '<div class="eyebrow"><span>' + (s.scene === 'out' ? 'Outside' : 'Inside the site') + ' · ' + (stepIdx + 1) + ' of ' + steps.length + '</span><span class="dots">' + steps.map((_, i) => '<i class="' + (i === stepIdx ? 'on' : '') + '"></i>').join('') + '</span></div>' +
      '<h3>' + esc(s.title) + '</h3>' + s.html + fun +
      '<div class="sbtns"><button type="button" id="sBack"' + (stepIdx === 0 ? ' disabled' : '') + '>Back</button>' +
      '<button type="button" class="primary" id="sNext">' + (stepIdx === steps.length - 1 ? 'Explore on my own' : 'Next') + '</button>' +
      '<button type="button" class="quiet" id="sClose">Hide</button></div>';
    el('sBack').addEventListener('click', () => { stepIdx = Math.max(0, stepIdx - 1); renderStory(true); });
    el('sNext').addEventListener('click', () => { if (stepIdx === steps.length - 1) { tourOpen = false; stepIdx = 0; renderStory(false); } else { stepIdx++; renderStory(true); } });
    el('sClose').addEventListener('click', () => { tourOpen = false; renderStory(false); });
    highlight(s.hl || []);
    if (move) { const t = stepTarget(s); flyTo(s.scene, t.a, t.b, t.zoom); }
  }
  function highlight(keys) {
    const set = new Set(keys);
    const apply = tags => { for (const k in tags) { tags[k].el.classList.toggle('hl', set.has(k)); tags[k].el.classList.toggle('faded', set.size > 0 && !set.has(k)); } };
    apply(tagsOut); apply(tagsIn);
  }
  function stepTarget(s) {
    const at = s.at;
    if (at === 'overview') return Object.assign({}, VIEWS[s.scene].overview);
    if (at.startsWith('tier:')) return { a: -22, b: tierById[at.slice(5)].b, zoom: 1.75 };
    if (at.startsWith('ch:')) { const c = byId[at.slice(3)]; return { a: c.a + 2, b: tierById[c.tier].b - 1, zoom: 2.3 }; }
    const R = { home: { a: -16, b: -4, zoom: 1.9 }, signin: { a: -8, b: -6, zoom: 2.1 }, articles: { a: 1, b: 0, zoom: 1.55 }, browse: { a: 13, b: -3, zoom: 1.8 }, goal: { a: 21, b: -4, zoom: 1.9 } };
    return R[at] || Object.assign({}, VIEWS[s.scene].overview);
  }

  // ---------- Camera moves and switching place ----------
  let tween = null;
  const fader = el('fader');
  function setSceneButtons() {
    el('goOut').setAttribute('aria-pressed', scene === 'out' ? 'true' : 'false');
    el('goIn').setAttribute('aria-pressed', scene === 'in' ? 'true' : 'false');
    labelsOut.hidden = scene !== 'out'; labelsIn.hidden = scene !== 'in';
    renderLegend();
  }
  function flyTo(sc, a, b, zoom) {
    if (sc !== scene) {
      fader.classList.add('on');
      setTimeout(() => {
        scene = sc; setSceneButtons(); resize();
        placeCamera(a, b, zoom * (RM ? 1 : 0.7));
        fader.classList.remove('on');
        startTween(a, b, zoom);
      }, RM ? 0 : 300);
    } else startTween(a, b, zoom);
  }
  function startTween(a, b, zoom) {
    const p = toXZ(a, b);
    tween = { from: controls.target.clone(), to: new V3(p.x, 1.0, p.z), z0: camera.zoom, z1: zoom, t: RM ? 1 : 0 };
  }
  function goScene(sc) { const o = VIEWS[sc].overview; flyTo(sc, o.a, o.b, o.zoom); }
  el('goOut').addEventListener('click', () => { hideTour(); goScene('out'); });
  el('goIn').addEventListener('click', () => { hideTour(); goScene('in'); });

  // ---------- Loading a dataset ----------
  function loadDataset(ds) {
    D = ds;
    F.day = null; F.region = null; F.country = null; F.devices.clear(); F.users.clear(); F.ages.clear(); F.channels = new Set();
    stopPlay();
    const perDay = D.total / Math.max(1, D.lists.date.length);
    const raw = perDay / (60 * 16);
    const mag = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 0.01))));
    PARTICLE_VISITS = [1, 2, 5, 10].map(m => m * mag).find(v => v >= raw) || 10 * mag;
    const A0 = aggregate(D, F), T0 = totals(D, A0, null);
    buildInterior(D.meta.articles, [...Array(D.K).keys()].sort((x, y) => T0.reads[y] - T0.reads[x]));
    const isSample = D.source.kind === 'sample';
    el('srcPill').classList.toggle('user', !isSample);
    el('srcTxt').textContent = isSample ? 'Sample data · invented numbers' : 'Your file · ' + D.source.name;
    el('useSample').hidden = isSample;
    CH.forEach(c => { c.parts.length = 0; c.acc = 0; c.shownVis = 0; });
    stepIdx = 0; tourOpen = true;
    refresh();
    // Start with walkers already spread through the site
    for (let i = 0; i < 280; i++) {
      const w = spawnWalker(); if (!w) break;
      const k = Math.floor(Math.random() * (w.pts.length - 1));
      w.seg = k; w.t = Math.random(); w.pos.lerpVectors(w.pts[k], w.pts[k + 1], w.t); w.born = 1;
    }
    scene = 'out'; setSceneButtons(); resize();
    const o = VIEWS.out.overview; placeCamera(o.a, o.b, o.zoom); controls.saveState();
  }

  // Filters
  el('fCountry').addEventListener('change', e => { F.country = e.target.value === '' ? null : +e.target.value; refresh(); });
  el('fAllDays').addEventListener('click', () => { stopPlay(); F.day = null; refresh(); });
  el('fDay').addEventListener('input', e => { F.day = +e.target.value; refresh(); });
  el('fReset').addEventListener('click', () => { stopPlay(); F.day = null; F.region = null; F.country = null; F.devices.clear(); F.users.clear(); F.ages.clear(); F.channels = new Set(); refresh(); restartTour(); });
  let playTimer = null;
  function stopPlay() { if (playTimer) { clearInterval(playTimer); playTimer = null; } el('fPlay').textContent = 'Play'; }
  el('fPlay').addEventListener('click', () => {
    if (playTimer) { stopPlay(); return; }
    const nD = D.lists.date.length;
    if (F.day == null || F.day >= nD - 1) F.day = 0;
    refresh();
    el('fPlay').textContent = 'Pause';
    playTimer = setInterval(() => { if (F.day >= nD - 1) { stopPlay(); return; } F.day++; refresh(); }, 2500);
  });
  // Drawer and tabs
  el('bDrawer').addEventListener('click', () => {
    const on = !el('app').classList.contains('drawer');
    el('app').classList.toggle('drawer', on);
    el('bDrawer').setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  const tabs = [...document.querySelectorAll('.tab')];
  tabs.forEach(t => t.addEventListener('click', () => tabs.forEach(o => { const on = o === t; o.setAttribute('aria-selected', on ? 'true' : 'false'); el(o.getAttribute('aria-controls')).hidden = !on; })));

  // File import
  const status = el('status');
  function setStatus(html, err) { status.innerHTML = html; status.classList.toggle('err', !!err); }
  async function readFile(file) {
    if (!file) return;
    if (typeof XLSX === 'undefined') { setStatus('The spreadsheet reader did not load. Check your connection and reload the page.', true); return; }
    setStatus('Reading <b>' + esc(file.name) + '</b>…');
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array', cellDates: true });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: true });
      const res = parseRecords(rows);
      if (res.error) { setStatus('<b>Could not use ' + esc(file.name) + '.</b> ' + esc(res.error), true); return; }
      loadDataset(buildDataset(res.recs, { kind: 'file', name: file.name }, res.meta));
      const L = D.lists, has = res.meta.has;
      const missing = [['reach', 'Reach'], ['opens', 'Opens'], ['bounces', 'Bounces'], ['logins', 'Logins'], ['pv', 'Page views'], ['conv', 'Conversions']].filter(([k]) => !has[k]).map(([, l]) => l);
      if (!res.meta.articles.length) missing.push('Read: article columns');
      const unk = Object.keys(res.unknown);
      const notes = [];
      if (missing.length) notes.push('Not in this file, so those parts of the map stay empty: ' + missing.join(', ') + '.');
      if (unk.length) notes.push('Skipped channels not on the map: ' + unk.slice(0, 6).map(esc).join(', ') + (unk.length > 6 ? ' and ' + (unk.length - 6) + ' more' : '') + '.');
      setStatus('<b>Loaded ' + esc(file.name) + '.</b> ' + fmt(res.recs.length) + ' rows · ' + L.date.length + ' date' + (L.date.length === 1 ? '' : 's') + ' · ' + L.country.length + ' countr' + (L.country.length === 1 ? 'y' : 'ies') + (res.meta.articles.length ? ' · ' + res.meta.articles.length + ' articles' : '') + '.' + (notes.length ? '<br>' + notes.join('<br>') : ''));
    } catch (e) {
      setStatus('<b>Could not read ' + esc(file.name) + '.</b> Save it as .xlsx or .csv and try again.', true);
    }
  }
  el('file').addEventListener('change', e => { readFile(e.target.files[0]); e.target.value = ''; });
  const drop = el('drop');
  ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', e => readFile(e.dataTransfer.files[0]));
  el('useSample').addEventListener('click', () => { loadDataset(SAMPLE); setStatus('<b>Sample data loaded.</b> 30 days of invented traffic across 14 countries.'); });
  el('copyTpl').addEventListener('click', () => {
    const txt = el('tpl').textContent;
    const done = () => { el('copyTpl').textContent = 'Copied'; setTimeout(() => el('copyTpl').textContent = 'Copy template', 1600); };
    const fallback = () => { const r = document.createRange(); r.selectNodeContents(el('tpl')); const s = getSelection(); s.removeAllRanges(); s.addRange(r); el('copyTpl').textContent = 'Selected, press Ctrl+C'; };
    try { navigator.clipboard.writeText(txt).then(done, fallback); } catch (e) { fallback(); }
  });

  // Click outside: a building follows it, the website goes inside
  const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
  nodesOut.forEach(nd => nd.group.traverse(o => { o.userData.node = nd.id; }));
  const groupsOut = nodesOut.map(n => n.group);
  let down = null;
  function pick(e) {
    if (scene !== 'out') return null;
    const r = renderer.domElement.getBoundingClientRect();
    ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ptr, camera);
    const hit = ray.intersectObjects(groupsOut, true)[0];
    return hit ? hit.object.userData.node : null;
  }
  function onPick(id) {
    if (!id) return;
    if (id === 'hq') { hideTour(); goScene('in'); return; }
    if (byId[id]) { const i = CH.indexOf(byId[id]); followSet(F.channels.size === 1 && F.channels.has(i) ? [] : [i]); return; }
    if (id.startsWith('gw-')) followSet(tierById[id.slice(3)].channels.map(c => CH.indexOf(c)));
  }
  renderer.domElement.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
  renderer.domElement.addEventListener('pointerup', e => { if (down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) < 5) onPick(pick(e)); down = null; });
  renderer.domElement.addEventListener('pointermove', e => { if (!e.buttons) renderer.domElement.style.cursor = pick(e) ? 'pointer' : 'grab'; });

  function resize() {
    const w = stage.clientWidth, h = stage.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false);
    const a = w / h;
    let halfH = 10.5; const need = VIEWS[scene].halfW; if (a * halfH < need) halfH = need / a;
    camera.left = -halfH * a; camera.right = halfH * a; camera.top = halfH; camera.bottom = -halfH;
    camera.updateProjectionMatrix();
    labelsOut.classList.toggle('compact', w < 640);
  }
  new ResizeObserver(resize).observe(stage);

  // ---------- Outside particles ----------
  let hqGlow = 0, ringCooldown = 0;
  const tmp = new V3(), tan = new V3();
  function updateParticles(dt, time) {
    CH.forEach(c => {
      c.shownVis += (c.dayVis - c.shownVis) * Math.min(1, dt * 2);
      c.acc += (c.shownVis / PARTICLE_VISITS / 60) * dt;
      while (c.acc >= 1) { c.acc -= 1; if (c.parts.length < MAX) c.parts.push({ t: 0, sp: (1 / c.dur) * (0.85 + Math.random() * 0.3), jx: Math.random() - 0.5, jy: Math.random() - 0.5, jz: Math.random() - 0.5, rot: Math.random() * 6 }); }
      for (let i = c.parts.length - 1; i >= 0; i--) { const p = c.parts[i]; p.t += p.sp * dt; if (p.t >= 1) { c.parts.splice(i, 1); hqGlow = Math.min(1, hqGlow + 0.04); } }
      if (scene !== 'out') return;
      let n = 0;
      for (const p of c.parts) {
        c.curve.getPointAt(p.t, tmp);
        if (c.id === 'direct') { c.curve.getTangentAt(p.t, tan); tmp.y += 0.18; dummy.position.copy(tmp); dummy.lookAt(tmp.x + tan.x, tmp.y + tan.y, tmp.z + tan.z); }
        else {
          const s = 0.6 * (1 - p.t) * Math.min(1, p.t * 6);
          tmp.x += p.jx * s; tmp.y += p.jy * s; tmp.z += p.jz * s; dummy.position.copy(tmp);
          if (c.id === 'email') dummy.rotation.set(Math.sin(time * 2 + p.rot) * 0.4, p.rot + time * 0.6, 0);
          else dummy.rotation.set(time + p.rot, time * 1.3 + p.rot, 0);
        }
        dummy.scale.setScalar(p.t < 0.04 ? p.t / 0.04 : 1);
        dummy.updateMatrix(); c.inst.setMatrixAt(n++, dummy.matrix);
      }
      c.inst.count = n; c.inst.instanceMatrix.needsUpdate = true;
    });
  }

  // ---------- Start ----------
  const sample = makeSample();
  SAMPLE = buildDataset(sample.recs, { kind: 'sample', name: 'Sample' }, sample.meta);
  loadDataset(SAMPLE);

  const clock = new THREE.Clock();
  let time = 0;
  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05);
    time += dt;
    updateParticles(dt, time);
    updateWalkers(dt, time);
    if (tween) {
      tween.t = Math.min(1, tween.t + dt / 1.1);
      const e = tween.t < 0.5 ? 2 * tween.t * tween.t : 1 - Math.pow(-2 * tween.t + 2, 2) / 2;
      controls.target.lerpVectors(tween.from, tween.to, e);
      camera.position.copy(controls.target).add(OFFSET);
      camera.zoom = tween.z0 + (tween.z1 - tween.z0) * e; camera.updateProjectionMatrix();
      if (tween.t >= 1) tween = null;
    }
    if (scene === 'out') {
      if (!RM) {
        anim.searchHead.rotation.y += dt * 0.9; anim.directRing.rotation.z += dt * 1.4; anim.refLink.rotation.y += dt * 0.6;
        anim.socialWaves.forEach(w => { const p = (time * 0.6 + w.userData.phase) % 1; w.scale.setScalar(1 + p * 3); w.material.opacity = 0.6 * (1 - p); });
        TIERS.forEach(t => { t.ring.rotation.z += dt * (0.6 + Math.min(3, (t.dayVis || 0) / 8000)); });
      }
      anim.directBeam.material.opacity = 0.12 + 0.06 * Math.sin(time * 3);
      anim.displayLeds.forEach((l, i) => l.material.color.setHex(Math.sin(time * (4 + i * 0.7) + i * 2) > 0 ? 0x5f9e12 : 0xc9d9b0));
      const maxTier = Math.max(1, ...TIERS.map(t => t.dayVis || 0));
      TIERS.forEach(t => { t.col.material.opacity = 0.12 + 0.22 * ((t.dayVis || 0) / maxTier) + 0.03 * Math.sin(time * 2.5 + t.b); });
      beacon.material.color.setHex(Math.sin(time * 4) > 0.6 ? 0xe5484d : 0xf2c7c7);
      hqGlow *= Math.pow(0.25, dt);
      winMat.emissiveIntensity = 0.2 + hqGlow * 0.5;
      ringCooldown -= dt;
      if (!RM && hqGlow > 0.2 && ringCooldown <= 0) { const r = rings.find(r => r.userData.life >= 1); if (r) { r.userData.life = 0; ringCooldown = 0.7; } }
      rings.forEach(r => { if (r.userData.life < 1) r.userData.life = Math.min(1, r.userData.life + dt * 0.7); const l = r.userData.life; r.scale.setScalar(1 + l * 0.9); r.material.opacity = l < 1 ? 0.7 * (1 - l) : 0; });
    } else if (gem) {
      if (!RM) gem.rotation.y += dt * 0.7;
      gemPulse *= Math.pow(0.15, dt);
      gem.material.emissiveIntensity = 0.45 + gemPulse * 1.2;
      gem.scale.setScalar(1 + gemPulse * 0.2);
    }
    controls.update();
    renderer.render(scene === 'out' ? sceneOut : sceneIn, camera);
    placeLabels(scene === 'out' ? tagsOut : tagsIn);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
