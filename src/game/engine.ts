import type { Node, Edge } from './graph';
import { bellmanFord, generateGraph } from './graph';

export interface Enemy {
  id: string;
  type: 'basic' | 'scout' | 'tank' | 'ghost';
  hp: number;
  maxHp: number;
  speed: number;
  currentNodeId: string;
  nextNodeId: string | null;
  x: number;
  y: number;
  progress: number; // 0 to 1 between nodes
  reward: number;
}

export interface Tower {
  id: string;
  nodeId: string;
  type: 'basic' | 'sniper' | 'slow' | 'fast_shot' | 'heavy_shot' | 'area_damage';
  damage: number;
  range: number;
  fireRate: number; // ms
  lastFired: number;
  cost: number;
  tier: number;
  aoe?: number;
}

export interface Projectile {
  id: string;
  x: number;
  y: number;
  targetId: string;
  speed: number;
  damage: number;
  aoe?: number;
}

export type GameStatus = 'build_phase' | 'wave_countdown' | 'playing' | 'stage_transition' | 'game_over' | 'paused';

export interface RoadBlock {
  nodeId: string;
  expiresAt: number;
}

export interface GameState {
  nodes: Node[];
  edges: Edge[];
  enemies: Enemy[];
  towers: Tower[];
  projectiles: Projectile[];
  roadBlocks: RoadBlock[];
  money: number;
  lives: number;
  wave: number;
  stage: number;
  maxWavesPerStage: number;
  status: GameStatus;
  timer: number; // ms
  spawnTimer: number;
  enemiesToSpawn: number;
  startNodeId: string;
  endNodeId: string;
}

const WAVES_PER_STAGE = 5;

const ENEMY_TYPES = {
  scout: { hp: 30, speed: 2.5, reward: 6, icon: 'rocket_launch' },
  basic: { hp: 60, speed: 1.5, reward: 8, icon: 'bug_report' },
  tank: { hp: 200, speed: 0.8, reward: 18, icon: 'local_shipping' },
  ghost: { hp: 100, speed: 1.2, reward: 15, icon: 'visibility_off' },
};

export function initGameState(): GameState {
  const { nodes, edges, startNodeId, endNodeId } = generateGraph(1);

  return {
    nodes,
    edges,
    enemies: [],
    towers: [],
    projectiles: [],
    money: 800,
    lives: 20,
    wave: 0,
    stage: 1,
    maxWavesPerStage: WAVES_PER_STAGE,
    status: 'build_phase',
    timer: 10000,
    spawnTimer: 0,
    enemiesToSpawn: 0,
    startNodeId,
    endNodeId,
    roadBlocks: [],
  };
}

export function updateGame(state: GameState, deltaTime: number): GameState {
  let newState = { ...state };

  if (newState.status === 'build_phase' || newState.status === 'stage_transition' || newState.status === 'wave_countdown') {
    newState.timer -= deltaTime;
    if (newState.timer <= 0) {
      newState = startNextWave(newState);
    }
    return newState;
  }

  if (newState.status === 'game_over') {
    return newState;
  }

  // Update Road Blocks
  const nowMs = Date.now();
  newState.roadBlocks = newState.roadBlocks.filter(rb => rb.expiresAt > nowMs);

  // Calculate dynamic weights
  const dynamicEdges = newState.edges.map(e => {
    let weight = e.weight;
    const toNode = newState.nodes.find(n => n.id === e.to)!;
    
    // Road block check
    const isBlocked = newState.roadBlocks.some(rb => rb.nodeId === e.to || rb.nodeId === e.from);
    if (isBlocked) {
      weight = 1000000; // Effectively infinite
    } else {
      newState.towers.forEach(t => {
        const tNode = newState.nodes.find(n => n.id === t.nodeId)!;
        const dist = Math.sqrt((tNode.x - toNode.x)**2 + (tNode.y - toNode.y)**2);
        if (dist < 100) {
          weight += 20;
        }
      });
    }

    return { ...e, weight };
  });

  // Spawn logic
  if (newState.enemiesToSpawn > 0) {
    newState.spawnTimer += deltaTime;
    if (newState.spawnTimer > 1000) {
      newState.spawnTimer = 0;
      newState.enemiesToSpawn--;
      
      const startNode = newState.nodes.find(n => n.id === newState.startNodeId)!;
      
      // Determine enemy type based on wave
      let type: 'basic' | 'scout' | 'tank' | 'ghost' = 'basic';
      const rand = Math.random();
      
      if (newState.stage >= 3 && rand < 0.15) {
        type = 'ghost';
      } else if (newState.wave % 5 === 0 && rand < 0.3) {
        type = 'tank';
      } else if (rand < 0.2) {
        type = 'scout';
      }
      
      const baseStats = ENEMY_TYPES[type];
      const scaling = 1 + (newState.stage - 1) * 0.5 + (newState.wave - 1) * 0.1;

      newState.enemies.push({
        id: Math.random().toString(36).substr(2, 9),
        type,
        hp: baseStats.hp * scaling,
        maxHp: baseStats.hp * scaling,
        speed: baseStats.speed,
        currentNodeId: newState.startNodeId,
        nextNodeId: null,
        x: startNode.x,
        y: startNode.y,
        progress: 0,
        reward: baseStats.reward,
      });
    }
  }

  // Enemy movement & pathfinding
  const reversedEdges = dynamicEdges.map(e => ({ ...e, from: e.to, to: e.from }));
  const toEnd = bellmanFord(newState.nodes, reversedEdges, newState.endNodeId);

  newState.enemies = newState.enemies.filter(enemy => {
    enemy.nextNodeId = toEnd.predecessors[enemy.currentNodeId];

    if (!enemy.nextNodeId) {
      if (enemy.currentNodeId === newState.endNodeId) {
        newState.lives -= 1;
        if (newState.lives <= 0) newState.status = 'game_over';
        return false;
      }
      return true;
    }

    const isNextNodeBlocked = newState.roadBlocks.some(rb => rb.nodeId === enemy.nextNodeId);
    if (!isNextNodeBlocked) {
      enemy.progress += (enemy.speed * deltaTime) / 1000;
    }
    
    const startNode = newState.nodes.find(n => n.id === enemy.currentNodeId)!;
    const endNode = newState.nodes.find(n => n.id === enemy.nextNodeId)!;

    if (enemy.progress >= 1) {
      enemy.progress = 0;
      enemy.currentNodeId = enemy.nextNodeId;
      enemy.x = endNode.x;
      enemy.y = endNode.y;
    } else if (!isNextNodeBlocked) {
      enemy.x = startNode.x + (endNode.x - startNode.x) * enemy.progress;
      enemy.y = startNode.y + (endNode.y - startNode.y) * enemy.progress;
    }

    return enemy.hp > 0;
  });

  // Projectiles movement
  newState.projectiles = newState.projectiles.filter(p => {
    const target = newState.enemies.find(e => e.id === p.targetId);
    if (!target) return false;

    const dx = target.x - p.x;
    const dy = target.y - p.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 5) {
      if (p.aoe) {
        newState.enemies.forEach(e => {
          const edx = e.x - p.x;
          const edy = e.y - p.y;
          const edist = Math.sqrt(edx * edx + edy * edy);
          if (edist <= p.aoe!) {
            e.hp -= p.damage;
            if (e.hp <= 0 && e.hp + p.damage > 0) {
              newState.money += e.reward;
            }
          }
        });
      } else {
        target.hp -= p.damage;
        if (target.hp <= 0) {
          newState.money += target.reward;
        }
      }
      return false;
    }

    const move = (p.speed * deltaTime) / 1000;
    p.x += (dx / dist) * move;
    p.y += (dy / dist) * move;
    return true;
  });

  // Towers shooting
  const now = Date.now();
  for (const tower of newState.towers) {
    if (now - tower.lastFired > tower.fireRate) {
      const towerNode = newState.nodes.find(n => n.id === tower.nodeId)!;
      const target = newState.enemies.find(e => {
        const dist = Math.sqrt((e.x - towerNode.x)**2 + (e.y - towerNode.y)**2);
        return dist <= tower.range;
      });

      if (target) {
        newState.projectiles.push({
          id: Math.random().toString(36).substr(2, 9),
          x: towerNode.x,
          y: towerNode.y,
          targetId: target.id,
          speed: 300,
          damage: tower.damage,
          aoe: tower.aoe,
        });
        tower.lastFired = now;
      }
    }
  }

  // Wave completion check
  if (newState.enemies.length === 0 && newState.enemiesToSpawn === 0 && newState.status === 'playing') {
    if (newState.wave >= newState.maxWavesPerStage) {
      newState.status = 'stage_transition';
      newState.timer = 10000; // 10s build phase for next stage
    } else {
      newState.status = 'wave_countdown';
      newState.timer = 5000; // 5s between waves
    }
  }

  return newState;
}

export function startNextWave(state: GameState): GameState {
  let newState = { ...state };
  if (newState.wave >= newState.maxWavesPerStage) {
    // Stage Transition: RESET towers and money
    const nextStage = newState.stage + 1;
    const map = generateGraph(nextStage);
    newState = {
      ...newState,
      ...map,
      stage: nextStage,
      wave: 1,
      lives: 20,
      money: 800,
      towers: [],
      enemies: [],
      projectiles: [],
      roadBlocks: [],
      status: 'playing',
      enemiesToSpawn: 10 + nextStage * 2,
    };
  } else {
    newState.wave += 1;
    newState.status = 'playing';
    newState.enemiesToSpawn = 10 + newState.wave * 2;
  }
  return newState;
}

export function upgradeTower(state: GameState, towerId: string, upgradeType: 'fast_shot' | 'heavy_shot' | 'area_damage'): GameState {
  const towerIndex = state.towers.findIndex(t => t.id === towerId);
  if (towerIndex === -1 || state.money < 200) return state;

  const tower = state.towers[towerIndex];
  const newTowers = [...state.towers];
  const upgradedTower = { ...tower };

  if (tower.tier === 1) {
    upgradedTower.tier = 2;
    upgradedTower.cost = tower.cost + 200;

    if (upgradeType === 'fast_shot') {
      upgradedTower.type = 'fast_shot';
      upgradedTower.fireRate = 300;
      upgradedTower.damage = 8;
    } else if (upgradeType === 'heavy_shot') {
      upgradedTower.type = 'heavy_shot';
      upgradedTower.fireRate = 1500;
      upgradedTower.damage = 50;
      upgradedTower.range = 180;
    } else if (upgradeType === 'area_damage') {
      upgradedTower.type = 'area_damage';
      upgradedTower.aoe = 50;
      upgradedTower.damage = 15;
      upgradedTower.fireRate = 1200;
    }
  } else if (tower.tier === 2) {
    if (state.money < 400) return state;
    upgradedTower.tier = 3;
    upgradedTower.cost = tower.cost + 400;

    if (tower.type === 'fast_shot') {
      upgradedTower.fireRate = 100;
      upgradedTower.damage = 12;
    } else if (tower.type === 'heavy_shot') {
      upgradedTower.fireRate = 3000;
      upgradedTower.damage = 250;
      upgradedTower.range = 300;
    } else if (tower.type === 'area_damage') {
      upgradedTower.aoe = 100;
      upgradedTower.damage = 40;
      upgradedTower.fireRate = 2000;
    }
  } else {
    return state;
  }

  const cost = tower.tier === 1 ? 200 : 400;
  if (state.money < cost) return state;

  newTowers[towerIndex] = upgradedTower;

  return {
    ...state,
    money: state.money - cost,
    towers: newTowers,
  };
}

export function placeTower(state: GameState, nodeId: string): GameState {
  const node = state.nodes.find(n => n.id === nodeId);
  // Rule: Cannot build on path nodes
  if (!node || node.isPath || state.money < 100) return state;
  if (state.towers.find(t => t.nodeId === nodeId)) return state;

  const newTower: Tower = {
    id: Math.random().toString(36).substr(2, 9),
    nodeId,
    type: 'basic',
    damage: 10,
    range: 120,
    fireRate: 800,
    lastFired: 0,
    cost: 100,
    tier: 1,
  };

  return {
    ...state,
    money: state.money - 100,
    towers: [...state.towers, newTower],
  };
}

export function placeRoadBlock(state: GameState, nodeId: string): GameState {
  const node = state.nodes.find(n => n.id === nodeId);
  if (!node || !node.isPath || state.money < 50) return state;
  if (state.roadBlocks.find(rb => rb.nodeId === nodeId)) return state;

  const newRoadBlock: RoadBlock = {
    nodeId,
    expiresAt: Date.now() + 5000,
  };

  return {
    ...state,
    money: state.money - 50,
    roadBlocks: [...state.roadBlocks, newRoadBlock],
  };
}

