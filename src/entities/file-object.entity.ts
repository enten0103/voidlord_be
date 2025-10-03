import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from './user.entity';

@Entity()
export class FileObject {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 512 })
  key: string;

  @Column({ length: 128, default: 'voidlord' })
  bucket: string;

  @ManyToOne(() => User, { nullable: false })
  owner: User;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  created_at: Date;
}
