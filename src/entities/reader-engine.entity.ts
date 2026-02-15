import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { ReaderInstance } from './reader-instance.entity';

@Entity('reader_engines')
export class ReaderEngine {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true, length: 64 })
  key: string; // e.g. "tono"

  @Column({ length: 128 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Column({ default: true })
  active: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @OneToMany(() => ReaderInstance, (i) => i.engine)
  instances: ReaderInstance[];
}
