import { bus } from '@/core/EventBus';
import { registry } from '@/core/Registry';
import type { GameState, PartyMember } from '@/core/types';

/** Salud, moral, vínculos. La gente no muere por barra: muere con aviso previo (GDD §5.4). */
export class PartySystem {
  constructor(private state: GameState) {}

  get members(): PartyMember[] {
    return this.state.party;
  }

  member(id: string): PartyMember | undefined {
    return this.state.party.find((m) => m.id === id || m.id === `npc_${id}`);
  }

  bond(id: string, delta: number): void {
    const m = this.member(id);
    if (!m) return;
    const max = registry.balance.global.bondMaxLevel as number;
    m.bond = Math.max(0, Math.min(max, m.bond + delta));
    bus.emit('party:bond-changed', { memberId: m.id, level: m.bond });
  }

  health(id: string, delta: number): void {
    const m = this.member(id);
    if (!m) return;
    const from = m.health;
    m.health = clamp(m.health + delta, 0, registry.balance.global.healthMax as number);
    if (m.health !== from) bus.emit('party:health-changed', { memberId: m.id, from, to: m.health });
  }

  memberMorale(id: string, delta: number): void {
    const m = this.member(id);
    if (!m) return;
    m.morale = clamp(m.morale + delta, 0, registry.balance.global.moraleMax as number);
  }

  groupMorale(delta: number): void {
    const from = this.state.morale;
    this.state.morale = clamp(from + delta, 0, registry.balance.global.moraleMax as number);
    if (this.state.morale !== from) bus.emit('party:morale-changed', { from, to: this.state.morale });
  }

  /** Aplica la recuperación nocturna según el fuego que se pudo encender. */
  applyNight(fire: 'bigFire' | 'smallFire' | 'noFire'): void {
    const r = registry.balance.nightRecovery[fire];
    this.groupMorale(r.morale);
    for (const m of this.state.party) this.health(m.id, r.health);
  }

  bondsAtLeast(level: number): number {
    return this.state.party.filter((m) => m.bond >= level).length;
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
