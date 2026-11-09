import Phaser from 'phaser';
import { PAL } from '@/config';
import { sceneTextureKey } from '@/util/assets';
import { sfx } from '@/audio/Sfx';

/**
 * Escenas ilustradas del juego (cutscenes, fogón, amanecer) con vida: entran con
 * una transición "de jueguito" (franjas horizontales que se abren alternando de
 * izquierda y derecha, como las de los RPG viejos), la cámara se acerca y se corre
 * despacio sobre la ilustración, y encima va el clima o el ambiente de cada escena
 * (bruma, viento, polvo al sol, brasas). Antes aparecían de golpe, quietas.
 */

export interface SceneFx {
  /** briznas de pasto/polvo llevadas por el viento (de izquierda a derecha) */
  wind?: number;
  /** motas de polvo flotando a contraluz */
  motes?: number;
  /** brasas que suben (fogón) */
  embers?: number;
  /** dónde nacen las brasas, en fracción del rectángulo (x, y) */
  emberAt?: [number, number];
  /** lluvia */
  rain?: number;
}

/** Ambiente de cada ilustración. Lo que no figura entra igual, con movimiento y sin partículas. */
export const SCENE_FX: Record<string, SceneFx> = {
  cold_open: { wind: 0.3 },
  subida_barranca: { wind: 1 },
  manantial: { motes: 1 },
  mimosa_zarpa: { wind: 0.8 },
  punta_final: { wind: 0.7 },
  sunrise: { motes: 0.8 },
  fogon_grande: { embers: 1, emberAt: [0.52, 0.66], motes: 0.3 },
  fogon_chico: { embers: 0.5, emberAt: [0.52, 0.66] },
  decision_carga: { motes: 0.6, wind: 0.3 },
};

const WIPE_MS = 520;
const STRIPES = 12;

/** Texturas chicas de partículas, dibujadas por código (una vez por juego). */
export function ensureFxTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists('fx_ember')) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  if (!scene.textures.exists('fx_rain')) {
    for (let y = 0; y < 16; y++) {
      g.fillStyle(0xeef3f5, 0.35 + (0.65 * (y + 1)) / 16);
      g.fillRect(0, y, 1, 1);
    }
    g.generateTexture('fx_rain', 1, 16);
    g.clear();
    g.fillStyle(0xffffff, 1);
    g.fillRect(0, 0, 2, 2);
    g.generateTexture('fx_dot', 2, 2);
    g.clear();
    g.fillStyle(0xd9c79a, 1);
    g.fillRect(0, 0, 4, 1);
    g.generateTexture('fx_wisp', 4, 1);
    g.clear();
  }
  // brasa: un punto naranja con centro claro
  g.fillStyle(0xff7a2a, 1).fillRect(0, 0, 2, 2);
  g.fillStyle(0xffe08a, 1).fillRect(0, 0, 1, 1);
  g.generateTexture('fx_ember', 2, 2);
  g.clear();
  // mota: punto tibio y suave
  g.fillStyle(0xf2e2b0, 0.5).fillRect(0, 0, 3, 3);
  g.fillStyle(0xfff5dc, 1).fillRect(1, 1, 1, 1);
  g.generateTexture('fx_mote', 3, 3);
  g.destroy();
}

export interface Cinematic {
  image: Phaser.GameObjects.Image | null;
  /** cierra con un fundido corto (o de golpe con `instant`) y limpia todo */
  close(instant?: boolean): void;
}

/**
 * Muestra la ilustración `sceneId` cubriendo `rect` (x, y, w, h), con entrada
 * animada, movimiento lento y el ambiente de SCENE_FX. Devuelve null image si no
 * hay PNG (igual se puede llamar a close()).
 */
export function playCinematic(
  scene: Phaser.Scene,
  sceneId: string,
  rect: { x: number; y: number; w: number; h: number },
  depth = -5,
): Cinematic {
  ensureFxTextures(scene);
  sfx.whoosh();
  const key = sceneTextureKey(sceneId);
  const objs: Phaser.GameObjects.GameObject[] = [];
  const emitters: Phaser.GameObjects.Particles.ParticleEmitter[] = [];
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;

  let image: Phaser.GameObjects.Image | null = null;
  if (scene.textures.exists(key)) {
    image = scene.add.image(cx, cy, key).setDepth(depth);
    image.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
    const cover = Math.max(rect.w / image.width, rect.h / image.height);
    // entra un poco más cerca y se asienta (impacto), después sigue acercándose
    // y corriéndose despacio mientras dura la escena
    const dir = Math.random() < 0.5 ? -1 : 1;
    image.setScale(cover * 1.12).setX(cx + dir * 6);
    scene.tweens.add({ targets: image, scale: cover * 1.03, duration: WIPE_MS + 250, ease: 'Cubic.easeOut' });
    scene.tweens.add({
      targets: image,
      scale: cover * 1.1,
      x: cx - dir * 8,
      delay: WIPE_MS + 250,
      duration: 16000,
      ease: 'Sine.easeInOut',
    });
    // recorte al rectángulo: la imagen agrandada no puede salirse sobre la bandeja
    const maskG = scene.make.graphics({ x: 0, y: 0 }, false).fillRect(rect.x, rect.y, rect.w, rect.h);
    image.setMask(maskG.createGeometryMask());
    objs.push(image, maskG);
  }

  // ---- ambiente
  const fx = SCENE_FX[sceneId] ?? {};
  const pdepth = depth + 0.5;
  const area = (o: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig) => o;
  if (fx.wind) {
    emitters.push(
      scene.add.particles(0, 0, 'fx_wisp', area({
        x: rect.x - 10,
        y: { min: rect.y + rect.h * 0.1, max: rect.y + rect.h * 0.95 },
        lifespan: 2400,
        speedX: { min: 130, max: 230 },
        speedY: { min: -18, max: 22 },
        rotate: { min: -12, max: 12 },
        alpha: { start: 0.75, end: 0 },
        frequency: 120 / fx.wind,
        advance: 2000,
      })).setDepth(pdepth),
    );
  }
  if (fx.motes) {
    emitters.push(
      scene.add.particles(0, 0, 'fx_mote', area({
        x: { min: rect.x, max: rect.x + rect.w },
        y: { min: rect.y + rect.h * 0.15, max: rect.y + rect.h * 0.9 },
        lifespan: 6000,
        speedX: { min: -6, max: 8 },
        speedY: { min: -10, max: -2 },
        alpha: { onUpdate: (_p: unknown, _k: string, t: number) => Math.sin(t * Math.PI) * 0.8 },
        scale: { min: 0.6, max: 1.2 },
        frequency: 260 / fx.motes,
        advance: 5000,
      })).setDepth(pdepth),
    );
  }
  if (fx.embers) {
    const [ex, ey] = fx.emberAt ?? [0.5, 0.7];
    emitters.push(
      scene.add.particles(rect.x + rect.w * ex, rect.y + rect.h * ey, 'fx_ember', area({
        x: { min: -14, max: 14 },
        lifespan: { min: 1200, max: 2400 },
        speedY: { min: -60, max: -25 },
        speedX: { min: -12, max: 12 },
        accelerationX: { min: -20, max: 20 },
        alpha: { start: 1, end: 0 },
        scale: { start: 1, end: 0.4 },
        frequency: 110 / fx.embers,
        blendMode: Phaser.BlendModes.ADD,
        advance: 1500,
      })).setDepth(pdepth),
    );
  }
  if (fx.rain) {
    emitters.push(
      scene.add.particles(0, 0, 'fx_rain', area({
        x: { min: rect.x - 60, max: rect.x + rect.w + 120 },
        y: rect.y - 20,
        lifespan: 900,
        speedY: { min: 520, max: 680 },
        speedX: { min: -190, max: -150 },
        rotate: 16,
        alpha: { start: 0.8, end: 0.3 },
        frequency: 60 / fx.rain,
      })).setDepth(pdepth),
    );
  }
  // las partículas también quedan recortadas al rectángulo de la escena
  const pmaskG = scene.make.graphics({ x: 0, y: 0 }, false).fillRect(rect.x, rect.y, rect.w, rect.h);
  const pmask = pmaskG.createGeometryMask();
  for (const e of emitters) e.setMask(pmask);
  objs.push(pmaskG, ...emitters);

  // ---- entrada: franjas negras que se retiran alternando de lado (estilo RPG)
  const stripeH = Math.ceil(rect.h / STRIPES);
  for (let i = 0; i < STRIPES; i++) {
    const fromLeft = i % 2 === 0;
    const s = scene.add
      .rectangle(rect.x, rect.y + i * stripeH, rect.w, stripeH + 1, PAL.void, 1)
      .setOrigin(fromLeft ? 1 : 0, 0)
      .setX(fromLeft ? rect.x + rect.w : rect.x)
      .setDepth(depth + 1);
    scene.tweens.add({
      targets: s,
      scaleX: 0,
      delay: i * 22,
      duration: WIPE_MS - i * 22,
      ease: 'Cubic.easeIn',
      onComplete: () => s.destroy(),
    });
    objs.push(s);
  }

  let closed = false;
  return {
    image,
    close(instant = false) {
      if (closed) return;
      closed = true;
      for (const e of emitters) e.stop();
      const done = () => {
        for (const o of objs) {
          scene.tweens.killTweensOf(o);
          if (o.active) o.destroy();
        }
      };
      if (instant || !image) return done();
      scene.tweens.add({ targets: [image, ...emitters], alpha: 0, duration: 260, onComplete: done });
    },
  };
}
