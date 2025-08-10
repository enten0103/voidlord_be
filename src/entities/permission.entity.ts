import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { UserPermission } from './user-permission.entity';

@Entity()
export class Permission {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ unique: true })
    name: string; // e.g. USER_READ

    @CreateDateColumn()
    created_at: Date;

    @UpdateDateColumn()
    updated_at: Date;

    @OneToMany(() => UserPermission, (up) => up.permission)
    userPermissions: UserPermission[];
}
