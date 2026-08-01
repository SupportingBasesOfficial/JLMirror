// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
} from "react";

/* ============================================================
 * CursorProvider — Custom cursor com ring, dot, glow e ripple
 * Envolve toda a página. Adiciona classe .cursor-mega-tech ao body.
 * Desktop only (mobile usa cursor nativo).
 * ============================================================ */

interface RippleInstance {
  id: number;
  x: number;
  y: number;
}

export function CursorProvider({ children }: { children: ReactNode }) {
  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const [ripples, setRipples] = useState<RippleInstance[]>([]);
  const rippleIdRef = useRef(0);
  const [hovering, setHovering] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(max-width: 768px)").matches) return;

    document.body.classList.add("cursor-mega-tech");

    let mouseX = 0;
    let mouseY = 0;
    let ringX = 0;
    let ringY = 0;
    let glowX = 0;
    let glowY = 0;
    let rafId = 0;

    const onMove = (e: globalThis.MouseEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
      if (!visible) setVisible(true);

      if (dotRef.current) {
        dotRef.current.style.left = `${mouseX}px`;
        dotRef.current.style.top = `${mouseY}px`;
      }

      const target = e.target as HTMLElement;
      const isInteractive =
        target.closest("a, button, input, [role='button'], [data-cursor='hover']") !== null;
      setHovering(isInteractive);
    };

    const onLeave = () => setVisible(false);
    const onEnter = () => setVisible(true);

    const onClick = (e: globalThis.MouseEvent) => {
      const id = rippleIdRef.current++;
      setRipples((prev) => [...prev, { id, x: e.clientX, y: e.clientY }]);
      window.setTimeout(() => {
        setRipples((prev) => prev.filter((r) => r.id !== id));
      }, 600);
    };

    const animate = () => {
      ringX += (mouseX - ringX) * 0.18;
      ringY += (mouseY - ringY) * 0.18;
      glowX += (mouseX - glowX) * 0.08;
      glowY += (mouseY - glowY) * 0.08;

      if (ringRef.current) {
        ringRef.current.style.left = `${ringX}px`;
        ringRef.current.style.top = `${ringY}px`;
      }
      if (glowRef.current) {
        glowRef.current.style.left = `${glowX}px`;
        glowRef.current.style.top = `${glowY}px`;
      }

      rafId = requestAnimationFrame(animate);
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseleave", onLeave);
    document.addEventListener("mouseenter", onEnter);
    document.addEventListener("click", onClick);
    rafId = requestAnimationFrame(animate);

    return () => {
      document.body.classList.remove("cursor-mega-tech");
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseleave", onLeave);
      document.removeEventListener("mouseenter", onEnter);
      document.removeEventListener("click", onClick);
      cancelAnimationFrame(rafId);
    };
  }, [visible]);

  const dotStyle: CSSProperties = {
    position: "fixed",
    left: 0,
    top: 0,
    width: 6,
    height: 6,
    borderRadius: "50%",
    background: "#1BA898",
    transform: "translate(-50%, -50%)",
    pointerEvents: "none",
    zIndex: 99999,
    transition: "opacity 0.2s, transform 0.15s",
    opacity: visible ? 1 : 0,
    boxShadow: "0 0 8px rgba(27,168,152,0.8)",
  };

  const ringStyle: CSSProperties = {
    position: "fixed",
    left: 0,
    top: 0,
    width: hovering ? 48 : 32,
    height: hovering ? 48 : 32,
    borderRadius: "50%",
    border: `1.5px solid ${hovering ? "#35D0C4" : "#1BA89855"}`,
    transform: "translate(-50%, -50%)",
    pointerEvents: "none",
    zIndex: 99998,
    transition: "width 0.2s, height 0.2s, border-color 0.2s, opacity 0.2s",
    opacity: visible ? (hovering ? 0.8 : 0.5) : 0,
    boxShadow: hovering ? "0 0 16px rgba(53,208,196,0.3)" : "none",
  };

  const glowStyle: CSSProperties = {
    position: "fixed",
    left: 0,
    top: 0,
    width: 400,
    height: 400,
    borderRadius: "50%",
    background: "radial-gradient(circle, rgba(27,168,152,0.08) 0%, transparent 60%)",
    transform: "translate(-50%, -50%)",
    pointerEvents: "none",
    zIndex: 0,
    opacity: visible ? 1 : 0,
    transition: "opacity 0.3s",
  };

  return (
    <>
      <div ref={glowRef} style={glowStyle} />
      <div ref={ringRef} style={ringStyle} />
      <div ref={dotRef} style={dotStyle} />
      {ripples.map((r) => (
        <div
          key={r.id}
          style={{
            position: "fixed",
            left: r.x,
            top: r.y,
            width: 20,
            height: 20,
            borderRadius: "50%",
            border: "2px solid #1BA898",
            transform: "translate(-50%, -50%)",
            pointerEvents: "none",
            zIndex: 99997,
            animation: "cursorRipple 0.6s ease-out forwards",
          }}
        />
      ))}
      {children}
    </>
  );
}

/* ============================================================
 * ParticleTrail — Canvas com partículas que seguem o cursor
 * Renderiza partículas teal que se dissipam suavemente.
 * ============================================================ */

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  size: number;
}

export function ParticleTrail({ maxParticles = 80 }: { maxParticles?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(max-width: 768px)").matches) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const particles: Particle[] = [];
    let lastX = 0;
    let lastY = 0;
    let rafId = 0;

    const onResize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };

    const onMouseMove = (e: globalThis.MouseEvent) => {
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const count = Math.min(Math.floor(dist / 6), 4);

      for (let i = 0; i < count; i++) {
        if (particles.length >= maxParticles) particles.shift();
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 1.5 + 0.3;
        particles.push({
          x: e.clientX + (Math.random() - 0.5) * 8,
          y: e.clientY + (Math.random() - 0.5) * 8,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 0.5,
          life: 1,
          size: Math.random() * 2.5 + 0.8,
        });
      }

      lastX = e.clientX;
      lastY = e.clientY;
    };

    const tick = () => {
      ctx.clearRect(0, 0, width, height);

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.02;
        p.life -= 0.018;

        if (p.life <= 0) {
          particles.splice(i, 1);
          continue;
        }

        const alpha = p.life * 0.6;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(27, 168, 152, ${alpha})`;
        ctx.fill();

        if (p.life > 0.5) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * p.life * 2, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(53, 208, 196, ${alpha * 0.15})`;
          ctx.fill();
        }
      }

      rafId = requestAnimationFrame(tick);
    };

    window.addEventListener("resize", onResize);
    document.addEventListener("mousemove", onMouseMove);
    rafId = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("resize", onResize);
      document.removeEventListener("mousemove", onMouseMove);
      cancelAnimationFrame(rafId);
    };
  }, [maxParticles]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 1,
      }}
    />
  );
}

/* ============================================================
 * MagneticButton — Botão que é atraído pelo cursor quando próximo
 * ============================================================ */

interface MagneticButtonProps {
  children: ReactNode;
  href?: string;
  onClick?: (e: ReactMouseEvent<HTMLAnchorElement | HTMLButtonElement>) => void;
  strength?: number;
  style?: CSSProperties;
  className?: string;
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
}

export function MagneticButton({
  children,
  href,
  onClick,
  strength = 0.35,
  style,
  className,
  type = "button",
  disabled = false,
}: MagneticButtonProps) {
  const ref = useRef<HTMLAnchorElement | HTMLButtonElement>(null);

  const handleMouseMove = useCallback(
    (e: ReactMouseEvent<HTMLAnchorElement & HTMLButtonElement>) => {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left - rect.width / 2;
      const y = e.clientY - rect.top - rect.height / 2;
      el.style.transform = `translate(${x * strength}px, ${y * strength}px)`;
    },
    [strength],
  );

  const handleMouseLeave = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.transform = "translate(0px, 0px)";
  }, []);

  const commonStyle: CSSProperties = {
    ...style,
    transition: "transform 0.3s cubic-bezier(0.23, 1, 0.32, 1), box-shadow 0.3s",
    willChange: "transform",
  };

  if (href) {
    return (
      <a
        ref={ref as React.RefObject<HTMLAnchorElement>}
        href={href}
        onClick={onClick as (e: ReactMouseEvent<HTMLAnchorElement>) => void}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className={className}
        style={commonStyle}
        data-cursor="hover"
      >
        {children}
      </a>
    );
  }

  return (
    <button
      ref={ref as React.RefObject<HTMLButtonElement>}
      type={type}
      disabled={disabled}
      onClick={onClick as (e: ReactMouseEvent<HTMLButtonElement>) => void}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={className}
      style={commonStyle}
      data-cursor="hover"
    >
      {children}
    </button>
  );
}

/* ============================================================
 * SpotlightCard — Card com efeito spotlight que segue o cursor
 * ============================================================ */

interface SpotlightCardProps {
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
  spotlightColor?: string;
  spotlightSize?: number;
}

export function SpotlightCard({
  children,
  style,
  className,
  spotlightColor = "rgba(27, 168, 152, 0.12)",
  spotlightSize = 300,
}: SpotlightCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [spotlight, setSpotlight] = useState<{ x: number; y: number } | null>(null);

  const handleMouseMove = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setSpotlight({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    },
    [],
  );

  const handleMouseLeave = useCallback(() => setSpotlight(null), []);

  const overlayStyle: CSSProperties = {
    position: "absolute",
    inset: 0,
    borderRadius: "inherit",
    background: spotlight
      ? `radial-gradient(${spotlightSize}px circle at ${spotlight.x}px ${spotlight.y}px, ${spotlightColor}, transparent 70%)`
      : "transparent",
    opacity: spotlight ? 1 : 0,
    transition: "opacity 0.3s",
    pointerEvents: "none",
    zIndex: 0,
  };

  return (
    <div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={className}
      style={{ ...style, position: "relative", overflow: "hidden" }}
      data-cursor="hover"
    >
      <div style={overlayStyle} />
      <div style={{ position: "relative", zIndex: 1 }}>{children}</div>
    </div>
  );
}

/* ============================================================
 * TiltCard — Card com efeito 3D tilt baseado na posição do cursor
 * ============================================================ */

interface TiltCardProps {
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
  maxTilt?: number;
}

export function TiltCard({
  children,
  style,
  className,
  maxTilt = 8,
}: TiltCardProps) {
  const ref = useRef<HTMLDivElement>(null);

  const handleMouseMove = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const rx = ((e.clientY - cy) / rect.height) * maxTilt * -1;
      const ry = ((e.clientX - cx) / rect.width) * maxTilt;
      el.style.transform = `perspective(800px) rotateX(${rx}deg) rotateY(${ry}deg) scale(1.02)`;
    },
    [maxTilt],
  );

  const handleMouseLeave = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.transform = "perspective(800px) rotateX(0deg) rotateY(0deg) scale(1)";
  }, []);

  return (
    <div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={className}
      style={{
        ...style,
        transition: "transform 0.3s cubic-bezier(0.23, 1, 0.32, 1)",
        willChange: "transform",
        transformStyle: "preserve-3d",
      }}
      data-cursor="hover"
    >
      {children}
    </div>
  );
}

/* ============================================================
 * AnimatedCounter — Contador que anima de 0 ao valor alvo
 * ============================================================ */

interface AnimatedCounterProps {
  value: string;
  duration?: number;
  style?: CSSProperties;
  className?: string;
}

export function AnimatedCounter({
  value,
  duration = 1500,
  style,
  className,
}: AnimatedCounterProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const [displayValue, setDisplayValue] = useState("0");

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          const numericMatch = value.match(/[\d.]+/);
          if (!numericMatch) {
            setDisplayValue(value);
            return;
          }

          const target = parseFloat(numericMatch[0]);
          const suffix = value.replace(numericMatch[0], "");
          const startTime = performance.now();

          const tick = (now: number) => {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            const current = target * eased;
            setDisplayValue(
              Number.isInteger(target)
                ? `${Math.round(current)}${suffix}`
                : `${current.toFixed(1)}${suffix}`,
            );
            if (progress < 1) requestAnimationFrame(tick);
          };

          requestAnimationFrame(tick);
          observer.disconnect();
        }
      },
      { threshold: 0.3 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [value, duration]);

  return (
    <span ref={ref} className={className} style={style}>
      {displayValue}
    </span>
  );
}

/* ============================================================
 * ParallaxLayer — Layer que se move em resposta ao cursor
 * ============================================================ */

interface ParallaxLayerProps {
  children: ReactNode;
  depth?: number;
  style?: CSSProperties;
  className?: string;
}

export function ParallaxLayer({
  children,
  depth = 0.05,
  style,
  className,
}: ParallaxLayerProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(max-width: 768px)").matches) return;

    const el = ref.current;
    if (!el) return;

    const onMove = (e: globalThis.MouseEvent) => {
      const x = (e.clientX / window.innerWidth - 0.5) * depth * 100;
      const y = (e.clientY / window.innerHeight - 0.5) * depth * 100;
      el.style.transform = `translate(${x}px, ${y}px)`;
    };

    document.addEventListener("mousemove", onMove);
    return () => document.removeEventListener("mousemove", onMove);
  }, [depth]);

  return (
    <div
      ref={ref}
      className={className}
      style={{ ...style, transition: "transform 0.1s ease-out", willChange: "transform" }}
    >
      {children}
    </div>
  );
}
