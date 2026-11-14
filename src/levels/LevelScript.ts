import type Phaser from 'phaser';

/**
 * El guion de un nivel de mapa: lo que es propio de ESE nivel (los cajones y las
 * cuevas del Nivel 1, la construcción del Nivel 3) vive acá y no en WorldScene,
 * que queda genérica: mapa, jugador, NPCs, triggers, lo que se junta, el fogón.
 *
 * WorldScene llama a estos ganchos en su momento; todos son opcionales.
 */

/** Algo del mapa con lo que se puede hacer algo (el botón de acción). */
export interface Interactable {
  sprite: Phaser.GameObjects.Image;
  /** genéricos: npc, jarilla, comida, fogon, mirar. Los guiones suman los suyos (cajon, cueva…) */
  kind: string;
  /** kind 'mirar': lo que dice el personaje al mirarlo (data: spawns.decor[].look) */
  look?: string;
  id: string;
  label: string;
}

/** Lo que WorldScene le presta a un guion. */
export interface WorldHost {
  readonly scene: Phaser.Scene;
  readonly player: Phaser.Physics.Arcade.Sprite;
  readonly interactables: Interactable[];
  /** cuerpo sólido de `w`×`h` px apoyado en el borde de abajo del sprite (corrido `dy`) */
  solid(s: Phaser.GameObjects.Image, w: number, h: number, dy?: number): void;
  /** prende o apaga el cuerpo sólido de un sprite que se movió o se escondió */
  syncSolid(s: Phaser.GameObjects.Image, enabled: boolean): void;
  /** dispara un trigger por id si todavía corresponde */
  runTriggerById(id: string): void;
  /** ¿el trigger está pendiente? (no disparado y con la condición cumplida) */
  triggerPending(id: string): boolean;
  checkTriggers(): void;
  /** lleva al jugador a una casilla (el guion decide cuándo hace falta) */
  teleport(tileX: number, tileY: number): void;
}

export interface LevelScript {
  /** pone en el mapa lo propio del nivel (después de lo genérico) */
  spawn?(): void;
  /** la etiqueta del botón de acción para este interactable; undefined = la de siempre */
  label?(it: Interactable): string | undefined;
  /** la acción sobre un interactable; true si el guion la resolvió */
  interact?(it: Interactable): boolean;
  /** al pisar una casilla nueva, antes de los triggers; true = no seguir (el guion ya resolvió) */
  onTile?(zoneId: string | undefined): boolean;
  /** cada cuadro con el control libre */
  update?(delta: number): void;
  /** ¿este NPC lo mueve el guion? (updateNpcVisibility no lo toca) */
  holdsNpc?(npcId: string): boolean;
  /** lo que dice un NPC cuando no tiene charla pendiente; undefined = «Ahora no.» */
  refusal?(npcId: string): string | undefined;
  /** al cerrarse un diálogo */
  onDialogueEnd?(dialogueId: string): void;
  /** al terminar un minijuego del nivel (ej. apuntalar) */
  onMinigame?(id: string, result: number): void;
  /** red de contención: el trigger de cierre a forzar si el nivel se pasó de días */
  levelOverTrigger?(): string | null;
  /** la zona del campamento (para el aviso del atardecer) */
  readonly campZone?: string;
}
