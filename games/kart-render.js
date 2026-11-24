// Harbour Loop is drawn in metres. The player's rear wheels sit at z = 0.
(function () {
  'use strict';

  const LAP = 1050;
  const DEPTH = 22;
  const FAR = 460;
  const HALF_ROAD = 7;
  const TAU = Math.PI * 2;
  const views = new WeakMap();
  const vehicleSprites = new Map();
  const scenerySprites = new Map();
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
  const wrap = (n, length) => ((n % length) + length) % length;

  // The 115 metres leading into each vocabulary gate are straight.
  const turns = [[10, 76, -.62], [216, 345, .94], [345, 419, -.58],
    [558, 683, -.99], [683, 757, .70], [894, 1008, .95], [1008, 1049, -.40]];

  function curveAt(distance) {
    const pos = wrap(distance, LAP);
    for (const [start, end, strength] of turns) {
      if (pos > start && pos < end) return Math.sin(Math.PI * (pos - start) / (end - start)) ** 2 * strength;
    }
    return 0;
  }

  function elevation(distance) {
    return 1.45 * Math.sin(distance * TAU / 525) + .48 * Math.sin(distance * TAU / 210 + .4);
  }

  function polygon(ctx, color, ...points) {
    ctx.beginPath();
    ctx.moveTo(points[0], points[1]);
    for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i], points[i + 1]);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  function line(ctx, color, width, ...points) {
    ctx.beginPath();
    ctx.moveTo(points[0], points[1]);
    for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i], points[i + 1]);
    ctx.lineWidth = width;
    ctx.strokeStyle = color;
    ctx.stroke();
  }

  function oval(ctx, color, x, y, rx, ry) {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
    ctx.fillStyle = color;
    ctx.fill();
  }

  function box(ctx, color, x, y, w, h) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  }

  function rounded(ctx, color, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  function gradient(ctx, y1, y2, stops) {
    const fill = ctx.createLinearGradient(0, y1, 0, y2);
    stops.forEach(([pos, color]) => fill.addColorStop(pos, color));
    return fill;
  }

  function surface(w, h) {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    return canvas;
  }

  // A wider panorama lets the harbour pan gently as the road changes heading.
  function makePanorama(w, h) {
    const bw = Math.ceil(w * 1.40);
    const canvas = surface(bw, h);
    const ctx = canvas.getContext('2d');
    const horizon = h * .314;
    const u = Math.min(w * .0013, h * .0022);
    box(ctx, gradient(ctx, 0, horizon, [[0, '#41b9e1'], [.58, '#95dfeb'], [1, '#ffe0af']]), 0, 0, bw, horizon + 2);
    oval(ctx, '#ffe3a5', bw * .71, horizon * .47, 26 * u, 26 * u);
    oval(ctx, '#fff2c8', bw * .71, horizon * .47, 20 * u, 20 * u);

    function cloud(x, y, size) {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(size, size);
      const c = 'rgba(255,250,224,.81)';
      polygon(ctx, c, -62, 1, -48, -4, -40, -4, -36, -11, -27, -12, -21, -8, -13, -18,
        -2, -21, 7, -17, 13, -10, 20, -12, 31, -7, 36, -4, 50, -4, 61, 0, 50, 3, -54, 3);
      box(ctx, 'rgba(255,249,228,.62)', -74, 7, 42, 2);
      box(ctx, 'rgba(255,249,228,.6)', 35, 8, 30, 2);
      ctx.restore();
    }
    cloud(bw * .18, horizon * .33, 1.04 * u);
    cloud(bw * .44, horizon * .50, .72 * u);
    cloud(bw * .85, horizon * .31, 1.31 * u);
    cloud(bw * .59, horizon * .20, .48 * u);

    function ridge(base, amplitude, color, phase) {
      ctx.beginPath();
      ctx.moveTo(0, horizon + 1);
      for (let i = 0; i <= 90; i++) {
        const x = i / 90;
        const y = Math.sin(18 * x + phase) * .56 + Math.sin(39 * x + phase * .4) * .28
          + Math.sin(76 * x + phase) * .11 + Math.sin(215 * x + phase) * .05;
        ctx.lineTo(bw * x, horizon - h * (base + amplitude * y));
      }
      ctx.lineTo(bw, horizon + 1);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
    }
    ridge(.065, .062, '#a9c9bd', .2);
    ridge(.028, .047, '#7faea9', 2.3);

    // Port cranes, sheds and the distinctive stepped harbour skyline.
    ctx.save();
    ctx.translate(bw * .66, horizon);
    ctx.scale(u, u);
    for (let i = 0; i < 20; i++) {
      const bh = 4 + ((i * 31) % 17);
      box(ctx, i % 3 === 0 ? '#a8beb0' : '#8caea6', (i - 7) * 11, -bh, 9, bh);
      box(ctx, '#d5d3b7', (i - 7) * 11, -bh, 3, bh);
    }
    polygon(ctx, '#86aaa3', 12, 0, 12, -30, 18, -30, 18, -43, 22, -43, 23, -50, 24, -43, 28, -43,
      28, -30, 34, -30, 34, 0, 28, 0, 28, -15, 18, -15, 18, 0);
    ctx.restore();
    for (const fx of [.25, .30, .35, .80, .84]) {
      const x = fx * bw;
      const s = u * (.58 + fx * .4);
      ctx.save();
      ctx.translate(x, horizon);
      ctx.scale(s, s);
      line(ctx, '#80a6a3', 2.7, -7, 0, -7, -29, 7, -29, 8, 0);
      line(ctx, '#86aaa4', 2.3, -11, -25, -6, -37, 19, -31, 41, -29);
      line(ctx, '#89ada6', 1.2, -6, -36, 5, -25, 20, -31, 28, -29, 28, -18);
      ctx.restore();
    }

    box(ctx, gradient(ctx, horizon, h, [[0, '#74b9ba'], [.13, '#51acb5'], [.48, '#3296a3'], [1, '#248797']]),
      0, horizon, bw, h - horizon);
    box(ctx, '#cee0cb', 0, horizon, bw, Math.max(1, h * .0025));
    for (let i = 0; i < 82; i++) {
      const t = ((i * 73) % 89) / 89;
      const x = ((i * 269) % 863) / 863 * bw;
      const y = horizon + h * (.004 + .52 * t * t);
      box(ctx, i % 4 ? 'rgba(196,231,213,.35)' : 'rgba(244,234,199,.55)', x, y,
        (2 + 21 * t) * u, Math.max(.65, 1.2 * t * u));
    }
    function sailboat(x, y, scale, coral) {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(scale, scale);
      polygon(ctx, '#486f79', -13, 0, 13, 0, 8, 4, -7, 4);
      polygon(ctx, '#fff3cd', -1, -25, -1, -2, -11, -2);
      polygon(ctx, coral, 1, -22, 12, -3, 1, -3);
      line(ctx, '#718786', .8, 0, 0, 0, -26);
      box(ctx, '#afd6c9', -9, 5, 20, 1);
      ctx.restore();
    }
    sailboat(bw * .22, horizon + h * .052, .74 * u, '#e99c79');
    sailboat(bw * .12, horizon + h * .021, .45 * u, '#e4b369');
    sailboat(bw * .79, horizon + h * .027, .53 * u, '#b5c6b6');
    return canvas;
  }

  // Sprites use a 200 px square with the ground contact at its bottom centre.
  function scenery(kind) {
    if (scenerySprites.has(kind)) return scenerySprites.get(kind);
    const canvas = surface(240, 220);
    const c = canvas.getContext('2d');
    c.translate(120, 215);
    c.lineCap = 'round';
    if (kind === 'palm' || kind === 'palms') {
      function palm(x, k, flip) {
        c.save();
        c.translate(x, 0);
        c.scale(k * flip, k);
        polygon(c, '#715d4a', -7, 0, -5, -45, 2, -84, 14, -123, 18, -123, 10, -83, 5, -41, 7, 0);
        polygon(c, '#c89562', -5, 0, -3, -40, 4, -80, 15, -120, 15, -113, 7, -77, 1, -36, 0, 0);
        for (let n = 0; n < 5; n++) {
          const y = n * -18 - 11;
          const dx = n * 2;
          line(c, '#8b704f', 1.8, -4 + dx, y, 4 + dx, y - 2);
        }
        c.translate(16, -122);
        const leaf = (color, coords) => polygon(c, color, ...coords);
        leaf('#246e61', [0, 3, -18, -12, -38, -16, -53, -10, -65, 4, -46, -2, -47, 2, -31, -3, -29, 0, -15, -4]);
        leaf('#419b72', [0, 3, -20, -5, -36, 3, -48, 17, -53, 36, -39, 22, -40, 27, -30, 15, -28, 17, -17, 8]);
        leaf('#5aac77', [0, 0, -16, -22, -37, -33, -59, -32, -44, -27, -48, -27, -31, -20, -32, -17, -17, -11]);
        leaf('#2c7b69', [0, 0, 11, -21, 29, -32, 46, -32, 34, -25, 37, -25, 23, -15, 24, -13, 11, -5]);
        leaf('#66b780', [0, 1, 23, -14, 44, -12, 62, -2, 70, 10, 53, 3, 55, 7, 39, -1, 40, 3, 21, -3]);
        leaf('#337f63', [0, -1, 15, 0, 31, 13, 36, 32, 32, 47, 26, 30, 25, 34, 19, 20, 16, 20, 10, 10]);
        oval(c, '#aeb876', 1, 2, 5, 3);
        c.restore();
      }
      if (kind === 'palms') palm(45, .64, -1);
      palm(-7, 1.22, 1);
    } else if (kind === 'lighthouse') {
      polygon(c, '#9c9d86', -62, 0, -39, -9, -12, -13, 15, -10, 32, -15, 60, -4, 68, 0);
      polygon(c, '#fcf0cb', -23, -7, -14, -131, 12, -131, 23, -7);
      polygon(c, '#e66e56', -20, -44, -17, -78, 16, -78, 20, -44);
      polygon(c, 'rgba(92,98,94,.21)', 3, -130, 12, -130, 23, -8, 7, -9);
      box(c, '#4c686c', -18, -139, 35, 10);
      box(c, '#546d70', -13, -160, 25, 21);
      box(c, '#ffe1a1', -9, -158, 6, 14);
      box(c, '#f3c28d', 0, -158, 7, 14);
      polygon(c, '#c15349', -22, -160, -11, -165, -2, -174, 2, -174, 12, -165, 22, -160);
      line(c, '#667670', 2, 0, -172, 0, -180);
      box(c, '#536a69', -4, -109, 6, 10);
      rounded(c, '#647677', -6, -27, 12, 19, 5);
      line(c, '#72857f', 2, -20, -140, -20, -144, 19, -144, 19, -140);
      box(c, '#fff0cb', 17, -23, 25, 15);
      polygon(c, '#cf6950', 13, -23, 23, -31, 39, -31, 47, -23);
    } else if (kind === 'windmill') {
      polygon(c, '#9ebbb0', -3, 0, -1.5, -135, 2, -135, 5, 0);
      polygon(c, '#e3e8cd', -3, 0, -1.5, -135, .5, -135, 1, 0);
      c.translate(0, -134);
      for (let i = 0; i < 3; i++) {
        c.rotate(i === 0 ? -.40 : TAU / 3);
        polygon(c, '#fbf2d4', 0, 0, -3, -13, -2, -54, 1, -67, 3, -24, 2, -6);
        polygon(c, '#e99776', -.9, -54, 1, -67, 2, -54);
      }
      oval(c, '#f7efcd', 0, 0, 3.8, 3.8);
    } else if (kind === 'flag') {
      line(c, '#e0d6b2', 3.4, -1, 0, -1, -116);
      polygon(c, '#f1734f', 1, -115, 20, -107, 33, -104, 45, -106, 37, -96, 28, -90, 15, -92, 1, -98);
      polygon(c, '#f7db92', 1, -113, 9, -110, 9, -97, 1, -100);
      oval(c, '#f8dfa0', -1, -117, 2, 2);
    } else if (kind === 'beacon') {
      polygon(c, '#666d5b', -16, 0, -15, -4, 12, -4, 15, 0);
      rounded(c, '#e2dbc0', -7, -43, 14, 40, 2);
      box(c, '#ee845b', -7, -33, 14, 12);
      box(c, '#95a196', 2, -20, 5, 16);
      rounded(c, '#ecebcf', -7, -46, 14, 7, 3);
    } else if (kind === 'left' || kind === 'right') {
      box(c, '#617e78', -20, -61, 5, 61);
      box(c, '#617e78', 17, -61, 5, 61);
      rounded(c, '#365758', -37, -86, 74, 33, 4);
      rounded(c, '#f9ce72', -35, -84, 70, 28, 3);
      c.translate(0, -70);
      c.scale(kind === 'left' ? -1 : 1, 1);
      for (const x of [-21, 1]) polygon(c, '#394d4d', x, -11, x + 9, -11, x + 20, 0, x + 9, 11, x, 11, x + 10, 0);
    } else if (kind === 'container') {
      for (const [x, y, face, side] of [[-73, -35, '#b26a52', '#965b49'], [-18, -35, '#568d8a', '#477873'], [-41, -68, '#cd9460', '#ad805a']]) {
        box(c, face, x, y, 51, 32);
        polygon(c, side, x + 51, y, x + 62, y - 5, x + 62, y + 26, x + 51, y + 32);
        polygon(c, '#dbc296', x, y, x + 12, y - 5, x + 62, y - 5, x + 51, y);
        for (let j = 1; j < 7; j++) box(c, 'rgba(74,75,67,.27)', x + 6 * j + 2, y + 3, 2, 25);
      }
    }
    scenerySprites.set(kind, canvas);
    return canvas;
  }

  function kartSprite(color, number, isPlayer) {
    const id = color + number + isPlayer;
    if (vehicleSprites.has(id)) return vehicleSprites.get(id);
    const canvas = surface(244, 200);
    const c = canvas.getContext('2d');
    c.translate(122, 190);
    c.lineCap = 'round';
    c.lineJoin = 'round';
    const trim = isPlayer ? '#1762a3' : '#304a62';
    function tire(x, y, w, h) {
      rounded(c, '#1c2631', x, y, w, h, w * .27);
      rounded(c, gradient(c, y, y + h, [[0, '#64727c'], [.19, '#424950'], [.56, '#272e39'], [1, '#1f2930']]),
        x + 2, y + 1, w - 4, h - 5, w * .24);
      for (const f of [.19, .75]) {
        line(c, '#252c33', 1.6, x + w * f + 2, y + 4, x + w * f, y + 10, x + w * f, y + h - 8);
      }
    }
    tire(-80, -79, 27, 40);
    tire(53, -79, 27, 40);
    polygon(c, '#26333d', -83, -29, -66, -64, -48, -83, 47, -83, 68, -64, 85, -29, 67, -12, -65, -12);
    line(c, '#8d9694', 5, -88, -32, -69, -29, -41, -33, 40, -33, 69, -29, 88, -32);
    polygon(c, color, -78, -37, -70, -59, -53, -76, -28, -77, -26, -58, -52, -41);
    polygon(c, color, 78, -37, 70, -59, 53, -76, 28, -77, 26, -58, 52, -41);
    polygon(c, '#ffe6ac', -72, -48, -55, -68, -39, -73, -44, -68, -58, -59);
    polygon(c, '#ffe6ac', 72, -48, 55, -68, 39, -73, 44, -68, 58, -59);
    polygon(c, trim, -74, -38, -53, -54, -39, -56, -51, -47, -68, -38);
    polygon(c, trim, 74, -38, 53, -54, 39, -56, 51, -47, 68, -38);

    // Driver's cuffs, shoulders, racing suit and wrapped helmet.
    rounded(c, '#242f36', -34, -102, 68, 52, 15);
    oval(c, '#263039', -46, -89, 12, 10);
    oval(c, '#263039', 46, -89, 12, 10);
    polygon(c, color, -47, -90, -33, -104, -19, -111, 19, -111, 32, -104, 47, -90,
      37, -75, 24, -82, 25, -62, -25, -62, -24, -82, -37, -75);
    polygon(c, '#f3dbb2', -43, -94, -36, -100, -27, -90, -32, -83);
    polygon(c, '#f3dbb2', 43, -94, 36, -100, 27, -90, 32, -83);
    rounded(c, '#41494f', -28, -78, 56, 24, 8);
    rounded(c, '#222e37', -25, -76, 50, 13, 5);

    oval(c, '#25333c', 0, -126, 37.5, 38);
    c.save();
    c.beginPath();
    c.ellipse(0, -127, 35.5, 35.3, 0, 0, TAU);
    c.clip();
    box(c, gradient(c, -163, -92, [[0, '#fffbed'], [.31, '#f8efd6'], [.63, '#e0d8c5'], [.90, '#b4b7b4'], [1, '#909d9c']]), -38, -165, 76, 76);
    polygon(c, trim, -9, -163, 9, -163, 8, -146, 5, -123, 5, -104, -4, -104, -6, -124, -8, -149);
    line(c, '#5f888e', 1.5, -33, -118, -18, -111, 0, -109, 18, -111, 33, -118);
    polygon(c, '#293a46', -39, -137, -30, -134, -29, -122, -35, -119);
    polygon(c, '#293a46', 39, -137, 30, -134, 29, -122, 35, -119);
    polygon(c, '#b3d6cb', -39, -137, -30, -135, -30, -133, -39, -134);
    polygon(c, '#f9fff3', -24, -146, -21, -152, -15, -156, -11, -156, -16, -152, -20, -146);
    box(c, '#62777a', -9, -100, 18, 2);
    c.restore();

    tire(-91, -49, 33, 46);
    tire(58, -49, 33, 46);
    polygon(c, '#51585a', -62, -36, -49, -55, -28, -59, 30, -59, 48, -53, 62, -36, 51, -14, -49, -14);
    polygon(c, '#202a35', -49, -48, -32, -55, 32, -55, 50, -46, 41, -29, -40, -29);
    for (let i = 0; i < 4; i++) {
      line(c, '#818787', 1.8, -42 + i * 2, -45 + i * 3, -24, -47 + i * 3);
      line(c, '#777f82', 1.8, 42 - i * 2, -45 + i * 3, 24, -47 + i * 3);
    }
    polygon(c, color, -73, -33, -63, -45, -41, -42, -22, -37, 22, -37, 41, -42, 63, -45, 73, -33,
      63, -18, 41, -14, -41, -14, -65, -20);
    polygon(c, '#ffe5b2', -67, -36, -62, -42, -41, -39, -32, -36, -47, -36);
    polygon(c, '#ffe5b2', 67, -36, 62, -42, 41, -39, 32, -36, 47, -36);
    polygon(c, 'rgba(84,40,48,.35)', -70, -29, -48, -32, -28, -29, 28, -29, 49, -32, 70, -29, 63, -19, 41, -15, -41, -15, -63, -21);
    polygon(c, trim, -65, -23, -43, -26, -28, -24, -32, -21, -55, -20);
    polygon(c, trim, 65, -23, 43, -26, 28, -24, 32, -21, 55, -20);
    rounded(c, '#f7e3b9', -17, -36, 34, 18, 4);
    c.font = 'italic 900 15px Arial, sans-serif';
    c.textAlign = 'center';
    c.fillStyle = '#283441';
    c.fillText(number, 0, -22);
    line(c, '#303b41', 6, -70, -14, -61, -8, -35, -5, 35, -5, 61, -8, 70, -14);
    line(c, '#96a29e', 2, -68, -15, -60, -10, -35, -7, 35, -7, 60, -10, 68, -15);
    for (const x of [-41, 41]) {
      oval(c, '#a8aaa5', x, -17, 6, 5);
      oval(c, '#373d42', x, -17, 3.8, 2.9);
    }
    vehicleSprites.set(id, canvas);
    return canvas;
  }

  const landmarks = [
    [18, 1.38, 'flag', .84], [43, -2.06, 'crane', 1.58], [69, 1.60, 'palms', 1.50],
    [114, -1.66, 'lighthouse', 1.34], [152, 1.70, 'container', 1.07], [174, -1.71, 'flag', .92],
    [226, -1.34, 'right', .82], [248, 1.80, 'windmill', 1.85], [285, -1.40, 'right', .85],
    [306, 1.65, 'windmill', 1.62], [346, 1.42, 'left', .82], [388, -1.70, 'palms', 1.60],
    [419, 1.42, 'container', 1.10], [470, -1.75, 'crane', 1.52], [483, 1.53, 'palm', 1.66],
    [510, -1.50, 'flag', .96], [558, 1.34, 'left', .83], [588, -1.78, 'palm', 1.52],
    [637, 1.33, 'left', .86], [666, -2.0, 'windmill', 1.86], [690, -1.42, 'right', .86],
    [722, 1.62, 'container', 1.12], [758, -1.72, 'lighthouse', 1.59], [787, 1.64, 'palms', 1.47],
    [818, -1.65, 'crane', 1.60], [842, 1.54, 'flag', .92], [893, -1.35, 'right', .84],
    [924, 1.78, 'windmill', 1.70], [949, -1.34, 'right', .83], [978, 1.68, 'palms', 1.40],
    [1008, 1.38, 'left', .85], [1028, -1.40, 'flag', .9]
  ];

  // Gantry cranes have a wide boom and a wharf below their feet.
  function crane() {
    if (scenerySprites.has('crane')) return scenerySprites.get('crane');
    const result = surface(240, 220);
    const c = result.getContext('2d');
    c.translate(120, 215);
    c.lineJoin = 'round';
    polygon(c, '#819492', -104, -6, -89, -15, 70, -15, 87, -9, 76, 0, -96, 0);
    polygon(c, '#c3be9e', -104, -6, -88, -15, 70, -15, 87, -9, 65, -5);
    for (const off of [-15, 12]) {
      const ink = off < 0 ? '#a95343' : '#d86445';
      line(c, ink, 4.4, -49 + off, -10, -45 + off, -92, -8 + off, -92, -2 + off, -10);
      line(c, ink, 2.1, -46 + off, -38, -9 + off, -67, -45 + off, -67, -5 + off, -37);
    }
    box(c, '#d76a46', -67, -99, 140, 8);
    line(c, '#a9624d', 2, -62, -91, 69, -91);
    line(c, '#d76845', 3.7, -63, -96, -32, -151, -8, -98);
    line(c, '#dc7751', 2.4, -32, -149, 37, -108, 71, -98);
    line(c, '#e59767', 1.6, -31, -148, 71, -98);
    line(c, '#9d7561', 1, 43, -95, 43, -56, 49, -56, 49, -95);
    box(c, '#a26f52', 36, -57, 21, 4);
    box(c, '#e5c998', -55, -108, 17, 11);
    box(c, '#679197', -53, -105, 10, 5);
    scenerySprites.set('crane', result);
    return result;
  }

  function ribbon(c, color, a, b, from, to) {
    polygon(c, color, a.x + a.half * from, a.y, a.x + a.half * to, a.y,
      b.x + b.half * to, b.y + .55, b.x + b.half * from, b.y + .55);
  }

  function buildRoad(v, s) {
    const points = [];
    const baseElevation = elevation(s.distance);
    const start = Math.floor((s.distance - DEPTH * .49) / 3) * 3;
    const step = 3;
    let center = 0;
    let heading = 0;
    for (let pos = start; pos <= s.distance + FAR + step; pos += step) {
      const z = pos - s.distance;
      if (z > 0) {
        const dz = Math.min(z, step);
        heading += curveAt(pos - dz * .5) * dz * .008;
        center += Math.sin(heading) * dz;
      }
      const k = DEPTH / (DEPTH + z);
      const x = v.w * .5 + (center / HALF_ROAD - s.x * .41) * v.half * k;
      const y = v.horizon + v.depth * k * (1 - (elevation(pos) - baseElevation) / 10);
      points.push({ pos, x, y, half: v.half * k, k });
    }
    return points;
  }

  function at(points, distance) {
    const raw = (distance - points[0].pos) / 3;
    const i = clamp(Math.floor(raw), 0, points.length - 2);
    const t = clamp(raw - i, 0, 1);
    const p = points[i], q = points[i + 1];
    return { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t,
      half: p.half + (q.half - p.half) * t, k: p.k + (q.k - p.k) * t };
  }

  // Aiming and drawing use the same road sample, including on turn-in and over crests.
  function roadFor(v, s) {
    if (v.distance !== s.distance || v.lane !== s.x) {
      v.points = buildRoad(v, s);
      v.distance = s.distance;
      v.lane = s.x;
    }
    return v.points;
  }

  function kartPosition(v, p, driver) {
    const width = v.kartWidth * p.k;
    const hit = driver.hitEffect === 'missile' && driver.hitTime > 0;
    const hop = hit && !reducedMotion.matches ? Math.sin(Math.PI * clamp((2 - driver.hitTime) / .55, 0, 1)) * width * .32 : 0;
    return { x:p.x + p.half * driver.x, y:p.y, centerY:p.y - hop - .48 * width, width, hop };
  }

  function gateBoard(p) {
    return { top:p.y - p.half * .75, height:p.half * .174 };
  }

  function inAimRange(rival, distance) {
    const gap = rival.distance - distance;
    return rival.finishedAt === null && gap >= 2 && gap <= 125;
  }

  function aimSight(v, points, s) {
    const ahead = s.rivals.filter(r => inAimRange(r, s.distance))
      .sort((a, b) => a.distance - b.distance);
    const nearer = [kartPosition(v, at(points, s.distance), s)];
    const gate = s.question && at(points, s.question.distance);
    const board = gate && gateBoard(gate);
    let preview = null;
    for (const rival of ahead) {
      const road = at(points, rival.distance), kart = kartPosition(v, road, rival);
      // Do not lock a car hidden by another kart, the next hill, or a word sign.
      const offscreen = kart.x < 0 || kart.x > v.w || kart.centerY < 0 || kart.centerY > v.h;
      const blockedByKart = nearer.some(n => Math.abs(n.x - kart.x) < n.width * .30 &&
        kart.centerY > n.y - n.hop - n.width * .80 && kart.centerY < n.y - n.hop);
      nearer.push(kart);
      if (offscreen || blockedByKart) continue;
      if (points.some(p => p.pos > s.distance && p.pos < rival.distance && p.y < kart.centerY &&
        Math.abs(p.x - kart.x) < p.half)) continue;
      if (gate && s.question.distance < rival.distance && Math.abs(kart.x - gate.x) < gate.half &&
        kart.centerY >= board.top && kart.centerY <= board.top + board.height) continue;
      const x = road.x + s.x * road.half;
      const sight = { x, y:kart.centerY, tolerance:road.half * .22, kart, rival };
      if (Math.abs(kart.x - x) <= sight.tolerance) return { ...sight, targetId:rival.id };
      if (!preview) preview = sight;
    }
    if (preview) return preview;
    const p = at(points, s.distance + 40);
    return { x:p.x + p.half * s.x, y:p.y - v.kartWidth * p.k * .48, tolerance:p.half * .22 };
  }

  function findAimTarget(canvas, s) {
    const v = views.get(canvas);
    return v ? aimSight(v, roadFor(v, s), s).targetId ?? null : null;
  }

  function drawRoad(v, points) {
    const c = v.c;
    // Several distant segments can project into a single pixel on a phone.
    for (let j = points.length - 1; j > 0;) {
      const a = points[j--];
      while (j > 0 && points[j].y - a.y < .8) j--;
      const b = points[j];
      if (a.y > v.h + 4 || b.y < v.horizon) continue;
      const band = Math.floor(b.pos / 6);
      const dark = band % 2 === 0;
      const edge = -1.43 - .22 * Math.sin(b.pos * TAU / 210);
      const nextEdge = -1.43 - .22 * Math.sin(a.pos * TAU / 210);
      polygon(c, dark ? '#8da587' : '#91aa89', a.x + a.half * nextEdge, a.y, v.w, a.y, v.w, b.y + .7, b.x + b.half * edge, b.y + .7);
      polygon(c, '#d3c9a9', a.x + a.half * nextEdge, a.y, a.x + a.half * (nextEdge + .10), a.y,
        b.x + b.half * (edge + .10), b.y + .7, b.x + b.half * edge, b.y + .7);
      ribbon(c, dark ? '#d8bc94' : '#ddc5a1', a, b, -1.18, 1.14);
      ribbon(c, dark ? '#d65d4c' : '#fff0cf', a, b, -1.095, 1.095);
      ribbon(c, dark ? '#56636b' : '#57656d', a, b, -1.0, 1.0);
      ribbon(c, '#e8dbc2', a, b, -.987, -.976);
      ribbon(c, '#e8dbc2', a, b, .976, .987);
      if (wrap(b.pos, 18) < 6) {
        for (const x of [-1 / 3, 1 / 3]) ribbon(c, '#d9d4bd', a, b, x - .006, x + .006);
      }
      if (wrap(b.pos, LAP) < 3) {
        for (let i = 0; i < 16; i++) {
          const x = -1 + i / 8;
          const middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, half: (a.half + b.half) / 2 };
          ribbon(c, i % 2 ? '#ebe6d8' : '#303e48', a, middle, x, x + .125);
          ribbon(c, i % 2 ? '#303e48' : '#ebe6d8', middle, b, x, x + .125);
        }
      }
    }
  }

  function drawGate(c, p, question) {
    const half = p.half;
    const {top, height} = gateBoard(p);
    const pole = Math.max(1.4, half * .015);
    const width = half * (2 / question.options.length);
    c.save();
    for (let i = 0; i <= question.options.length; i++) {
      const x = p.x - half + width * i;
      box(c, '#455c62', x - pole, top + height * .5, pole * 2, p.y - top - height * .5);
      box(c, '#b8cbbe', x - pole, top + height * .5, pole * .65, p.y - top - height * .5);
      box(c, '#f1b857', x - pole, p.y - half * .085, pole * 2, half * .04);
    }
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    question.options.forEach((word, i) => {
      const x = p.x - half + width * i;
      const selected = i === question.lane;
      const inset = half * .010;
      const frame = selected ? '#ffca62' : '#e9e8c9';
      rounded(c, frame, x + inset, top, width - inset * 2, height, Math.max(1, height * .10));
      rounded(c, selected ? '#174c58' : '#284c58', x + inset * 2, top + inset, width - inset * 4, height - inset * 2, Math.max(1, height * .07));
      if (selected) polygon(c, '#ffca62', x + width * .5 - height * .14, top + height - 1,
        x + width * .5 + height * .14, top + height - 1, x + width * .5, top + height * 1.17);
      c.font = 'bold ' + Math.max(4, Math.min(height * .58, width * 1.4 / Math.max(3, word.length))) + 'px system-ui, sans-serif';
      c.fillStyle = '#fff4d6';
      c.fillText(word, x + width / 2, top + height * .51, width - inset * 7);
      const lane = x + width / 2;
      polygon(c, selected ? 'rgba(255,202,98,.70)' : 'rgba(238,232,205,.50)',
        lane - width * .27, p.y, lane + width * .27, p.y, lane + width * .24, p.y - half * .012,
        lane - width * .24, p.y - half * .012);
    });
    c.restore();
  }

  // The rear-view sprite has no side or nose. Project those angles on the ground
  // plane during a spin so the helmet stays upright and the wheels stay on the road.
  const SPIN_VIEWS = 24;
  function spinningKart(frame, color) {
    const key = 'spin-' + color + '-' + frame;
    if (vehicleSprites.has(key)) return vehicleSprites.get(key);
    const sprite = surface(244, 200);
    const c = sprite.getContext('2d');
    c.translate(122, 190);
    const yaw = frame * TAU / SPIN_VIEWS, cos = Math.cos(yaw), sin = Math.sin(yaw);
    function project(x, y, z) {
      const depth = z * cos - x * sin;
      return [x * cos + z * sin, -27 - y - depth * .34, depth - y * .34];
    }
    const faces = [];
    function face(color, points) {
      const projected = points.map(([x, y, z]) => project(x, y, z));
      const depth = projected.reduce((sum, point) => sum + point[2], 0) / projected.length;
      faces.push({ color, depth, coords: projected.flatMap(([x, y]) => [x, y]) });
    }
    function hull(outline, bottom, top, paint, side) {
      const upper = outline.map(([x, z]) => [x, top, z]);
      const lower = outline.map(([x, z]) => [x, bottom, z]);
      for (let i = 0; i < outline.length; i++) {
        const j = (i + 1) % outline.length;
        face(side, [lower[i], lower[j], upper[j], upper[i]]);
      }
      face(paint, upper);
    }
    for (const side of [-1, 1]) {
      for (const z of [-42, 42]) {
        const outer = [], inner = [];
        for (let j = 0; j < 12; j++) {
          const angle = j * TAU / 12;
          const y = 11 + Math.sin(angle) * 20, zz = z + Math.cos(angle) * 20;
          outer.push([side * 82, y, zz]); inner.push([side * 56, y, zz]);
        }
        for (let j = 0; j < 12; j++) {
          const k = (j + 1) % 12;
          face(j < 6 ? '#475563' : '#27333d', [outer[j], outer[k], inner[k], inner[j]]);
        }
        face('#202b35', outer);
        face('#6f7e86', outer.map(([x, y, zz]) => [x + side, 11 + (y - 11) * .53, z + (zz - z) * .53]));
      }
    }
    hull([[-60,-59],[60,-59],[67,-36],[52,44],[32,68],[-32,68],[-52,44],[-67,-36]], 8, 23, color, '#374650');
    hull([[-54,-58],[54,-58],[51,-39],[-51,-39]], 23, 32, color, '#374650');
    hull([[-37,17],[37,17],[26,61],[-26,61]], 23, 39, color, '#374650');
    face('#ffedcb', [[-7,40,19],[7,40,19],[7,40,59],[-7,40,59]]);
    hull([[-29,-28],[29,-28],[26,6],[-26,6]], 27, 65, color, '#374650');
    for (const side of [-1, 1]) {
      hull([[side*44,-28],[side*61,-28],[side*59,19],[side*46,14]], 23, 31, '#fff0c9', '#2169a6');
    }
    faces.sort((a, b) => b.depth - a.depth);
    for (const f of faces) polygon(c, f.color, ...f.coords);

    const [hx, hy] = project(0, 99, -6);
    oval(c, '#253540', hx, hy, 37, 37);
    c.save(); c.beginPath(); c.ellipse(hx, hy, 35, 35, 0, 0, TAU); c.clip();
    box(c, gradient(c, hy - 35, hy + 35, [[0,'#fff9e4'],[.56,'#e4dfca'],[1,'#a0a9a9']]), hx - 36, hy - 36, 72, 72);
    const stripe = hx - sin * 25;
    polygon(c, '#1966a6', hx - 6, hy - 38, hx + 6, hy - 38, stripe + 6, hy, stripe + 4, hy + 35, stripe - 4, hy + 35, stripe - 6, hy);
    // The dark visor wraps across the front hemisphere and becomes visible from the side.
    for (let j = 0; j < 16; j++) {
      const a = -1.65 + j * 3.3 / 16, b = a + 3.3 / 16;
      if (Math.cos((a + b) / 2 + yaw) > 0) continue;
      const visor = [[a, 9], [b, 9], [b, -10], [a, -10]].map(([az, h]) => {
        const radius = Math.sqrt(35 * 35 - h * h);
        return project(radius * Math.sin(az), 99 + h, -6 + radius * Math.cos(az)).slice(0, 2);
      });
      polygon(c, j < 7 ? '#233748' : '#1e2e42', ...visor.flat());
    }
    c.restore();
    vehicleSprites.set(key, sprite);
    return sprite;
  }

  function drawPeel(c, lift) {
    oval(c, 'rgba(28,40,43,.23)', 2, 2, 18, 4);
    c.translate(0, -lift);
    polygon(c, '#935e26', -20, 1, -12, -2, -4, -5, -2, -16, 2, -18, 4, -7, 10, -4, 20, -7, 16, 0, 6, 4, 0, 2, -9, 6);
    polygon(c, '#ffd84e', -19, 1, -10, -1, -2, -5, 0, -15, 2, -16, 2, -6, 9, -3, 17, -5, 13, -1, 5, 1, 0, -1, -9, 4);
    polygon(c, '#fff2a4', 0, -2, 5, 2, 9, 8, 1, 5, -4, 1);
  }

  function drawKart(v, p, s, driver, isPlayer) {
    const c = v.c;
    const steer = isPlayer ? s.steer : clamp(curveAt(driver.distance) * .65, -.8, .8);
    const {width, x, y, hop} = kartPosition(v, p, driver);
    if (x < -width || x > v.w + width || y - width > v.h) return;
    const bouncing = isPlayer && s.offroad;
    const wobble = reducedMotion.matches ? 0 : Math.sin(s.elapsed * (bouncing ? 40 : 21) + driver.id) * width
      * (bouncing ? .014 : .004) * clamp(s.speed / 100, 0, 1);
    oval(c, 'rgba(36,47,52,.30)', x + width * .05, y - width * .018, width * .52, width * .094);
    const skidRemaining = isPlayer ? s.skid : driver.hitEffect === 'banana' ? driver.hitTime : 0;
    const slipping = skidRemaining > 0;
    const skidSide = isPlayer ? s.skidSide : driver.id % 2 === 0 ? 1 : -1;
    const skidProgress = slipping ? clamp(1 - skidRemaining / s.skidDuration, 0, 1) : 0;
    const spin = 1 - (1 - skidProgress) ** 2;
    const spinFrame = reducedMotion.matches ? 0 : wrap(Math.round(spin * SPIN_VIEWS) * skidSide, SPIN_VIEWS);
    const sprite = spinFrame ? spinningKart(spinFrame, driver.color) : kartSprite(driver.color, isPlayer ? '07' : String(driver.id + 11), isPlayer);
    const hitTime = driver.hitEffect === 'missile' ? driver.hitTime : 0;
    c.save();
    c.translate(x, y + wobble - hop);
    if (slipping) {
      const t = reducedMotion.matches ? 0 : skidProgress;
      c.save();
      c.translate(-skidSide * width * (.45 + .19 * t), width * (.02 + .11 * t));
      c.scale(-skidSide * width / 170, width / 170);
      c.globalAlpha = Math.min(1, (1 - skidProgress) * 4);
      drawPeel(c, Math.sin(t * Math.PI) * 13);
      c.restore();
    }
    c.rotate(steer * (s.drifting && isPlayer ? .105 : .030));
    const scale = width / 184;
    if (!reducedMotion.matches && (slipping || isPlayer && (s.drifting || s.offroad))) {
      for (const side of [-1, 1]) {
        for (let n = 0; n < 4; n++) {
          const t = wrap(s.elapsed * 2.5 + n / 4, 1);
          const dx = side * width * (.40 + t * .15) - steer * width * t * .12;
          oval(c, isPlayer && s.offroad ? 'rgba(220,198,157,.43)' : 'rgba(227,232,227,.46)',
            dx, width * (.008 + .12 * t), width * (.02 + t * .05), width * (.015 + t * .028));
        }
      }
    }
    if (isPlayer && s.boost > 0) {
      const fire = reducedMotion.matches ? 1 : 1 + Math.sin(s.elapsed * 39) * .24;
      for (const side of [-1, 1]) {
        const xx = side * 41 * scale;
        polygon(c, '#ff9954', xx - 6 * scale, -13 * scale, xx + 6 * scale, -13 * scale,
          xx + 3 * scale, 8 * scale, xx, 26 * scale * fire, xx - 4 * scale, 6 * scale);
        polygon(c, '#fff0a5', xx - 3 * scale, -12 * scale, xx + 3 * scale, -12 * scale,
          xx + scale, 4 * scale, xx, 13 * scale * fire);
      }
    }
    c.drawImage(sprite, -122 * scale, -190 * scale, 244 * scale, 200 * scale);
    c.restore();
    if (hitTime > 0) {
      const t = reducedMotion.matches ? .55 : clamp((2 - hitTime) / .55, 0, 1);
      const glow = Math.max(.6, 1 - t);
      c.save();
      c.translate(x, y - .78 * width - hop);
      c.globalAlpha = Math.min(1, hitTime * 5);
      for (let i = 0; i < 3; i++) {
        const angle = Math.PI * (1.12 + i * .38);
        const radius = width * (.21 + .15 * t);
        const dx = Math.cos(angle) * radius, dy = Math.sin(angle) * radius;
        const size = Math.max(3, width * .13 * glow);
        polygon(c, '#784c24', dx, dy - size, dx + .34 * size, dy - .30 * size, dx + size, dy,
          dx + .34 * size, dy + .30 * size, dx, dy + size, dx - .34 * size, dy + .30 * size,
          dx - size, dy, dx - .34 * size, dy - .30 * size);
        polygon(c, '#ffdb56', dx, dy - .78 * size, dx + .62 * size, dy, dx, dy + .78 * size, dx - .62 * size, dy);
      }
      c.restore();
    }
  }

  function drawSight(v, points, s) {
    const c = v.c, sight = aimSight(v, points, s);
    const acquiring = sight.targetId != null && s.aim.targetId === sight.targetId;
    const locked = acquiring && s.aim.progress >= 1;
    const color = locked ? '#ff726a' : acquiring ? '#83ffdf' : '#f3fffd';
    const w = Math.max(5, sight.tolerance);
    c.save();
    c.lineCap = 'round'; c.lineJoin = 'round';
    // Horizontal ticks mark the tolerance at the opponent's actual depth.
    for (const side of [-1, 1]) {
      const x = sight.x + side * w;
      const pts = [x, sight.y - 4, x, sight.y + 4, x + side * 4, sight.y + 4];
      line(c, '#203a48', 3.5, ...pts); line(c, color, 1.6, ...pts);
    }
    oval(c, '#203a48', sight.x, sight.y, 2.5, 2.5);
    oval(c, color, sight.x, sight.y, 1.4, 1.4);
    if (acquiring) {
      const {x, centerY, width} = sight.kart;
      const radius = Math.max(9, width * (.61 - .08 * s.aim.progress));
      const tip = Math.max(4, radius * .34);
      for (const a of [-1, 1]) for (const b of [-1, 1]) {
        const xx = x + a * radius, yy = centerY + b * radius * .90;
        const stroke = [xx - a * tip, yy, xx, yy, xx, yy - b * tip];
        line(c, '#203a48', 4, ...stroke); line(c, color, 2, ...stroke);
      }
      const barWidth = Math.max(18, radius * 1.3), barY = centerY - radius * .9 - 6;
      box(c, '#203a48', x - barWidth / 2 - 1, barY - 1, barWidth + 2, 4);
      box(c, color, x - barWidth / 2, barY, barWidth * s.aim.progress, 2);
      if (locked) {
        const tipY = barY - 3;
        polygon(c, color, x - 4, tipY - 4, x + 4, tipY - 4, x, tipY);
        c.font = 'bold 12px system-ui, sans-serif';
        c.textAlign = 'center'; c.textBaseline = 'bottom';
        c.lineWidth = 3; c.strokeStyle = '#203a48';
        c.strokeText('可發射', x, tipY - 5);
        c.fillStyle = '#fff5e0'; c.fillText('可發射', x, tipY - 5);
      }
    }
    c.restore();
  }

  function drawMissile(v, points, s, p, shot) {
    const c = v.c, target = s.rivals.find(r => r.id === shot.targetId);
    if (!target) return;
    const projectile = kartPosition(v, p, shot);
    const end = kartPosition(v, at(points, target.distance), target);
    const lift = reducedMotion.matches ? 0 : .56 * Math.sin(Math.PI * shot.progress);
    const x = projectile.x + (.20 * projectile.width * (1 - shot.progress));
    const y = projectile.centerY - lift * projectile.width;
    const scale = clamp(projectile.width / 125, .28, 1.75);
    c.save();
    c.translate(x, y);
    c.rotate(Math.atan2(end.centerY - y, end.x - x));
    c.scale(scale, scale);
    polygon(c, '#f9a549', -12,-3, -21,-5, -19,-2, -29,1, -21,3, -23,5, -12,3);
    polygon(c, '#fff6ba', -11,-2, -22,0, -11,2);
    polygon(c, '#213849', -16,-8, -8,-6, -5,-5, 6,-5, 15,0, 6,5, -5,5, -16,8, -14,2, -14,-2);
    polygon(c, '#ee6556', -14,-6, -5,-4, -6,4, -14,6, -12,1, -12,-1);
    polygon(c, '#fff2cf', -9,-3, 5,-4, 13,0, 5,4, -9,3);
    polygon(c, '#ee6556', 6,-3, 13,0, 6,3);
    c.restore();
  }

  function drawObjects(v, points, s) {
    const near = Math.max(points[0].pos, s.distance - 8);
    const far = s.distance + FAR;
    const entries = [];
    function add(pos, lane, kind, size, driver) {
      if (pos >= near && pos <= far) entries.push({ pos, lane, kind, size, driver });
    }
    for (let lap = Math.floor(near / LAP); lap <= Math.floor(far / LAP); lap++) {
      for (const [pos, lane, kind, size] of landmarks) add(lap * LAP + pos, lane, kind, size);
    }
    for (let i = Math.ceil(near / 21); i * 21 < far; i++) {
      add(i * 21, -1.13, 'beacon', .68);
      if (i % 3 === 0) add(i * 21, 1.14, 'beacon', .60);
    }
    if (s.question) add(s.question.distance, 0, 'gate', 1);
    for (const peel of s.bananas) add(peel.distance, peel.x, 'banana', .16);
    for (const shot of s.missiles) add(shot.distance, shot.x, 'missile', 1, shot);
    for (const rival of s.rivals) add(rival.distance, rival.x, 'kart', 1, rival);
    add(s.distance, s.x, 'player', 1, { id: 7, x: s.x, color: '#ec513f' });
    entries.sort((a, b) => b.pos - a.pos);
    for (const obj of entries) {
      const p = at(points, obj.pos);
      if (obj.kind === 'kart' || obj.kind === 'player') {
        drawKart(v, p, s, obj.driver, obj.kind === 'player');
      } else if (obj.kind === 'gate') {
        drawGate(v.c, p, s.question);
      } else if (obj.kind === 'banana') {
        const scale = Math.max(.14, p.half * obj.size / 40);
        v.c.save();
        v.c.translate(p.x + p.half * obj.lane, p.y);
        v.c.scale(scale, scale);
        drawPeel(v.c, 0);
        v.c.restore();
      } else if (obj.kind === 'missile') {
        drawMissile(v, points, s, p, obj.driver);
      } else {
        const width = p.half * obj.size;
        const x = p.x + p.half * obj.lane;
        if (x + width / 2 < 0 || x - width / 2 > v.w) continue;
        const icon = obj.kind === 'crane' ? crane() : scenery(obj.kind);
        if (obj.kind !== 'crane') oval(v.c, 'rgba(68,79,64,.26)', x + width * .04, p.y, width * .12, width * .019);
        v.c.drawImage(icon, x - width / 2, p.y - width * 215 / 240, width, width * 220 / 240);
      }
    }
  }

  function draw(canvas, s) {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    let v = views.get(canvas);
    const dpr = Math.min(window.devicePixelRatio || 1, 1.75, 2200 / Math.max(w, h));
    if (!v || w !== v.w || h !== v.h || dpr !== v.dpr) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      const c = canvas.getContext('2d', { alpha: false });
      c.setTransform(canvas.width / w, 0, 0, canvas.height / h, 0, 0);
      const half = Math.min(w * .465, h * 1.03);
      v = { w, h, c, dpr, half, horizon: h * .314, depth: h * .535,
        kartWidth: Math.min(half * .46, h * .32), panorama: makePanorama(w, h) };
      views.set(canvas, v);
    }
    const c = v.c;
    const pan = .12 * Math.sin(s.distance * TAU / LAP) + .047 * Math.sin(s.distance * TAU / 350);
    c.drawImage(v.panorama, Math.round(-w * (.20 + pan)), 0);
    const points = roadFor(v, s);
    const end = points[points.length - 1];
    const tip = { x: end.x, y: v.horizon, half: 0 };
    ribbon(c, '#a6b9a0', tip, end, -1.5, 6.5);
    ribbon(c, '#819399', tip, end, -1, 1);
    drawRoad(v, points);
    drawObjects(v, points, s);
    if (s.aim) drawSight(v, points, s);
    if (s.boost > 0 && !reducedMotion.matches) {
      const center = .51 * w;
      for (let i = 0; i < 10; i++) {
        const t = wrap(s.elapsed * 1.6 + i * .23, 1);
        const x = i % 2 ? w * (1.04 - i * .012) : w * (-.06 + i * .013);
        const y = h * (.41 + t * .73);
        line(c, 'rgba(255,239,184,.45)', Math.max(1, w * .0018),
          x, y, x + (center - x) * (.04 + t * .04), y - (y - v.horizon) * .14);
      }
    }
  }

  window.KartRender = { draw, curveAt, findAimTarget, inAimRange };
})();
