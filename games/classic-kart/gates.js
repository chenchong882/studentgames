// Quiz data and the physical portals share one lane ordering, from the driver's left to right.
(() => {
  'use strict';

  function shuffle(items) {
    const result = items.slice();
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  function prepare(words) {
    return GameData.uniqueWords(words.filter(w => w.word && w.chinese));
  }

  function questions(words, count) {
    const deck = [];
    let previous = '';
    while (deck.length < count) {
      const bag = shuffle(words);
      if (bag[0].word === previous)
        [bag[0], bag[1]] = [bag[1], bag[0]];
      for (const answer of bag) {
        const distractors = [], used = new Set([answer.chinese.toLocaleLowerCase()]);
        const candidates = shuffle(words);
        for (const candidate of candidates) {
          const meaning = candidate.chinese.toLocaleLowerCase();
          if (candidate.word === answer.word || used.has(meaning))
            continue;
          used.add(meaning);
          distractors.push(candidate);
          if (distractors.length === 2)
            break;
        }
        const choices = shuffle([answer, ...distractors]);
        deck.push({ answer, choices, correctLane: choices.indexOf(answer) });
        if (deck.length === count)
          break;
      }
      previous = bag[bag.length - 1].word;
    }
    return deck;
  }

  function build(scene, track) {
    const T = THREE;
    const navy = new T.MeshLambertMaterial({ color: 0x21425c });
    const paint = new T.MeshLambertMaterial({ color: 0xffc75a });
    const foot = new T.MeshLambertMaterial({ color: 0xf4efe3 });
    const roadPaint = new T.MeshBasicMaterial({ color: 0xffe7a4, polygonOffset: true, polygonOffsetFactor: -3 });
    const unitBox = new T.BoxGeometry(), plates = [], transforms = new Map();
    const mover = new T.Object3D();
    const plane = new T.PlaneGeometry(track.halfWidth * 2 / 3 - .24, 2.5);
    for (const distance of track.gates) {
      const { x, z, tx, tz } = track.sample(distance), yaw = Math.atan2(tx, -tz);
      function addBox(material, right, up, along, w, h, d) {
        mover.position.set(x - tz * right + tx * along, up, z + tx * right + tz * along);
        mover.rotation.set(0, -yaw, 0);
        mover.scale.set(w, h, d);
        mover.updateMatrix();
        if (!transforms.has(material))
          transforms.set(material, []);
        transforms.get(material).push(mover.matrix.clone());
      }
      const width = track.halfWidth * 2 / 3;
      // Intermediate posts end overhead. A kart can change lanes all the way to the timing line.
      for (const side of [-1, 1]) {
        addBox(navy, side * (track.halfWidth + .62), 3, 0, .62, 6, .62);
        addBox(foot, side * (track.halfWidth + .62), .55, 0, 1.06, 1.1, 1);
        addBox(paint, side * (track.halfWidth + .62), 2.4, 0, .7, .42, .7);
      }
      addBox(navy, 0, 5.85, 0, track.halfWidth * 2 + 1.25, 2.75, .50);
      addBox(paint, 0, 7.24, 0, track.halfWidth * 2 + 1.35, .17, .59);
      addBox(roadPaint, 0, .038, 0, track.halfWidth * 2, .018, .26);
      for (const side of [-1, 1]) {
        addBox(paint, side * width / 2, 4.1, 0, .30, 1.4, .42);
        for (let dash = 0; dash < 7; dash++)
          addBox(roadPaint, side * width / 2, .034, -2 - dash * 3.5, .11, .02, 2);
      }
      const panels = [];
      for (let lane = 0; lane < 3; lane++) {
        const lateral = (lane - 1) * width, canvas = document.createElement('canvas');
        canvas.width = 768;
        canvas.height = 212;
        const tex = new T.CanvasTexture(canvas);
        tex.colorSpace = T.SRGBColorSpace;
        tex.anisotropy = 2;
        const panel = new T.Mesh(plane, new T.MeshBasicMaterial({ map: tex }));
        panel.position.set(x - tz * lateral - tx * .265, 5.85, z + tx * lateral - tz * .265);
        panel.rotation.y = -yaw;
        scene.add(panel);
        panels.push({ c: canvas.getContext('2d'), tex });
      }
      plates.push(panels);
    }
    for (const [material, matrices] of transforms) {
      const parts = new T.InstancedMesh(unitBox, material, matrices.length);
      matrices.forEach((m, i) => parts.setMatrixAt(i, m));
      scene.add(parts);
    }
    function paintLane({ c, tex }, lane, word) {
      c.fillStyle = '#255d70';
      c.fillRect(0, 0, 768, 212);
      c.fillStyle = '#174254';
      c.fillRect(0, 0, 768, 50);
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillStyle = '#ffdf8d';
      c.font = 'bold 30px Arial';
      c.fillText(['◀   LEFT', '◆   CENTER', 'RIGHT   ▶'][lane], 384, 26);
      c.fillStyle = '#fff8e6';
      c.font = 'bold 79px Arial';
      c.fillText(word, 384, 132, 722);
      tex.needsUpdate = true;
    }
    function set(index, question) {
      plates[index].forEach((p, lane) => paintLane(p, lane, question?.choices[lane]?.word || '◇'));
    }
    plates.forEach((_, i) => set(i, null));
    return { set };
  }
  function answerLane(lateral, halfWidth) {
    if (Math.abs(lateral) > halfWidth) return null;
    return Math.min(2, Math.floor((lateral + halfWidth) / (2*halfWidth/3)));
  }

  window.ClassicGates = { prepare, questions, build, answerLane };
})();
