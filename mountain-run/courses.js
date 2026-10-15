// Authored V6 gameplay layouts. Distances are game units, not surveyed real-world routes.
function createMountainCourses() {
  const length = 30000, ruleset = '2027-v6', version = 6;
  const definitions = {
    "pine-mountain": {
      profile: "Flowing forest bends",
      turns: [[1800,4600,420],[6200,8500,-380],[10000,12800,450],[14800,17000,-400],[19100,22000,460],[24400,27300,-430]],
      chicanes: [[3150,-1],[7500,1],[16200,-1],[21950,1]],
      wildlife: [["deer",11300],["fox",12700],["rabbit",18900],["deer",21250],["fox",28250]],
      potholes: [[5950,-0.5],[14550,0.35],[27000,-0.25]]
    },
    "spring-weatherly": {
      profile: "Village turns & linked sweepers",
      turns: [[2200,3900,-290],[5000,7000,330],[9500,11700,350],[13800,16000,-380],[19000,21500,-360],[24400,26900,400]],
      chicanes: [[7100,1],[16200,-1],[21700,1]],
      wildlife: [["deer",3950],["fox",10700],["rabbit",13550],["deer",21000],["fox",28200]],
      potholes: [[4650,-0.5],[15000,0.35],[26900,-0.25]]
    },
    "pagoda": {
      profile: "Tight turns & short straights",
      turns: [[1500,3300,340],[4700,6300,-330],[8200,9800,340],[11900,13800,-370],[15800,17500,330],[19600,21500,-380],[24500,26500,400]],
      chicanes: [[5850,-1],[13450,1],[21800,-1]],
      wildlife: [["deer",3600],["fox",10300],["rabbit",17600],["deer",21100],["fox",28100]],
      potholes: [[4300,-0.5],[16900,0.35],[26850,-0.25]]
    },
    "flag-rock": {
      profile: "Long ledges & broad bends",
      turns: [[2400,5800,540],[8500,11100,430],[13500,16800,-530],[19000,22500,530],[25000,27800,-460]],
      chicanes: [[6000,1],[11200,-1],[22400,1]],
      wildlife: [["deer",4550],["fox",10200],["rabbit",16850],["deer",21300],["fox",28050]],
      potholes: [[5300,-0.5],[15000,0.35],[26750,-0.25]]
    },
    "giants-despair": {
      profile: "Sharp bends & punchy exits",
      turns: [[1600,3100,-350],[4600,6500,430],[8100,9800,-390],[12000,13700,390],[15800,17800,-430],[20200,22000,-410],[24800,27000,440]],
      chicanes: [[5750,-1],[13500,1],[22100,-1]],
      wildlife: [["deer",3600],["fox",10100],["rabbit",17650],["deer",21300],["fox",28050]],
      potholes: [[4300,-0.5],[16950,0.35],[26700,-0.25]]
    },
    "duryea": {
      profile: "Double bends & technical links",
      turns: [[1900,4200,410],[5700,7900,390],[9900,12300,-430],[14200,16400,-390],[18500,20500,370],[22200,24300,-390],[25900,28200,410]],
      chicanes: [[7700,1],[11950,-1],[19950,1]],
      wildlife: [["deer",4750],["fox",11200],["rabbit",17150],["deer",23350],["fox",27950]],
      potholes: [[5450,-0.5],[15400,0.35],[27100,-0.25]]
    },
    "waumandee": {
      profile: "Fast straights & farm chicanes",
      turns: [[3200,5000,280],[8500,10300,-290],[13800,15800,310],[19700,21500,-300],[25100,27000,320]],
      chicanes: [[4300,-1],[9600,1],[14950,-1],[20800,1],[26250,-1]],
      wildlife: [["deer",7700],["fox",12300],["rabbit",17650],["deer",19350],["fox",24050]],
      potholes: [[7000,-0.5],[13500,0.35],[24800,-0.25]]
    },
    "empire": {
      profile: "Open dunes & fast sweepers",
      turns: [[2100,5700,500],[7800,11400,-480],[13700,17400,520],[19700,23100,460],[25200,28500,-450]],
      chicanes: [[5800,1],[17500,-1]],
      wildlife: [["deer",4400],["fox",9700],["rabbit",16750],["deer",21150],["fox",27850]],
      potholes: [[5100,-0.5],[15300,0.35],[26650,-0.25]]
    },
    "shamrock-mountain": {
      profile: "Woodland esses & flowing exits",
      turns: [[1700,4000,-370],[6000,8800,450],[10700,13100,-410],[15300,18200,-470],[20300,22800,420],[25000,27600,430]],
      chicanes: [[3900,-1],[8500,1],[16650,-1],[22850,1]],
      wildlife: [["deer",11950],["fox",13350],["rabbit",19400],["deer",21550],["fox",27800]],
      potholes: [[7350,-0.5],[15200,0.35],[26400,-0.25]]
    },
  };
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const smooth = u => u * u * u * (10 + u * (-15 + 6 * u));
  function path(id, d) {
    let x = 0;
    for (const [start, end, offset] of definitions[id].turns)
      x += offset * smooth(clamp((d - start) / (end - start), 0, 1));
    return x;
  }
  const events = {};
  for (const [id, spec] of Object.entries(definitions)) {
    const turns = spec.turns.map(([start, end, offset]) => {
      // Mark the inside of the strongest entry curvature, before the steering unwinds.
      let apex = start + 200, strongest = -1;
      for (let d = start + 200; d <= (start + end) / 2; d += 10) {
        const strength = Math.abs(path(id, d + 200) - 2 * path(id, d) + path(id, d - 200));
        if (strength > strongest) { strongest = strength; apex = d; }
      }
      return Object.freeze({ start, end, offset, apex, lane: Math.sign(offset) * .8 });
    });
    const gates = spec.chicanes.flatMap(([start, side]) => Array.from({ length: 3 }, (_, i) => Object.freeze({ d: start + i * 1000, side: i % 2 ? -side : side })));
    const wildlife = spec.wildlife.map(([kind, d], i) => Object.freeze({ kind, d, side: i % 2 ? 1 : -1 }));
    const potholes = spec.potholes.map(([d, lane]) => Object.freeze({ d, lane, radius: 34 }));
    // Restore the compact diagonal schematic. Do not stretch lateral road offsets
    // to fill the map: that turns even gentle bends into near-horizontal zigzags.
    // Remove the overall sideways drift before adding the bends to the diagonal.
    const finishOffset = path(id, length);
    const map = Array.from({ length: 151 }, (_, i) => {
      const f = i / 150, bend = (path(id, length * f) - finishOffset * f) * Math.sin(Math.PI * f);
      return Object.freeze({ x: 21 + 149 * f + bend * .07, y: 182 - 165 * f });
    });
    const mapPath = map.map((p, i) => (i ? 'L' : 'M') + p.x.toFixed(2) + ' ' + p.y.toFixed(2)).join(' ');
    events[id] = Object.freeze({ profile: spec.profile, turns: Object.freeze(turns), gates: Object.freeze(gates), wildlife: Object.freeze(wildlife), potholes: Object.freeze(potholes), map: Object.freeze(map), mapPath });
  }
  function pointAt(id, fraction) {
    const map = events[id].map, n = clamp(fraction, 0, 1) * (map.length - 1), i = Math.floor(n), a = map[i], b = map[Math.min(i + 1, map.length - 1)], f = n - i;
    return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
  }
  return Object.freeze({ version, ruleset, length, events: Object.freeze(events), path, pointAt });
}
globalThis.MountainCourses = createMountainCourses();
