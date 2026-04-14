import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router';
import { Search } from 'lucide-react';
import Matter from 'matter-js';

const { Engine, Composite, Bodies, Body } = Matter;

// ── Constellation palette — soft, muted tones ───────────────────────────────
const NODE_COLORS = [
  'rgba(99, 102, 241, 0.7)',   // indigo
  'rgba(139, 92, 246, 0.6)',   // violet
  'rgba(6, 182, 212, 0.6)',    // cyan
  'rgba(16, 185, 129, 0.5)',   // emerald
  'rgba(244, 63, 94, 0.5)',    // rose
  'rgba(251, 191, 36, 0.55)',  // amber
  'rgba(59, 130, 246, 0.6)',   // blue
  'rgba(168, 85, 247, 0.55)',  // purple
  'rgba(14, 165, 233, 0.5)',   // sky
  'rgba(234, 179, 8, 0.5)',    // yellow
];

interface Star {
  radius: number;
  color: string;
  glowColor: string;
  brightness: number; // 0–1, controls subtle pulse
}

function generateStars(count: number): Star[] {
  const stars: Star[] = [];
  for (let i = 0; i < count; i++) {
    // Distribution: many tiny, some medium, few larger
    const roll = Math.random();
    let radius: number;
    if (roll < 0.45) radius = 1.5 + Math.random() * 2;        // tiny
    else if (roll < 0.75) radius = 3 + Math.random() * 3;      // small
    else if (roll < 0.92) radius = 5 + Math.random() * 4;      // medium
    else radius = 8 + Math.random() * 5;                        // larger accent

    const colorIdx = Math.floor(Math.random() * NODE_COLORS.length);
    const baseColor = NODE_COLORS[colorIdx];

    stars.push({
      radius,
      color: baseColor,
      glowColor: baseColor.replace(/[\d.]+\)$/, '0.3)'),
      brightness: Math.random(),
    });
  }
  return stars;
}

const STAR_COUNT = 100;
const STARS = generateStars(STAR_COUNT);
const LINE_MAX_DIST = 140; // max distance for connection lines
const LINE_COLOR = 'rgba(99, 102, 241, '; // base for alpha

const QUICK_FILTERS = [
  { label: 'Banks over $1B', params: 'min_assets=1000000000&source=fdic' },
  { label: 'Credit Unions', params: 'source=ncua' },
  { label: 'Texas Banks', params: 'states=TX&source=fdic' },
  { label: 'Credit Card Programs', params: 'has_credit_card_program=true' },
  { label: 'Canadian PSPs', params: 'source=rpaa' },
];

// ── Component ────────────────────────────────────────────────────────────────
export function PhysicsHero() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [query, setQuery] = useState('');
  const navigate = useNavigate();

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (query.trim()) {
      navigate(`/explore?q=${encodeURIComponent(query.trim())}`);
    } else {
      navigate('/explore');
    }
  }

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const dpr = window.devicePixelRatio || 1;
    let W = container.clientWidth || 800;
    let H = container.clientHeight || 600;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    // ── Engine — zero gravity ──
    const engine = Engine.create();
    engine.world.gravity.y = 0;
    engine.world.gravity.x = 0;

    // ── Walls ──
    const wt = 60;
    const wo = { isStatic: true, restitution: 0.95, friction: 0 };
    const walls = [
      Bodies.rectangle(W / 2, -wt / 2, W + 200, wt, wo),
      Bodies.rectangle(W / 2, H + wt / 2, W + 200, wt, wo),
      Bodies.rectangle(-wt / 2, H / 2, wt, H + 200, wo),
      Bodies.rectangle(W + wt / 2, H / 2, wt, H + 200, wo),
    ];
    Composite.add(engine.world, walls);

    // ── Bodies — scatter across canvas ──
    const clearZone = 200;
    const bodies = STARS.map((s) => {
      let px: number, py: number;
      const m = Math.max(s.radius + 5, 10);
      do {
        px = m + Math.random() * (W - m * 2);
        py = m + Math.random() * (H - m * 2);
      } while (
        Math.sqrt((px - W / 2) ** 2 + (py - H / 2) ** 2) < clearZone
      );

      return Bodies.circle(px, py, Math.max(s.radius, 3), {
        frictionAir: 0.025,
        restitution: 0.6,
        density: 0.0002,
        friction: 0,
      });
    });
    Composite.add(engine.world, bodies);

    // Very gentle initial drift — slow and dreamy
    bodies.forEach((body) => {
      Body.setVelocity(body, {
        x: (Math.random() - 0.5) * 0.25,
        y: (Math.random() - 0.5) * 0.25,
      });
    });

    // ── Mouse tracking ──
    let mousePos = { x: -9999, y: -9999 };
    const onMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      mousePos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    const onMouseLeave = () => { mousePos = { x: -9999, y: -9999 }; };
    container.addEventListener('mousemove', onMouseMove);
    container.addEventListener('mouseleave', onMouseLeave);

    // ── Render loop ──
    let animFrame: number;
    let lastTime = performance.now();
    let tick = 0;

    const draw = (now: number) => {
      const dt = Math.min(now - lastTime, 32);
      lastTime = now;
      tick += dt * 0.001;
      Engine.update(engine, dt);

      // ── Forces ──
      bodies.forEach((body) => {
        if (body.isStatic) return;

        // Mouse repulsion — gentle push
        const mdx = body.position.x - mousePos.x;
        const mdy = body.position.y - mousePos.y;
        const mDist = Math.sqrt(mdx * mdx + mdy * mdy);
        const repelR = 120;
        if (mDist < repelR && mDist > 1) {
          const str = (1 - mDist / repelR) * 0.0012;
          Body.applyForce(body, body.position, {
            x: (mdx / mDist) * str,
            y: (mdy / mDist) * str,
          });
        }

        // Keep away from center
        const cdx = body.position.x - W / 2;
        const cdy = body.position.y - H / 2;
        const cDist = Math.sqrt(cdx * cdx + cdy * cdy);
        if (cDist < clearZone && cDist > 1) {
          const str = (1 - cDist / clearZone) * 0.0006;
          Body.applyForce(body, body.position, {
            x: (cdx / cDist) * str,
            y: (cdy / cDist) * str,
          });
        }

        // Very gentle keep-alive — barely perceptible drift
        const speed = Math.sqrt(body.velocity.x ** 2 + body.velocity.y ** 2);
        if (speed < 0.05) {
          Body.applyForce(body, body.position, {
            x: (Math.random() - 0.5) * 0.000015,
            y: (Math.random() - 0.5) * 0.000015,
          });
        }

        // Speed cap — keep it slow and fluid
        if (speed > 0.7) {
          Body.setVelocity(body, {
            x: body.velocity.x * 0.92,
            y: body.velocity.y * 0.92,
          });
        }
      });

      // ── Draw ──
      ctx.clearRect(0, 0, W, H);

      // 1) Connection lines — the mesh network
      ctx.lineWidth = 0.8;
      for (let i = 0; i < bodies.length; i++) {
        if (STARS[i].radius < 2) continue; // skip tiniest for perf
        for (let j = i + 1; j < bodies.length; j++) {
          if (STARS[j].radius < 2) continue;
          const dx = bodies[i].position.x - bodies[j].position.x;
          const dy = bodies[i].position.y - bodies[j].position.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < LINE_MAX_DIST) {
            const alpha = (1 - dist / LINE_MAX_DIST) * 0.12;
            ctx.strokeStyle = LINE_COLOR + alpha + ')';
            ctx.beginPath();
            ctx.moveTo(bodies[i].position.x, bodies[i].position.y);
            ctx.lineTo(bodies[j].position.x, bodies[j].position.y);
            ctx.stroke();
          }
        }
      }

      // 2) Draw star nodes
      bodies.forEach((body, i) => {
        const s = STARS[i];
        const { x, y } = body.position;

        // Subtle pulse for medium+ stars
        const pulse = s.radius > 4
          ? 1 + Math.sin(tick * 1.5 + s.brightness * 6.28) * 0.15
          : 1;
        const r = s.radius * pulse;

        // Outer glow for larger stars
        if (s.radius > 5) {
          const grad = ctx.createRadialGradient(x, y, 0, x, y, r * 3);
          grad.addColorStop(0, s.glowColor);
          grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(x, y, r * 3, 0, Math.PI * 2);
          ctx.fill();
        }

        // Core dot
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = s.color;
        ctx.fill();
      });

      // 3) Mouse highlight — draw lines from cursor to nearby nodes
      if (mousePos.x > 0 && mousePos.y > 0) {
        bodies.forEach((body, i) => {
          const dx = body.position.x - mousePos.x;
          const dy = body.position.y - mousePos.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 100 && STARS[i].radius > 2.5) {
            const alpha = (1 - dist / 100) * 0.15;
            ctx.strokeStyle = `rgba(99, 102, 241, ${alpha})`;
            ctx.lineWidth = 0.6;
            ctx.beginPath();
            ctx.moveTo(mousePos.x, mousePos.y);
            ctx.lineTo(body.position.x, body.position.y);
            ctx.stroke();
          }
        });
      }

      animFrame = requestAnimationFrame(draw);
    };
    animFrame = requestAnimationFrame(draw);

    // ── Resize ──
    const onResize = () => {
      W = container.clientWidth;
      H = container.clientHeight;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      const c = canvas.getContext('2d');
      if (c) c.scale(dpr, dpr);
      Body.setPosition(walls[0], { x: W / 2, y: -wt / 2 });
      Body.setPosition(walls[1], { x: W / 2, y: H + wt / 2 });
      Body.setPosition(walls[2], { x: -wt / 2, y: H / 2 });
      Body.setPosition(walls[3], { x: W + wt / 2, y: H / 2 });
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(animFrame);
      container.removeEventListener('mousemove', onMouseMove);
      container.removeEventListener('mouseleave', onMouseLeave);
      window.removeEventListener('resize', onResize);
      Composite.clear(engine.world, false);
      Engine.clear(engine);
    };
  }, [navigate]);

  return (
    <section ref={containerRef} className="relative w-full h-[calc(100vh-56px)] min-h-[600px] overflow-hidden bg-white">
      {/* Subtle radial glow */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse at center, rgba(99, 102, 241, 0.03) 0%, transparent 60%)',
      }} />

      {/* Physics canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 z-10" />

      {/* Center content */}
      <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
        <div className="text-center pointer-events-auto max-w-2xl w-full px-6">
          <p className="text-xs uppercase tracking-[0.3em] text-surface-400 mb-4 font-medium">
            Financial Intelligence Platform
          </p>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-surface-100 mb-3 tracking-tight leading-tight">
            Explore{' '}
            <span className="gradient-text">10,000+</span>
            {' '}Institutions
          </h1>
          <p className="text-base text-surface-400 mb-10 max-w-lg mx-auto leading-relaxed">
            Banks, credit unions, and regulated entities across the U.S. and Canada
          </p>

          {/* Search bar */}
          <form onSubmit={handleSubmit} className="relative group mb-6 max-w-xl mx-auto">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-primary-500/15 via-violet-500/10 to-cyan-500/15 rounded-2xl blur-sm opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="relative flex items-center">
              <Search className="absolute left-4 h-5 w-5 text-surface-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search institutions, regulators, metrics..."
                className="w-full pl-12 pr-28 py-4 rounded-2xl bg-white border border-surface-700/80 text-surface-100 text-sm placeholder:text-surface-500 focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-500/10 transition-all duration-200 shadow-sm"
              />
              <button
                type="submit"
                className="absolute right-2 px-5 py-2.5 rounded-xl bg-surface-100 text-white text-sm font-medium hover:bg-surface-200 transition-colors"
              >
                Search
              </button>
            </div>
          </form>

          {/* Quick filter pills */}
          <div className="flex flex-wrap justify-center gap-2">
            {QUICK_FILTERS.map((chip) => (
              <Link
                key={chip.label}
                to={`/explore?${chip.params}`}
                className="inline-flex items-center px-3.5 py-1.5 rounded-full bg-surface-900 border border-surface-700/60 text-xs font-medium text-surface-400 hover:text-surface-200 hover:border-primary-500/30 hover:bg-primary-500/5 transition-all duration-200"
              >
                {chip.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
