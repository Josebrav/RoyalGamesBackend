import {
  Entity,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { PaymentStatus } from '../enums/payment-status.enum';

@Entity('pays')
export class Pay {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', nullable: true })
  mercadoPagoPaymentId: string;

  @Column({ type: 'varchar', nullable: true })
  mercadoPagoPreferenceId: string;

  @Column({ type: 'varchar', nullable: true })
  paymentPlatform: string;

  @Column({ type: 'varchar' })
  price: string;

  // Nullable a propósito: los pagos creados antes de este fix no tienen moneda
  // registrada y no se puede reconstruir con certeza — se dejan en NULL en vez
  // de adivinar. Todo pago nuevo (MercadoPago o PayPal) sí la trae.
  @Column({ type: 'varchar', nullable: true })
  currency: string | null;

  @Column({ type: 'bigint' })
  chips: number;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({
    type: 'enum',
    enum: PaymentStatus,
    default: PaymentStatus.PENDING,
  })
  status: PaymentStatus;

  @Column({ type: 'varchar', nullable: true })
  date: string;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => User, (user) => user.payments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;
}
