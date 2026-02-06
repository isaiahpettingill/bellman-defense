export interface Node {
  id: string;
  x: number;
  y: number;
  isPath: boolean;
  towerId?: string;
}

export interface Edge {
  from: string;
  to: string;
  weight: number;
  isWarp: boolean;
}

export interface PathResult {
  distances: Record<string, number>;
  predecessors: Record<string, string | null>;
  hasNegativeCycle: boolean;
}

const GRID_SIZE = 10;
const NODE_SPACING = 60;
const MARGIN = 40;

export function generateGraph(stage: number) {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const pathNodeIds = new Set<string>();

  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      const id = `node_${x}_${y}`;
      nodes.push({
        id,
        x: MARGIN + x * NODE_SPACING,
        y: MARGIN + y * NODE_SPACING,
        isPath: false,
      });
    }
  }

  const startNodeId = 'node_0_0';
  const endNodeId = `node_${GRID_SIZE - 1}_${GRID_SIZE - 1}`;

  // Ensure paths
  // Stage 1: 1 path
  // Stage 2: 2 paths
  // Stage 3+: 3 paths
  const numPaths = Math.min(stage, 3);
  const createPath = () => {
    let curX = 0;
    let curY = 0;
    pathNodeIds.add(`node_${curX}_${curY}`);
    while (curX < GRID_SIZE - 1 || curY < GRID_SIZE - 1) {
      if (curX < GRID_SIZE - 1 && (curY === GRID_SIZE - 1 || Math.random() > 0.5)) {
        curX++;
      } else if (curY < GRID_SIZE - 1) {
        curY++;
      }
      pathNodeIds.add(`node_${curX}_${curY}`);
    }
  };
  
  for (let i = 0; i < numPaths; i++) {
    createPath();
  }

  // Random nodes to add complexity based on stage
  const extraNodes = 10 + (stage * 5);
  for (let i = 0; i < extraNodes; i++) {
    const rx = Math.floor(Math.random() * GRID_SIZE);
    const ry = Math.floor(Math.random() * GRID_SIZE);
    pathNodeIds.add(`node_${rx}_${ry}`);
  }

  nodes.forEach(n => {
    if (pathNodeIds.has(n.id)) {
      n.isPath = true;
    }
  });

  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      const id = `node_${x}_${y}`;
      const neighbors = [
        { x: x + 1, y: y },
        { x: x, y: y + 1 },
      ];
      neighbors.forEach(nb => {
        if (nb.x < GRID_SIZE && nb.y < GRID_SIZE) {
          const nid = `node_${nb.x}_${nb.y}`;
          if (pathNodeIds.has(id) && pathNodeIds.has(nid)) {
            edges.push({ from: id, to: nid, weight: 10, isWarp: false });
            edges.push({ from: nid, to: id, weight: 10, isWarp: false });
          }
        }
      });
    }
  }

  // Warp tunnels for later levels
  if (stage >= 2) {
    const pNodes = nodes.filter(n => n.isPath);
    if (pNodes.length > 10) {
      // Warp Start: Should not be too late in the map
      // Warp Exit: MUST NOT be within the last 40% of the map (Manhattan distance to EXIT >= 8)
      const MIN_DIST_TO_END = 8;

      const candidateFromNodes = pNodes.filter(n => {
        const x = (n.x - MARGIN) / NODE_SPACING;
        const y = (n.y - MARGIN) / NODE_SPACING;
        const distFromStart = x + y;
        return distFromStart < (GRID_SIZE * 0.4); // Start warps in first 40%
      });

      const candidateToNodes = pNodes.filter(n => {
        const x = (n.x - MARGIN) / NODE_SPACING;
        const y = (n.y - MARGIN) / NODE_SPACING;
        const distToEnd = (GRID_SIZE - 1 - x) + (GRID_SIZE - 1 - y);
        return distToEnd >= MIN_DIST_TO_END;
      });
      
      if (candidateFromNodes.length > 0 && candidateToNodes.length > 0) {
        const from = candidateFromNodes[Math.floor(Math.random() * candidateFromNodes.length)];
        const to = candidateToNodes[Math.floor(Math.random() * candidateToNodes.length)];
        
        const fromX = (from.x - MARGIN) / NODE_SPACING;
        const fromY = (from.y - MARGIN) / NODE_SPACING;
        const toX = (to.x - MARGIN) / NODE_SPACING;
        const toY = (to.y - MARGIN) / NODE_SPACING;
        
        const warpDistance = (toX + toY) - (fromX + fromY);
        const totalDistanceEstimate = (GRID_SIZE - 1) * 2;

        // Ensure warp moves forward, isn't too short, and doesn't skip > 50% of the map
        if (from.id !== to.id && warpDistance > 2 && warpDistance < (totalDistanceEstimate * 0.5)) {
            edges.push({ from: from.id, to: to.id, weight: -15, isWarp: true });
        }
      }
    }
  }

  return { nodes, edges, startNodeId, endNodeId };
}

export function bellmanFord(nodes: Node[], edges: Edge[], sourceId: string): PathResult {
  const distances: Record<string, number> = {};
  const predecessors: Record<string, string | null> = {};

  for (const node of nodes) {
    distances[node.id] = Infinity;
    predecessors[node.id] = null;
  }
  distances[sourceId] = 0;

  for (let i = 0; i < nodes.length - 1; i++) {
    let changed = false;
    for (const edge of edges) {
      if (distances[edge.from] + edge.weight < distances[edge.to]) {
        distances[edge.to] = distances[edge.from] + edge.weight;
        predecessors[edge.to] = edge.from;
        changed = true;
      }
    }
    if (!changed) break;
  }

  let hasNegativeCycle = false;
  for (const edge of edges) {
    if (distances[edge.from] + edge.weight < distances[edge.to]) {
      hasNegativeCycle = true;
      break;
    }
  }

  return { distances, predecessors, hasNegativeCycle };
}

export function getPath(predecessors: Record<string, string | null>, targetId: string): string[] {
  const path: string[] = [];
  let current: string | null = targetId;
  while (current !== null) {
    path.unshift(current);
    current = predecessors[current];
  }
  return path;
}
