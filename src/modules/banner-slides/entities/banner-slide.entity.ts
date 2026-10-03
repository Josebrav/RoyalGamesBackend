import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

// Slides for the big "Bienvenida" carousel on the logged-in Home dashboard. Order is just
// createdAt ASC — no separate ordering field, since re-ordering isn't a requirement (an admin
// who wants a different order can delete and re-add).
@Entity('banner_slides')
export class BannerSlide {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  imageUrl: string;

  @Column({ type: 'varchar' })
  imagePublicId: string;

  // A dónde navega el usuario al tocar el banner — una ruta interna (ej. "/ayuda") o una URL
  // externa completa. Null = el banner no es clickeable.
  @Column({ type: 'varchar', nullable: true })
  linkTo: string | null;

  @Column({ type: 'uuid', nullable: true })
  createdBy: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
