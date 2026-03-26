import { type Vec2 } from "./constants.ts";

export interface Particle {
  pos: Vec2;
  vel: Vec2;
  size: number;
  color: string;
  life: number;
  maxLife: number;
}

export class ParticleSystem {
  private particles: Particle[] = [];
  private pool: Particle[] = [];

  getParticles(): Particle[] {
    return this.particles;
  }

  emitBurst(x: number, y: number, count: number, color: string, speed: number, size: number): void {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
      const spd = speed * (0.5 + Math.random() * 0.5);
      const life = 0.4 + Math.random() * 0.4;
      const p = this.acquire();
      p.pos.x = x;
      p.pos.y = y;
      p.vel.x = Math.cos(angle) * spd;
      p.vel.y = Math.sin(angle) * spd;
      p.size = size * (0.5 + Math.random() * 0.5);
      p.color = color;
      p.life = life;
      p.maxLife = life;
      this.particles.push(p);
    }
  }

  emitSparkle(x: number, y: number, color: string): void {
    const count = 4 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd = 60 + Math.random() * 100;
      const life = 0.2 + Math.random() * 0.2;
      const p = this.acquire();
      p.pos.x = x + (Math.random() - 0.5) * 10;
      p.pos.y = y + (Math.random() - 0.5) * 10;
      p.vel.x = Math.cos(angle) * spd;
      p.vel.y = Math.sin(angle) * spd;
      p.size = 2 + Math.random() * 2;
      p.color = color;
      p.life = life;
      p.maxLife = life;
      this.particles.push(p);
    }
  }

  emitPop(x: number, y: number): void {
    this.emitBurst(x, y, 16, "#ffffff", 200, 5);
    this.emitBurst(x, y, 8, "#e0e0e0", 150, 3);
    this.emitBurst(x, y, 6, "#f0f0f0", 120, 2);
  }

  update(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.pos.x += p.vel.x * dt;
      p.pos.y += p.vel.y * dt;
      p.vel.x *= 0.96;
      p.vel.y *= 0.96;
      p.vel.y += 80 * dt;
      p.life -= dt;

      if (p.life <= 0) {
        this.particles.splice(i, 1);
        this.pool.push(p);
      }
    }
  }

  reset(): void {
    for (const p of this.particles) {
      this.pool.push(p);
    }
    this.particles = [];
  }

  private acquire(): Particle {
    if (this.pool.length > 0) {
      return this.pool.pop()!;
    }
    return {
      pos: { x: 0, y: 0 },
      vel: { x: 0, y: 0 },
      size: 0,
      color: "#fff",
      life: 0,
      maxLife: 0,
    };
  }
}
