import { bus } from '@/core/EventBus';
import type { GameState, TurnId } from '@/core/types';

export const TURNS: TurnId[] = ['amanecer', 'manana', 'tarde', 'noche'];

/**
 * Único sistema que puede mover el reloj. El tiempo no corre solo:
 * avanza cuando una acción lo cuesta (GDD §5.1).
 */
export class TimeSystem {
  constructor(private state: GameState) {}

  get turnIndex(): number {
    return TURNS.indexOf(this.state.progress.turn);
  }

  get day(): number {
    return this.state.progress.day;
  }

  /** Avanza `cost` turnos. Devuelve la cantidad de días que se cerraron. */
  advance(cost = 1): number {
    if (cost <= 0) return 0;
    let daysEnded = 0;
    for (let i = 0; i < cost; i++) {
      const prevTurn = this.state.progress.turn;
      let idx = TURNS.indexOf(prevTurn) + 1;
      if (idx >= TURNS.length) {
        idx = 0;
        const endedDay = this.state.progress.day;
        this.state.progress.day += 1;
        daysEnded++;
        this.state.progress.turn = TURNS[idx]!;
        bus.emit('time:turn-advanced', { day: this.state.progress.day, turn: this.state.progress.turn, prevTurn });
        bus.emit('time:day-ended', { day: endedDay });
      } else {
        this.state.progress.turn = TURNS[idx]!;
        bus.emit('time:turn-advanced', { day: this.state.progress.day, turn: this.state.progress.turn, prevTurn });
      }
    }
    return daysEnded;
  }

  /** ¿Se acabó el presupuesto de jornadas del nivel? */
  isLevelOver(totalDays: number): boolean {
    return this.state.progress.day > totalDays;
  }

  label(): string {
    const map: Record<TurnId, string> = {
      amanecer: 'Amanecer',
      manana: 'Mañana',
      tarde: 'Tarde',
      noche: 'Noche',
    };
    return map[this.state.progress.turn];
  }
}
