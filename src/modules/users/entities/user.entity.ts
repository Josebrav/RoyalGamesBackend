import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToMany,
  OneToMany,
} from 'typeorm';
import { Game } from '../../games/entities/game.entity';
import { Pay } from '../../payments/entities/pay.entity';
import { Bet } from '../../bets/entities/bet.entity';
import { PromoCode } from '../../promo-codes/entities/promo-code.entity';
import { Role } from '../../../common/enums/role.enum';
import { RankTier } from '../../../common/enums/rank-tier.enum';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 30, unique: true })
  nick: string;

  @Column({ type: 'varchar', length: 50, unique: true })
  email: string;

  @Column({ type: 'varchar', nullable: true })
  password: string;

  // select: false: son blobs de cientos de KB. Sin esto, CUALQUIER findById (getUserById,
  // getUserByEmail, etc.) los traía enteros y los mandaba en el JSON de respuesta —un
  // GET /user/:id llegó a pesar 5.5MB por esto. Los endpoints que sí necesitan el binario
  // (getAvatarBinary, getAvatarThumbnailBinary) los piden explícitamente con addSelect.
  @Column({ name: 'avatar_bin', type: 'bytea', nullable: true, select: false })
  avatarBin: Buffer;

  @Column({ name: 'avatar_mime', type: 'varchar', nullable: true })
  avatarMime: string;

  // Recorte cuadrado (cabeza/cuello) generado en Unity aparte del avatar completo, para
  // mostrar en el nav y otros lugares chicos sin achicar el busto entero.
  @Column({ name: 'avatar_thumb_bin', type: 'bytea', nullable: true, select: false })
  avatarThumbBin: Buffer;

  @Column({ name: 'avatar_thumb_mime', type: 'varchar', nullable: true })
  avatarThumbMime: string;

  @Column({ type: 'jsonb', nullable: true })
  avatarData: any;

  @Column({ type: 'varchar', nullable: true })
  googleId: string;

  @Column({ type: 'varchar', nullable: true })
  image: string;

  @Column({ type: 'int', nullable: true })
  age: number;

  @Column({ type: 'varchar', nullable: true })
  description: string;

  @Column({ type: 'varchar', nullable: true })
  country: string;

  @Column({ type: 'varchar', nullable: true })
  sexo: string;

  

  @Column({ type: 'bigint', default: 0 })
  chips: number;

  @Column({ type: 'enum', enum: Role, default: Role.USER })
  role: Role;

  @Column({ type: 'boolean', default: false })
  banned: boolean;

  @Column({ type: 'boolean', default: false })
  inactive: boolean;

  @Column({ type: 'boolean', default: false })
  firstChips: boolean;

  @Column({ type: 'enum', enum: RankTier, default: RankTier.BRONZE })
  rank: RankTier;

  @Column({ type: 'bigint', default: 0 })
  totalChipsDeposited: number;

  @Column({ type: 'timestamp', nullable: true })
  lastSeen: Date | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  currentActivity: string | null;

  // Code this user shares to refer others (auto-generated at signup, backfilled for old
  // accounts). `referredBy` is the id of whoever's code THIS user entered at signup, if any.
  @Column({ type: 'varchar', length: 12, unique: true })
  referralCode: string;

  @Column({ type: 'uuid', nullable: true })
  referredBy: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToMany(() => Game, (game) => game.users)
  games: Game[];

  @OneToMany(() => Pay, (pay) => pay.user, { cascade: true })
  payments: Pay[];

  @OneToMany(() => Bet, (bet) => bet.user, { cascade: true })
  bets: Bet[];

  @ManyToMany(() => PromoCode, (promoCode) => promoCode.usedByUsers)
  promoCodes: PromoCode[];
}
