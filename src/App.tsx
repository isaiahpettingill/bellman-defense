import React, { useEffect, useRef, useState } from 'react';
import type { GameState } from './game/engine';
import { initGameState, updateGame, placeTower, startNextWave, upgradeTower, placeRoadBlock } from './game/engine';

const App: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<GameState>(() => initGameState());
  const requestRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);

  const [selectedTowerId, setSelectedTowerId] = useState<string | null>(null);
  const [selectedRoadNodeId, setSelectedRoadNodeId] = useState<string | null>(null);
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const lastClickRef = useRef<{ nodeId: string, time: number } | null>(null);

  const [dimensions, setDimensions] = useState({ width: 700, height: 700 });
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const updateSize = () => {
      const maxWidth = window.innerWidth - 20;
      const maxHeight = window.innerHeight - 150; 
      
      if (isFullscreen) {
        // In fullscreen, we want the game coordinates (700x700) 
        // to map to the largest possible centered square on the screen.
        const size = Math.min(window.innerWidth, window.innerHeight);
        setDimensions({ width: size, height: size });
      } else {
        const size = Math.min(maxWidth, maxHeight, 700);
        setDimensions({ width: size, height: size });
      }
    };
    window.addEventListener('resize', updateSize);
    updateSize();
    return () => window.removeEventListener('resize', updateSize);
  }, [isFullscreen]);

  const animate = (time: number) => {
    if (lastTimeRef.current !== undefined) {
      const deltaTime = time - lastTimeRef.current;
      setGameState(prev => {
        if (prev.status === 'paused') return prev;
        return updateGame(prev, deltaTime);
      });
    }
    lastTimeRef.current = time;
    requestRef.current = requestAnimationFrame(animate);
  };

  useEffect(() => {
    requestRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(requestRef.current!);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Scaling factor for internal game coordinates (700x700) to actual canvas size
    const scale = dimensions.width / 700;
    ctx.save();
    ctx.scale(scale, scale);

    // Draw Map (Background for path nodes)
    gameState.nodes.forEach(node => {
        if (node.isPath) {
            ctx.fillStyle = '#333';
            ctx.fillRect(node.x - 25, node.y - 25, 50, 50);
        }
    });

    // Draw Edges (Roads)
    gameState.edges.forEach(edge => {
      const from = gameState.nodes.find(n => n.id === edge.from)!;
      const to = gameState.nodes.find(n => n.id === edge.to)!;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.strokeStyle = edge.isWarp ? '#ff00ff' : '#555';
      ctx.lineWidth = edge.isWarp ? 4 : 20;
      if (edge.isWarp) {
          ctx.setLineDash([10, 5]);
      } else {
          ctx.setLineDash([]);
      }
      ctx.stroke();
    });

    // Draw Nodes (Small dots for building/path centers)
    gameState.nodes.forEach(node => {
      ctx.beginPath();
      ctx.arc(node.x, node.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = node.id === gameState.startNodeId ? '#0f0' : (node.id === gameState.endNodeId ? '#f00' : (node.isPath ? '#777' : '#222'));
      ctx.fill();

      // Draw Road Blocks
      const roadBlock = gameState.roadBlocks.find(rb => rb.nodeId === node.id);
      if (roadBlock) {
        ctx.fillStyle = roadBlock.type === 'barricade' ? '#ff9800' : (roadBlock.type === 'spikes' ? '#f44336' : '#9c27b0');
        ctx.font = '24px "Material Icons"';
        const icon = roadBlock.type === 'barricade' ? 'block' : (roadBlock.type === 'spikes' ? 'format_size' : 'opacity');
        ctx.fillText(icon, node.x, node.y);
      }
    });

    // Draw Projectiles
    gameState.projectiles.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#ffeb3b';
        ctx.fill();
    });

    // Draw Towers (Material Icons via Font)
    ctx.font = '32px "Material Icons"';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    gameState.towers.forEach(tower => {
      const node = gameState.nodes.find(n => n.id === tower.nodeId)!;
      
      if (tower.tier === 3) {
        ctx.fillStyle = '#ffeb3b'; // Gold / Neon
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#fff';
      } else {
        ctx.fillStyle = tower.type === 'fast_shot' ? '#ffeb3b' : (tower.type === 'heavy_shot' ? '#f44336' : (tower.type === 'area_damage' ? '#4caf50' : '#888'));
        ctx.shadowBlur = 0;
      }
      
      const icon = tower.tier === 1 ? 'castle' : (tower.tier === 2 ? 'fort' : 'account_balance');
      ctx.fillText(icon, node.x, node.y);
      ctx.shadowBlur = 0; // Reset for others

      if (tower.id === selectedTowerId) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, tower.range, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(3, 169, 244, 0.3)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    });

    // Draw Enemies
    gameState.enemies.forEach(enemy => {
      const colors = {
        basic: '#f44336',
        scout: '#ff9800',
        tank: '#9c27b0',
        ghost: '#81d4fa'
      };
      const icons = {
        basic: 'bug_report',
        scout: 'rocket_launch',
        tank: 'local_shipping',
        ghost: 'visibility_off'
      };
      
      ctx.fillStyle = colors[enemy.type] || '#f44336';
      ctx.font = enemy.type === 'tank' ? '40px "Material Icons"' : (enemy.type === 'scout' ? '24px "Material Icons"' : '32px "Material Icons"');
      ctx.fillText(icons[enemy.type] || 'directions_run', enemy.x, enemy.y);
      
      // HP bar
      ctx.fillStyle = '#000';
      ctx.fillRect(enemy.x - 15, enemy.y - 20, 30, 4);
      ctx.fillStyle = '#4caf50';
      ctx.fillRect(enemy.x - 15, enemy.y - 20, (enemy.hp / enemy.maxHp) * 30, 4);
    });

    // Draw Overlay for build phase/countdown/pause
    if (gameState.status !== 'playing' && gameState.status !== 'game_over') {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fillRect(0, 0, 700, 700);
      ctx.fillStyle = '#fff';
      ctx.font = `bold 35px sans-serif`;
      
      let text = '';
      if (gameState.status === 'build_phase') text = `Build Phase ${Math.ceil(gameState.timer / 1000)}s`;
      else if (gameState.status === 'stage_transition') text = `Stage ${gameState.stage + 1} starting ${Math.ceil(gameState.timer / 1000)}s`;
      else if (gameState.status === 'wave_countdown') text = `Next Wave in ${Math.ceil(gameState.timer / 1000)}s`;
      else if (gameState.status === 'paused') text = 'PAUSED';

      ctx.fillText(text, 350, 350);
    }

    if (gameState.status === 'game_over') {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.fillRect(0, 0, 700, 700);
        ctx.fillStyle = '#f44336';
        ctx.font = `bold 63px sans-serif`;
        ctx.fillText('GAME OVER', 350, 350);
        ctx.font = `24px sans-serif`;
        ctx.fillStyle = '#fff';
        ctx.fillText('Refresh to restart', 350, 400);
    }

    ctx.restore();

  }, [gameState, dimensions]);

  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    handleInteraction(e);
  };

  const handleInteraction = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    let clientX: number;
    let clientY: number;

    if ('touches' in e.nativeEvent) {
      clientX = e.nativeEvent.touches[0].clientX;
      clientY = e.nativeEvent.touches[0].clientY;
    } else {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }

    const scaleX = 700 / rect.width;
    const scaleY = 700 / rect.height;

    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;

    // Check if clicked on a tower
    const clickedTower = gameState.towers.find(t => {
      const node = gameState.nodes.find(n => n.id === t.nodeId)!;
      return Math.sqrt((node.x - x) ** 2 + (node.y - y) ** 2) < 25;
    });

    if (clickedTower) {
      const now = Date.now();
      if ((e as React.MouseEvent).button === 2 || (lastClickRef.current && lastClickRef.current.nodeId === clickedTower.nodeId && now - lastClickRef.current.time < 300)) {
        setSelectedTowerId(clickedTower.id);
        lastClickRef.current = null;
      } else {
        lastClickRef.current = { nodeId: clickedTower.nodeId, time: now };
      }
      return;
    }

    // Only deselect if we didn't click on an upgrade UI (which is outside the canvas)
    // But this handleInteraction is only for the canvas.
    setSelectedTowerId(null);

    // Find closest node
    let closest = gameState.nodes[0];
    let minDist = Infinity;
    gameState.nodes.forEach(node => {
      const dist = Math.sqrt((node.x - x) ** 2 + (node.y - y) ** 2);
      if (dist < minDist) {
        minDist = dist;
        closest = node;
      }
    });

    if (minDist < 30) {
      const now = Date.now();
      if (lastClickRef.current && lastClickRef.current.nodeId === closest.id && now - lastClickRef.current.time < 300) {
        // Double click detected
        if (closest.isPath) {
          setSelectedRoadNodeId(closest.id);
        }
        lastClickRef.current = null;
      } else {
        lastClickRef.current = { nodeId: closest.id, time: now };
        if (!closest.isPath) {
          setGameState(prev => placeTower(prev, closest.id));
        }
      }
    }
  };

  const selectedTower = gameState.towers.find(t => t.id === selectedTowerId);

  return (
    <div style={{ 
      padding: isFullscreen ? '0' : '20px', 
      fontFamily: 'sans-serif', 
      backgroundColor: '#121212', 
      color: '#e0e0e0', 
      minHeight: '100vh', 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center',
      position: isFullscreen ? 'fixed' : 'relative',
      top: 0, left: 0, right: 0, bottom: 0,
      zIndex: isFullscreen ? 1000 : 1,
      overflow: isFullscreen ? 'hidden' : 'auto'
    }}>
      {!isFullscreen && (
        <h1 style={{ fontSize: '1.5rem', textAlign: 'center', margin: '10px 0' }}>
          Bellman Defense: Stages & Waves
        </h1>
      )}
      <div style={{ 
        marginBottom: isFullscreen ? '5px' : '20px', 
        fontSize: isFullscreen ? '12px' : 'clamp(10px, 3.5vw, 16px)', 
        backgroundColor: '#1e1e1e', 
        padding: isFullscreen ? '5px' : '10px', 
        borderRadius: '8px', 
        boxShadow: '0 4px 6px rgba(0,0,0,0.3)', 
        display: 'flex', 
        gap: '8px', 
        alignItems: 'center', 
        width: isFullscreen ? '100%' : 'min(95%, 600px)', 
        justifyContent: 'center', 
        flexWrap: 'wrap' 
      }}>
        <span>💰 <strong>{gameState.money}</strong></span>
        <span>❤️ <strong>{gameState.lives}</strong></span>
        <span>🌍 <strong>S{gameState.stage}</strong></span>
        <span>🌊 <strong>W{gameState.wave}/{gameState.maxWavesPerStage}</strong></span>
        <button 
            onClick={() => setIsFullscreen(!isFullscreen)}
            style={{ backgroundColor: '#607d8b', color: 'white', border: 'none', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
        >
            {isFullscreen ? 'Exit' : 'Fullscreen'}
        </button>
        <button 
            onClick={() => setShowHowToPlay(!showHowToPlay)}
            style={{ backgroundColor: '#2196f3', color: 'white', border: 'none', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
        >
            Info
        </button>
        <button 
            onClick={() => setGameState(prev => ({ ...prev, status: prev.status === 'paused' ? 'playing' : 'paused' }))}
            style={{ backgroundColor: '#ff9800', color: 'white', border: 'none', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
        >
            {gameState.status === 'paused' ? 'Resume' : 'Pause'}
        </button>
        {gameState.status === 'playing' && gameState.enemies.length === 0 && gameState.enemiesToSpawn === 0 && (
            <button 
                onClick={() => setGameState(prev => startNextWave(prev))}
                style={{ backgroundColor: '#4caf50', color: 'white', border: 'none', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
            >
                Next
            </button>
        )}
      </div>

      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <canvas
          ref={canvasRef}
          width={dimensions.width}
          height={dimensions.height}
          onClick={handleInteraction}
          onContextMenu={(e) => { e.preventDefault(); handleInteraction(e); }}
          onTouchStart={handleTouchStart}
          style={{ border: '4px solid #333', borderRadius: '8px', cursor: 'crosshair', backgroundColor: '#000', boxShadow: '0 10px 20px rgba(0,0,0,0.5)', maxWidth: '100%', height: 'auto', touchAction: 'none' }}
        />

        {selectedTower && (
          <div style={{ 
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            padding: '15px', 
            backgroundColor: 'rgba(30, 30, 30, 0.95)', 
            borderRadius: '8px', 
            border: '2px solid #03a9f4', 
            width: '80%', 
            maxWidth: '400px', 
            display: 'flex', 
            flexDirection: 'column', 
            gap: '10px',
            boxShadow: '0 0 20px rgba(0,0,0,0.8)',
            zIndex: 10
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong>Tower: {selectedTower.type.replace('_', ' ').toUpperCase()} (T{selectedTower.tier})</strong>
              <button onClick={() => setSelectedTowerId(null)} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '1.2em' }}>×</button>
            </div>
            {selectedTower.tier === 1 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <button 
                  onClick={() => setGameState(prev => upgradeTower(prev, selectedTower.id, 'fast_shot'))}
                  disabled={gameState.money < 200}
                  style={{ backgroundColor: '#ffeb3b', color: '#000', border: 'none', padding: '10px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', opacity: gameState.money < 200 ? 0.5 : 1 }}
                >
                  Fast Shot (200)
                </button>
                <button 
                  onClick={() => setGameState(prev => upgradeTower(prev, selectedTower.id, 'heavy_shot'))}
                  disabled={gameState.money < 200}
                  style={{ backgroundColor: '#f44336', color: '#fff', border: 'none', padding: '10px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', opacity: gameState.money < 200 ? 0.5 : 1 }}
                >
                  Heavy Shot (200)
                </button>
                <button 
                  onClick={() => setGameState(prev => upgradeTower(prev, selectedTower.id, 'area_damage'))}
                  disabled={gameState.money < 200}
                  style={{ backgroundColor: '#4caf50', color: '#fff', border: 'none', padding: '10px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', opacity: gameState.money < 200 ? 0.5 : 1 }}
                >
                  Area Damage (200)
                </button>
              </div>
            ) : selectedTower.tier === 2 ? (
              <button 
                onClick={() => setGameState(prev => upgradeTower(prev, selectedTower.id, selectedTower.type as any))}
                disabled={gameState.money < 400}
                style={{ backgroundColor: '#ffeb3b', color: '#000', border: '2px solid #fff', padding: '12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', opacity: gameState.money < 400 ? 0.5 : 1 }}
              >
                Upgrade to T3: {selectedTower.type === 'fast_shot' ? 'Even Faster' : (selectedTower.type === 'heavy_shot' ? 'Precise' : 'Spray')} (400)
              </button>
            ) : (
              <p style={{ margin: 0, textAlign: 'center', color: '#ffd700', fontWeight: 'bold' }}>ULTIMATE TIER REACHED</p>
            )}
          </div>
        )}

        {selectedRoadNodeId && (
          <div style={{ 
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            padding: '15px', 
            backgroundColor: 'rgba(30, 30, 30, 0.95)', 
            borderRadius: '8px', 
            border: '2px solid #ff9800', 
            width: '80%', 
            maxWidth: '400px', 
            display: 'flex', 
            flexDirection: 'column', 
            gap: '10px',
            boxShadow: '0 0 20px rgba(0,0,0,0.8)',
            zIndex: 10
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong>Select Road Block (50)</strong>
              <button onClick={() => setSelectedRoadNodeId(null)} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '1.2em' }}>×</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button 
                onClick={() => { setGameState(prev => placeRoadBlock(prev, selectedRoadNodeId, 'barricade')); setSelectedRoadNodeId(null); }}
                disabled={gameState.money < 50}
                style={{ backgroundColor: '#ff9800', color: '#fff', border: 'none', padding: '10px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', opacity: gameState.money < 50 ? 0.5 : 1 }}
              >
                Barricade (Block Path + HP)
              </button>
              <button 
                onClick={() => { setGameState(prev => placeRoadBlock(prev, selectedRoadNodeId, 'spikes')); setSelectedRoadNodeId(null); }}
                disabled={gameState.money < 50}
                style={{ backgroundColor: '#f44336', color: '#fff', border: 'none', padding: '10px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', opacity: gameState.money < 50 ? 0.5 : 1 }}
              >
                Spikes (Damage Cap)
              </button>
              <button 
                onClick={() => { setGameState(prev => placeRoadBlock(prev, selectedRoadNodeId, 'sludge')); setSelectedRoadNodeId(null); }}
                disabled={gameState.money < 50}
                style={{ backgroundColor: '#9c27b0', color: '#fff', border: 'none', padding: '10px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', opacity: gameState.money < 50 ? 0.5 : 1 }}
              >
                Sludge (Slow 5 Enemies)
              </button>
            </div>
          </div>
        )}
      </div>
      {showHowToPlay && (
        <div style={{ marginTop: '20px', maxWidth: '600px', textAlign: 'center', lineHeight: '1.6', color: '#aaa', backgroundColor: '#1e1e1e', padding: '20px', borderRadius: '8px', position: 'relative' }}>
          <button onClick={() => setShowHowToPlay(false)} style={{ position: 'absolute', right: '10px', top: '10px', background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '1.2em' }}>×</button>
          <p><strong>How to Play:</strong> Click on <span style={{color: '#222'}}>dark empty nodes</span> to build towers (Cost: 100). Towers increase the weight of nearby paths, causing enemies to seek safer routes. Double-click on <span style={{color: '#555'}}>roads</span> to place a temporary block (Cost: 50, Duration: 5s).</p>
          <p><strong>Upgrades:</strong> Right-click or double-tap an existing tower to open the upgrade menu.</p>
          <p>Completing all waves in a stage clears the map, <strong>resets towers/money</strong>, and generates a new map!</p>
        </div>
      )}
    </div>
  );
};

export default App;
