const nodeCoords = {
  a: [53.3498, -6.2603],
  b: [53.3515, -6.2580],
  c: [53.3508, -6.2538],
  d: [53.3475, -6.2585],
  e: [53.3468, -6.2540],
  f: [53.3488, -6.2512],
};

const graph = {
  a: [
    { to: "b", baseWeight: 1.4 },
    { to: "d", baseWeight: 1.3 },
  ],
  b: [
    { to: "a", baseWeight: 1.4 },
    { to: "c", baseWeight: 1.2 },
  ],
  c: [
    { to: "b", baseWeight: 1.2 },
    { to: "f", baseWeight: 1.4 },
    { to: "e", baseWeight: 2.0 },
  ],
  d: [
    { to: "a", baseWeight: 1.3 },
    { to: "e", baseWeight: 1.1 },
  ],
  e: [
    { to: "d", baseWeight: 1.1 },
    { to: "f", baseWeight: 1.2 },
    { to: "c", baseWeight: 2.0 },
  ],
  f: [
    { to: "c", baseWeight: 1.4 },
    { to: "e", baseWeight: 1.2 },
  ],
};

module.exports = {
  graph,
  nodeCoords,
};