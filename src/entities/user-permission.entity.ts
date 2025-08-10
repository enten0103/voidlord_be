import { Entity, PrimaryGeneratedColumn, ManyToOne, Column, CreateDateColumn, Unique } from 'typeorm';
import { User } from './user.entity';
import { Permission } from './permission.entity';

// level: 1 basic, 2 can grant level 1 (and revoke those granted by self), 3 can grant/revoke any
@Entity()
@Unique(['user', 'permission'])
export class UserPermission {
    @PrimaryGeneratedColumn()
    id: number;

    @ManyToOne(() => User, { eager: true, onDelete: 'CASCADE' })
    user: User;

    @ManyToOne(() => Permission, { eager: true, onDelete: 'CASCADE' })
    permission: Permission;

    @Column({ type: 'int' })
    level: number; // 1,2,3

    @ManyToOne(() => User, { nullable: true, eager: true, onDelete: 'SET NULL' })
    grantedBy: User | null;

    @CreateDateColumn()
    created_at: Date;
}
