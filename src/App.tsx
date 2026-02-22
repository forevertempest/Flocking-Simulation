import { useCallback, useEffect, useRef, useState } from "react";

interface Boid {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ax: number;
  ay: number;
  color: string;
  hue: number;
}

interface FlockingParams {
  separation: number;
  alignment: number;
  cohesion: number;
  perceptionRadius: number;
  maxSpeed: number;
  maxForce: number;
  trailLength: number;
  mouseForce: number;
}

const DEFAULT_PARAMS: FlockingParams = {
  separation: 1.5,
  alignment: 1.0,
  cohesion: 1.0,
  perceptionRadius: 50,
  maxSpeed: 4,
  maxForce: 0.1,
  trailLength: 8,
  mouseForce: 100,
};

const THEMES = {
  ocean: { bg: "#0a1628", accent: "#00d4ff", secondary: "#0066ff" },
  sunset: { bg: "#1a0a1a", accent: "#ff6b35", secondary: "#f7931e" },
  forest: { bg: "#0a1a0a", accent: "#00ff88", secondary: "#44ff44" },
  cosmic: { bg: "#0a0a1a", accent: "#ff00ff", secondary: "#8800ff" },
  monochrome: { bg: "#0a0a0a", accent: "#ffffff", secondary: "#888888" },
};

type ThemeKey = keyof typeof THEMES;

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const boidsRef = useRef<Boid[]>([]);
  const mouseRef = useRef({ x: 0, y: 0, active: false, isRepel: false });
  const trailsRef = useRef<Map<number, { x: number; y: number }[]>>(new Map());
  const frameCountRef = useRef(0);
  const fpsRef = useRef(0);
  const lastTimeRef = useRef(performance.now());
  
  const [params, setParams] = useState<FlockingParams>(DEFAULT_PARAMS);
  const [boidCount, setBoidCount] = useState(1500);
  const [isRunning, setIsRunning] = useState(true);
  const [theme, setTheme] = useState<ThemeKey>("ocean");
  const [showTrails, setShowTrails] = useState(true);
  const [renderMode, setRenderMode] = useState<"arrows" | "dots" | "fish" | "birds">("arrows");
  const [fps, setFps] = useState(0);
  const [showControls, setShowControls] = useState(true);

  // Initialize boids
  const initBoids = useCallback((count: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const boids: Boid[] = [];
    const currentTheme = THEMES[theme];
    
    for (let i = 0; i < count; i++) {
      const hue = Math.random() * 60 - 30; // Variation around theme color
      boids.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 2,
        vy: (Math.random() - 0.5) * 2,
        ax: 0,
        ay: 0,
        color: currentTheme.accent,
        hue: hue,
      });
    }
    
    boidsRef.current = boids;
    trailsRef.current = new Map();
    for (let i = 0; i < count; i++) {
      trailsRef.current.set(i, []);
    }
  }, [theme]);

  // Vector math helpers
  const limit = (vx: number, vy: number, max: number) => {
    const mag = Math.sqrt(vx * vx + vy * vy);
    if (mag > max && mag > 0) {
      return { x: (vx / mag) * max, y: (vy / mag) * max };
    }
    return { x: vx, y: vy };
  };

  const normalize = (x: number, y: number) => {
    const mag = Math.sqrt(x * x + y * y);
    if (mag === 0) return { x: 0, y: 0 };
    return { x: x / mag, y: y / mag };
  };

  // Flocking behavior
  const computeFlocking = useCallback((boid: Boid, boids: Boid[], index: number) => {
    let sepX = 0, sepY = 0;
    let aliX = 0, aliY = 0;
    let cohX = 0, cohY = 0;
    let count = 0;

    for (let i = 0; i < boids.length; i++) {
      if (i === index) continue;
      
      const other = boids[i];
      const dx = other.x - boid.x;
      const dy = other.y - boid.y;
      const distSq = dx * dx + dy * dy;
      
      if (distSq < params.perceptionRadius * params.perceptionRadius && distSq > 0) {
        const dist = Math.sqrt(distSq);
        
        // Separation
        sepX -= dx / dist;
        sepY -= dy / dist;
        
        // Alignment
        aliX += other.vx;
        aliY += other.vy;
        
        // Cohesion
        cohX += other.x;
        cohY += other.y;
        
        count++;
      }
    }

    if (count > 0) {
      // Separation
      sepX *= params.separation;
      sepY *= params.separation;
      
      // Alignment
      aliX /= count;
      aliY /= count;
      const aliNorm = normalize(aliX - boid.vx, aliY - boid.vy);
      aliX = aliNorm.x * params.alignment;
      aliY = aliNorm.y * params.alignment;
      
      // Cohesion
      cohX /= count;
      cohY /= count;
      const cohNorm = normalize(cohX - boid.x, cohY - boid.y);
      cohX = cohNorm.x * params.cohesion;
      cohY = cohNorm.y * params.cohesion;
    }

    return { sepX, sepY, aliX, aliY, cohX, cohY };
  }, [params]);

  // Update boids
  const updateBoid = useCallback((boid: Boid, index: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Compute flocking forces
    const forces = computeFlocking(boid, boidsRef.current, index);
    
    // Apply forces
    boid.ax = forces.sepX + forces.aliX + forces.cohX;
    boid.ay = forces.sepY + forces.aliY + forces.cohY;

    // Mouse interaction
    if (mouseRef.current.active) {
      const dx = mouseRef.current.x - boid.x;
      const dy = mouseRef.current.y - boid.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      if (dist < params.mouseForce) {
        const force = (1 - dist / params.mouseForce) * 2;
        if (mouseRef.current.isRepel) {
          boid.ax -= (dx / dist) * force;
          boid.ay -= (dy / dist) * force;
        } else {
          boid.ax += (dx / dist) * force;
          boid.ay += (dy / dist) * force;
        }
      }
    }

    // Update velocity
    boid.vx += boid.ax;
    boid.vy += boid.ay;

    // Limit speed
    const limited = limit(boid.vx, boid.vy, params.maxSpeed);
    boid.vx = limited.x;
    boid.vy = limited.y;

    // Update position
    boid.x += boid.vx;
    boid.y += boid.vy;

    // Wrap around edges
    if (boid.x < 0) boid.x = canvas.width;
    if (boid.x > canvas.width) boid.x = 0;
    if (boid.y < 0) boid.y = canvas.height;
    if (boid.y > canvas.height) boid.y = 0;

    // Update trails
    if (showTrails && frameCountRef.current % 2 === 0) {
      const trail = trailsRef.current.get(index);
      if (trail) {
        trail.push({ x: boid.x, y: boid.y });
        if (trail.length > params.trailLength) {
          trail.shift();
        }
      }
    }
  }, [computeFlocking, params, showTrails]);

  // Draw boid
  const drawBoid = (ctx: CanvasRenderingContext2D, boid: Boid, _index: number) => {
    const angle = Math.atan2(boid.vy, boid.vx);
    const speed = Math.sqrt(boid.vx * boid.vx + boid.vy * boid.vy);
    const size = 3 + speed * 0.5;
    
    ctx.save();
    ctx.translate(boid.x, boid.y);
    ctx.rotate(angle);

    const currentTheme = THEMES[theme];
    const alpha = 0.6 + (speed / params.maxSpeed) * 0.4;

    if (renderMode === "arrows") {
      // Arrow shape
      ctx.beginPath();
      ctx.moveTo(size * 2, 0);
      ctx.lineTo(-size, -size);
      ctx.lineTo(-size * 0.5, 0);
      ctx.lineTo(-size, size);
      ctx.closePath();
      ctx.fillStyle = currentTheme.accent;
      ctx.globalAlpha = alpha;
      ctx.fill();
    } else if (renderMode === "dots") {
      // Simple dot
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.8, 0, Math.PI * 2);
      ctx.fillStyle = currentTheme.accent;
      ctx.globalAlpha = alpha;
      ctx.fill();
    } else if (renderMode === "fish") {
      // Fish shape
      ctx.beginPath();
      ctx.ellipse(0, 0, size * 1.5, size * 0.6, 0, 0, Math.PI * 2);
      ctx.fillStyle = currentTheme.accent;
      ctx.globalAlpha = alpha;
      ctx.fill();
      // Tail
      ctx.beginPath();
      ctx.moveTo(-size, 0);
      ctx.lineTo(-size * 2, -size * 0.8);
      ctx.lineTo(-size * 2, size * 0.8);
      ctx.closePath();
      ctx.fill();
    } else if (renderMode === "birds") {
      // Bird/V shape
      ctx.beginPath();
      ctx.moveTo(size, 0);
      ctx.lineTo(0, -size * 0.8);
      ctx.lineTo(size * 0.3, 0);
      ctx.lineTo(0, size * 0.8);
      ctx.closePath();
      ctx.fillStyle = currentTheme.accent;
      ctx.globalAlpha = alpha;
      ctx.fill();
    }

    ctx.restore();
  };

  // Draw trails
  const drawTrails = (ctx: CanvasRenderingContext2D) => {
    if (!showTrails) return;
    
    const currentTheme = THEMES[theme];
    ctx.strokeStyle = currentTheme.accent;
    
    trailsRef.current.forEach((trail) => {
      if (trail.length < 2) return;
      
      ctx.beginPath();
      ctx.moveTo(trail[0].x, trail[0].y);
      
      for (let i = 1; i < trail.length; i++) {
        const alpha = (i / trail.length) * 0.3;
        ctx.globalAlpha = alpha;
        ctx.lineTo(trail[i].x, trail[i].y);
      }
      
      ctx.stroke();
    });
    
    ctx.globalAlpha = 1;
  };

  // Animation loop
  const animate = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    // FPS calculation
    frameCountRef.current++;
    const now = performance.now();
    if (now - lastTimeRef.current >= 1000) {
      fpsRef.current = frameCountRef.current;
      setFps(frameCountRef.current);
      frameCountRef.current = 0;
      lastTimeRef.current = now;
    }

    // Clear canvas with fade effect
    const currentTheme = THEMES[theme];
    ctx.fillStyle = currentTheme.bg + "20"; // Semi-transparent for trails
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Clear completely every few frames to prevent buildup
    if (frameCountRef.current % 10 === 0) {
      ctx.fillStyle = currentTheme.bg;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // Update and draw boids
    const boids = boidsRef.current;
    
    // Update all boids
    for (let i = 0; i < boids.length; i++) {
      updateBoid(boids[i], i);
    }

    // Draw trails first
    drawTrails(ctx);

    // Draw boids
    for (let i = 0; i < boids.length; i++) {
      drawBoid(ctx, boids[i], i);
    }

    // Draw mouse indicator
    if (mouseRef.current.active) {
      ctx.beginPath();
      ctx.arc(mouseRef.current.x, mouseRef.current.y, params.mouseForce, 0, Math.PI * 2);
      ctx.strokeStyle = mouseRef.current.isRepel ? "#ff4444" : "#44ff44";
      ctx.globalAlpha = 0.2;
      ctx.stroke();
      ctx.globalAlpha = 1;
      
      ctx.beginPath();
      ctx.arc(mouseRef.current.x, mouseRef.current.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = mouseRef.current.isRepel ? "#ff4444" : "#44ff44";
      ctx.fill();
    }

    if (isRunning) {
      animationRef.current = requestAnimationFrame(animate);
    }
  }, [updateBoid, isRunning, theme, showTrails, renderMode, params.mouseForce]);

  // Handle resize
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Initialize and start
  useEffect(() => {
    initBoids(boidCount);
  }, [boidCount, initBoids]);

  // Animation control
  useEffect(() => {
    if (isRunning) {
      animationRef.current = requestAnimationFrame(animate);
    }
    return () => cancelAnimationFrame(animationRef.current);
  }, [isRunning, animate]);

  // Mouse handlers
  const handleMouseMove = (e: React.MouseEvent) => {
    mouseRef.current.x = e.clientX;
    mouseRef.current.y = e.clientY;
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    mouseRef.current.active = true;
    mouseRef.current.isRepel = e.button === 2; // Right click to repel
    mouseRef.current.x = e.clientX;
    mouseRef.current.y = e.clientY;
  };

  const handleMouseUp = () => {
    mouseRef.current.active = false;
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
  };

  // Preset configurations
  const applyPreset = (preset: string) => {
    switch (preset) {
      case "swarm":
        setParams({ ...DEFAULT_PARAMS, separation: 0.5, alignment: 2, cohesion: 2 });
        break;
      case "flock":
        setParams(DEFAULT_PARAMS);
        break;
      case "chaos":
        setParams({ ...DEFAULT_PARAMS, separation: 0.2, alignment: 0.5, cohesion: 0.3, maxSpeed: 8 });
        break;
      case "order":
        setParams({ ...DEFAULT_PARAMS, separation: 2, alignment: 2, cohesion: 1, maxSpeed: 2 });
        break;
      case "vortex":
        setParams({ ...DEFAULT_PARAMS, separation: 1, alignment: 0.5, cohesion: 0.5, mouseForce: 300 });
        break;
    }
  };

  return (
    <div className="relative w-full h-screen overflow-hidden bg-black">
      {/* Canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 cursor-crosshair"
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onContextMenu={handleContextMenu}
      />

      {/* Toggle Controls Button */}
      <button
        onClick={() => setShowControls(!showControls)}
        className="absolute top-4 right-4 z-20 px-4 py-2 rounded-lg backdrop-blur-md border transition-all duration-300 hover:scale-105"
        style={{
          backgroundColor: THEMES[theme].bg + "cc",
          borderColor: THEMES[theme].accent + "40",
          color: THEMES[theme].accent,
        }}
      >
        {showControls ? "Hide Controls" : "Show Controls"}
      </button>

      {/* Control Panel */}
      {showControls && (
        <div
          className="absolute top-4 left-4 z-10 w-80 max-h-[90vh] overflow-y-auto rounded-xl backdrop-blur-md border p-6 transition-all duration-300"
          style={{
            backgroundColor: THEMES[theme].bg + "dd",
            borderColor: THEMES[theme].accent + "30",
          }}
        >
          <h1
            className="text-2xl font-bold mb-1"
            style={{ color: THEMES[theme].accent }}
          >
            Flocking Simulation
          </h1>
          <p className="text-sm mb-6 opacity-70" style={{ color: THEMES[theme].accent }}>
            {boidCount.toLocaleString()} boids • {fps} FPS
          </p>

          {/* Playback Controls */}
          <div className="flex gap-2 mb-6">
            <button
              onClick={() => setIsRunning(!isRunning)}
              className="flex-1 px-4 py-2 rounded-lg font-medium transition-all duration-200 hover:scale-105"
              style={{
                backgroundColor: isRunning ? THEMES[theme].accent + "30" : THEMES[theme].accent,
                color: isRunning ? THEMES[theme].accent : THEMES[theme].bg,
              }}
            >
              {isRunning ? "Pause" : "Play"}
            </button>
            <button
              onClick={() => initBoids(boidCount)}
              className="px-4 py-2 rounded-lg font-medium transition-all duration-200 hover:scale-105"
              style={{
                backgroundColor: THEMES[theme].accent + "20",
                color: THEMES[theme].accent,
              }}
            >
              Reset
            </button>
          </div>

          {/* Presets */}
          <div className="mb-6">
            <label className="text-xs font-semibold uppercase tracking-wider mb-3 block" style={{ color: THEMES[theme].accent + "cc" }}>
              Presets
            </label>
            <div className="grid grid-cols-3 gap-2">
              {["flock", "swarm", "chaos", "order", "vortex"].map((preset) => (
                <button
                  key={preset}
                  onClick={() => applyPreset(preset)}
                  className="px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 hover:scale-105 capitalize"
                  style={{
                    backgroundColor: THEMES[theme].accent + "15",
                    color: THEMES[theme].accent,
                  }}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          {/* Theme Selection */}
          <div className="mb-6">
            <label className="text-xs font-semibold uppercase tracking-wider mb-3 block" style={{ color: THEMES[theme].accent + "cc" }}>
              Theme
            </label>
            <div className="flex gap-2 flex-wrap">
              {(Object.keys(THEMES) as ThemeKey[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTheme(t)}
                  className="w-8 h-8 rounded-lg transition-all duration-200 hover:scale-110"
                  style={{
                    backgroundColor: THEMES[t].accent,
                    boxShadow: theme === t ? `0 0 0 2px ${THEMES[t].bg}, 0 0 0 4px ${THEMES[t].accent}` : "none",
                  }}
                  title={t}
                />
              ))}
            </div>
          </div>

          {/* Render Mode */}
          <div className="mb-6">
            <label className="text-xs font-semibold uppercase tracking-wider mb-3 block" style={{ color: THEMES[theme].accent + "cc" }}>
              Render Mode
            </label>
            <div className="grid grid-cols-2 gap-2">
              {["arrows", "dots", "fish", "birds"].map((mode) => (
                <button
                  key={mode}
                  onClick={() => setRenderMode(mode as typeof renderMode)}
                  className="px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 capitalize"
                  style={{
                    backgroundColor: renderMode === mode ? THEMES[theme].accent : THEMES[theme].accent + "15",
                    color: renderMode === mode ? THEMES[theme].bg : THEMES[theme].accent,
                  }}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          {/* Boid Count */}
          <div className="mb-6">
            <label className="text-xs font-semibold uppercase tracking-wider mb-3 block" style={{ color: THEMES[theme].accent + "cc" }}>
              Boid Count: {boidCount}
            </label>
            <input
              type="range"
              min="100"
              max="3000"
              step="100"
              value={boidCount}
              onChange={(e) => setBoidCount(Number(e.target.value))}
              className="w-full h-2 rounded-lg appearance-none cursor-pointer"
              style={{
                backgroundColor: THEMES[theme].accent + "30",
                accentColor: THEMES[theme].accent,
              }}
            />
          </div>

          {/* Parameters */}
          <div className="space-y-4 mb-6">
            <label className="text-xs font-semibold uppercase tracking-wider block" style={{ color: THEMES[theme].accent + "cc" }}>
              Behavior Parameters
            </label>
            
            {[
              { key: "separation", label: "Separation", min: 0, max: 3, step: 0.1 },
              { key: "alignment", label: "Alignment", min: 0, max: 3, step: 0.1 },
              { key: "cohesion", label: "Cohesion", min: 0, max: 3, step: 0.1 },
              { key: "perceptionRadius", label: "Perception", min: 10, max: 150, step: 5 },
              { key: "maxSpeed", label: "Max Speed", min: 1, max: 10, step: 0.5 },
              { key: "maxForce", label: "Max Force", min: 0.01, max: 0.5, step: 0.01 },
            ].map(({ key, label, min, max, step }) => (
              <div key={key}>
                <div className="flex justify-between mb-1">
                  <span className="text-sm" style={{ color: THEMES[theme].accent }}>{label}</span>
                  <span className="text-sm opacity-70" style={{ color: THEMES[theme].accent }}>
                    {params[key as keyof FlockingParams].toFixed(2)}
                  </span>
                </div>
                <input
                  type="range"
                  min={min}
                  max={max}
                  step={step}
                  value={params[key as keyof FlockingParams]}
                  onChange={(e) => setParams({ ...params, [key]: Number(e.target.value) })}
                  className="w-full h-2 rounded-lg appearance-none cursor-pointer"
                  style={{
                    backgroundColor: THEMES[theme].accent + "30",
                    accentColor: THEMES[theme].accent,
                  }}
                />
              </div>
            ))}
          </div>

          {/* Visual Options */}
          <div className="space-y-3">
            <label className="text-xs font-semibold uppercase tracking-wider block" style={{ color: THEMES[theme].accent + "cc" }}>
              Visual Options
            </label>
            
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={showTrails}
                onChange={(e) => setShowTrails(e.target.checked)}
                className="w-5 h-5 rounded"
              />
              <span className="text-sm" style={{ color: THEMES[theme].accent }}>Show Trails</span>
            </label>

            {showTrails && (
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-sm" style={{ color: THEMES[theme].accent }}>Trail Length</span>
                  <span className="text-sm opacity-70" style={{ color: THEMES[theme].accent }}>{params.trailLength}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="30"
                  step="1"
                  value={params.trailLength}
                  onChange={(e) => setParams({ ...params, trailLength: Number(e.target.value) })}
                  className="w-full h-2 rounded-lg appearance-none cursor-pointer"
                  style={{
                    backgroundColor: THEMES[theme].accent + "30",
                    accentColor: THEMES[theme].accent,
                  }}
                />
              </div>
            )}
          </div>

          {/* Instructions */}
          <div className="mt-6 pt-4 border-t" style={{ borderColor: THEMES[theme].accent + "20" }}>
            <p className="text-xs opacity-60" style={{ color: THEMES[theme].accent }}>
              <strong>Click</strong> to attract • <strong>Right-click</strong> to repel
            </p>
          </div>
        </div>
      )}

      {/* Stats Overlay */}
      <div
        className="absolute bottom-4 right-4 px-4 py-2 rounded-lg backdrop-blur-md text-sm"
        style={{
          backgroundColor: THEMES[theme].bg + "cc",
          color: THEMES[theme].accent,
          border: `1px solid ${THEMES[theme].accent}30`,
        }}
      >
        {boidCount.toLocaleString()} entities • {fps} FPS
      </div>
    </div>
  );
}
