import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';

// Trofeo de torneo: una imagen única (arte compuesto aparte por el admin, ej. con GPT — el
// trofeo + el avatar del ganador en una sola pieza) asignada a un usuario, mostrada en su perfil.
// Un usuario puede tener varios (uno por torneo ganado) — sin restricción de unicidad.
@Entity('trophies')
export class Trophy {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'varchar' })
  title: string;

  @Column({ type: 'varchar', nullable: true })
  description: string | null;

  @Column({ type: 'varchar' })
  imageUrl: string;

  @Column({ type: 'varchar' })
  imagePublicId: string;

  // Admin/mod que lo otorgó — nullable porque SET NULL si esa cuenta se borra, el trofeo del
  // ganador no tiene por qué desaparecer con ella.
  @Column({ type: 'uuid', nullable: true })
  awardedBy: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
