import { bus } from '@/core/EventBus';
import type { Game } from '@/core/Game';
import { registry } from '@/core/Registry';
import type { DialogueChoice, DialogueDef, DialogueNode } from '@/core/types';

export interface RenderedLine {
  nodeId: string;
  speakerId: string;
  speakerName: string;
  text: string;
  portrait: 'neutral' | 'tenso' | 'calido';
  choices: DialogueChoice[];
  isNarrator: boolean;
}

/**
 * Recorre el grafo de nodos. Semántica de `condition`: si un nodo evalúa false,
 * se SALTEA y sigue el siguiente nodo declarado (ver data/dialogues/nivel-01.json).
 */
export class DialogueSystem {
  private def: DialogueDef | null = null;
  private order: string[] = [];
  private cursor = 0;
  private finished = true;

  constructor(private game: Game) {}

  get active(): boolean {
    return !this.finished;
  }

  start(dialogueId: string): RenderedLine | null {
    this.def = registry.dialogue(dialogueId);
    this.order = Object.keys(this.def.nodes);
    this.cursor = this.order.indexOf(this.def.start);
    if (this.cursor < 0) this.cursor = 0;
    this.finished = false;
    bus.emit('dialogue:start', { dialogueId });
    return this.resolveCurrent();
  }

  /** Avanza al siguiente nodo (sin elección). */
  next(): RenderedLine | null {
    if (!this.def || this.finished) return null;
    const nodeId = this.order[this.cursor];
    const node = nodeId ? this.def.nodes[nodeId] : undefined;
    if (!node || node.end) return this.end();

    if (node.next) {
      const idx = this.order.indexOf(node.next);
      this.cursor = idx >= 0 ? idx : this.cursor + 1;
    } else {
      this.cursor += 1;
    }
    return this.resolveCurrent();
  }

  choose(choiceId: string): RenderedLine | null {
    if (!this.def || this.finished) return null;
    const nodeId = this.order[this.cursor]!;
    const node = this.def.nodes[nodeId]!;
    const choice = node.choices?.find((c) => c.id === choiceId);
    if (!choice) return this.next();

    bus.emit('dialogue:choice', { nodeId, choiceId });
    this.game.applyEffects(choice.effects);

    if (choice.next) {
      const idx = this.order.indexOf(choice.next);
      this.cursor = idx >= 0 ? idx : this.cursor + 1;
    } else {
      this.cursor += 1;
    }
    return this.resolveCurrent();
  }

  private end(): null {
    const id = this.def?.id ?? '';
    this.finished = true;
    this.def = null;
    bus.emit('dialogue:end', { dialogueId: id });
    return null;
  }

  /** Saltea nodos cuya condición no se cumple, aplica efectos y devuelve la línea a mostrar. */
  private resolveCurrent(): RenderedLine | null {
    if (!this.def) return null;
    let guard = 0;
    while (this.cursor < this.order.length && guard++ < 200) {
      const nodeId = this.order[this.cursor]!;
      const node = this.def.nodes[nodeId]!;
      if (node.condition && !this.game.flags.eval(node.condition)) {
        this.cursor += 1;
        continue;
      }
      this.game.applyEffects(node.effects);
      return this.renderNode(nodeId, node);
    }
    return this.end();
  }

  private renderNode(nodeId: string, node: DialogueNode): RenderedLine {
    const lang = this.def!.lang;
    const raw = node.text ?? '';
    const text = node.broken ? raw : this.game.lang.render(raw, lang);
    const choices = (node.choices ?? []).filter((c) => this.game.flags.eval(c.condition));
    return {
      nodeId,
      speakerId: node.speaker,
      speakerName: registry.speakerName(node.speaker, this.game.state.player.name),
      text: node.broken ? this.game.lang.render(text, lang) : text,
      portrait: node.portrait ?? 'neutral',
      choices,
      isNarrator: node.speaker === 'narrator',
    };
  }
}
