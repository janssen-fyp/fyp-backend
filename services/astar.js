function euclideanDistance(coordA, coordB) {
  const [lat1, lng1] = coordA;
  const [lat2, lng2] = coordB;

  const dLat = lat1 - lat2;
  const dLng = lng1 - lng2;

  return Math.sqrt(dLat * dLat + dLng * dLng);
}

function reconstructPath(cameFrom, current) {
  const path = [current];

  while (cameFrom[current]) {
    current = cameFrom[current];
    path.unshift(current);
  }

  return path;
}

function astar(graph, nodeCoords, start, goal) {
  if (!graph[start]) {
    throw new Error(`Start node "${start}" does not exist.`);
  }

  if (!graph[goal]) {
    throw new Error(`Goal node "${goal}" does not exist.`);
  }

  const openSet = new Set([start]);
  const cameFrom = {};

  const gScore = {};
  const fScore = {};

  for (const node of Object.keys(graph)) {
    gScore[node] = Infinity;
    fScore[node] = Infinity;
  }

  gScore[start] = 0;
  fScore[start] = euclideanDistance(nodeCoords[start], nodeCoords[goal]);

  while (openSet.size > 0) {
    let current = null;
    let lowestF = Infinity;

    for (const node of openSet) {
      if (fScore[node] < lowestF) {
        lowestF = fScore[node];
        current = node;
      }
    }

    if (current === goal) {
      return reconstructPath(cameFrom, current);
    }

    openSet.delete(current);

    for (const neighbor of graph[current]) {
      const tentativeG = gScore[current] + neighbor.weight;

      if (tentativeG < gScore[neighbor.to]) {
        cameFrom[neighbor.to] = current;
        gScore[neighbor.to] = tentativeG;
        fScore[neighbor.to] =
          tentativeG + euclideanDistance(nodeCoords[neighbor.to], nodeCoords[goal]);

        openSet.add(neighbor.to);
      }
    }
  }

  return null;
}

module.exports = {
  astar,
};