import { Entity, Column, CreateDateColumn, ManyToOne, JoinColumn, PrimaryGeneratedColumn, Index } from 'typeorm';
import { User } from '../../users/entities/user.entity';

/**
 * Refresh token de larga duración (httpOnly cookie), opaco — nunca es un JWT. Guardamos
 * solo el hash (sha256), igual que PasswordResetToken. Rotación: cada `POST /auth/refresh`
 * exitoso marca esta fila `revokedAt` + `replacedByHash` y crea una fila nueva. Si alguna vez
 * llega un refresh con el hash de una fila YA revocada, es una señal fuerte de robo (alguien
 * usó una copia del token después de que el dueño legítimo ya lo rotó) — ver
 * AuthService.refresh(), que ante eso revoca toda la cadena del usuario.
 */
@Entity('refresh_tokens')
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  userId: string;

  @Column({ type: 'varchar', length: 64, unique: true })
  tokenHash: string;

  @Column({ type: 'timestamp' })
  expiresAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  revokedAt: Date | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  replacedByHash: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  userAgent: string | null;

  @Column({ type: 'varchar', length: 45, nullable: true })
  ip: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;
}
