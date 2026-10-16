import { Entity, PrimaryColumn, Column, UpdateDateColumn } from 'typeorm';

/**
 * Preferencias de SantaWilds por jugador - hoy solo la última apuesta elegida. Antes el cliente
 * recalculaba la apuesta inicial en cada carga de página a partir de currentChips/100 (ver
 * ChipManager.Start), lo cual cambiaba de tier de apuesta cada vez que el saldo variaba y, como
 * el progreso de JACKPOT se lleva POR TIER (ver SantaWildsJackpotProgress), hacía que el
 * contador mostrado pareciera "cambiar solo" entre sesiones. Guardando la última apuesta usada,
 * el tier se mantiene estable salvo que el jugador lo cambie a mano.
 */
@Entity('santawilds_player_settings')
export class SantaWildsPlayerSettings {
  @PrimaryColumn({ type: 'uuid' })
  userId: string;

  @Column({ type: 'bigint' })
  lastBetAmount: number;

  @UpdateDateColumn()
  updatedAt: Date;
}
