/**
 * Los sprites de personajes traen filas transparentes debajo de los pies (de 3 a
 * 9 px de 67). Si el plano 3D apoya su borde de abajo en el piso, la figura queda
 * flotando y la sombra arranca separada de los pies. Esto mide ese margen por
 * cuadro (una vez, con caché) y da el recorte de textura para que el borde del
 * plano sean los pies.
 */
import type Phaser from 'phaser';
import * as THREE from 'three';

const cache = new Map<string, number>();

/** Filas transparentes (px) debajo del pixel opaco más bajo del cuadro. */
export function footPadPx(frame: Phaser.Textures.Frame): number {
  const key = `${frame.texture.key}:${frame.name}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  let pad = 0;
  try {
    const src = frame.source.image as CanvasImageSource;
    const c = document.createElement('canvas');
    c.width = frame.cutWidth;
    c.height = frame.cutHeight;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (ctx) {
      ctx.drawImage(src, frame.cutX, frame.cutY, frame.cutWidth, frame.cutHeight, 0, 0, frame.cutWidth, frame.cutHeight);
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      let y = c.height - 1;
      scan: for (; y >= 0; y--) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3]! > 127) break scan;
      // si el cuadro está vacío, no recortar nada
      pad = y < 0 ? 0 : c.height - 1 - y;
    }
  } catch {
    pad = 0; // sin acceso a los píxeles: mejor flotar un poco que romper
  }
  cache.set(key, pad);
  return pad;
}

/**
 * Ajusta `tex` para mostrar el cuadro sin el margen de abajo. Devuelve qué
 * fracción del alto del cuadro queda (para escalar el plano: alto × fracción).
 */
export function setFrameToFeet(tex: THREE.Texture, frame: Phaser.Textures.Frame): number {
  const w = frame.source.width;
  const h = frame.source.height;
  const pad = footPadPx(frame);
  const visible = frame.cutHeight - pad;
  tex.repeat.set(frame.cutWidth / w, visible / h);
  tex.offset.set(frame.cutX / w, 1 - (frame.cutY + visible) / h);
  return visible / frame.cutHeight;
}

let blobTex: THREE.Texture | null = null;

/**
 * Sombra de contacto: una mancha oscura y difusa en el piso, debajo de los pies.
 * La sombra que proyecta un plano vertical es una franja finita que no "apoya"
 * a la figura; esto sí (como en los juegos HD-2D).
 */
export function contactShadow(radius: number): THREE.Mesh {
  if (!blobTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(0,0,0,0.55)');
    g.addColorStop(0.55, 'rgba(0,0,0,0.3)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    blobTex = new THREE.CanvasTexture(c);
  }
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(radius * 2, radius * 2),
    new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, toneMapped: false }),
  );
  m.rotation.x = -Math.PI / 2;
  m.scale.y = 0.55; // más ancha que honda
  m.renderOrder = 1;
  return m;
}
