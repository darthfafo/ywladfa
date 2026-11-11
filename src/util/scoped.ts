import Phaser from 'phaser';
import { bus, type GameEvents } from '@/core/EventBus';

/**
 * Suscripciones atadas a la vida de una escena: se sueltan solas al cerrarse.
 *
 * Phaser reutiliza la misma instancia de cada escena cuando se la vuelve a
 * arrancar (otra partida, el nivel siguiente), y ni el bus del juego ni los
 * emisores de otras escenas se limpian solos. Sin esto, cada reinicio sumaba
 * otra copia de cada suscripción: en la segunda partida cada diálogo se pedía
 * dos veces.
 */
export function busOn<K extends keyof GameEvents>(scene: Phaser.Scene, key: K, fn: (p: GameEvents[K]) => void): void {
  const off = bus.on(key, fn);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, off);
}

/** Igual que busOn, para eventos de otra escena (ej. Ui escuchando a World). */
export function emitterOn(scene: Phaser.Scene, emitter: Phaser.Events.EventEmitter, key: string, fn: (...args: any[]) => void): void {
  emitter.on(key, fn);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => emitter.off(key, fn));
}
