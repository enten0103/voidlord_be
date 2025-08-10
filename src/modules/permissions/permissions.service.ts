import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { GrantPermissionDto } from './dto/grant-permission.dto';
import { RevokePermissionDto } from './dto/revoke-permission.dto';
import { Permission } from '../../entities/permission.entity';
import { User } from '../../entities/user.entity';
import { UserPermission } from '../../entities/user-permission.entity';

@Injectable()
export class PermissionsService {
    constructor(private dataSource: DataSource) { }

    private permRepo() { return this.dataSource.getRepository(Permission); }
    private userRepo() { return this.dataSource.getRepository(User); }
    private userPermRepo() { return this.dataSource.getRepository(UserPermission); }

    async grant(currentUserId: number, dto: GrantPermissionDto) {
        if (![1, 2, 3].includes(dto.level)) throw new BadRequestException('Invalid level');
        const currentUserPerm = await this.getUserPermissionLevel(currentUserId, dto.permission);
        if (currentUserPerm < 2) throw new ForbiddenException('No grant ability');
        if (currentUserPerm === 2 && dto.level > 1) {
            throw new ForbiddenException('Level 2 can only grant level 1');
        }
        const user = await this.userRepo().findOne({ where: { id: dto.userId } });
        if (!user) throw new BadRequestException('Target user not found');
        let perm = await this.permRepo().findOne({ where: { name: dto.permission } });
        if (!perm) throw new BadRequestException('Permission not found');
        let up = await this.userPermRepo().findOne({ where: { user: { id: user.id }, permission: { id: perm.id } } });
        if (!up) {
            up = this.userPermRepo().create({ user, permission: perm, level: dto.level, grantedBy: { id: currentUserId } as any });
        } else {
            if (currentUserPerm <= up.level) throw new ForbiddenException('Cannot upgrade equal/higher assignment');
            up.level = dto.level;
            if (up.grantedBy == null) up.grantedBy = { id: currentUserId } as any;
        }
        await this.userPermRepo().save(up);
        return { userId: user.id, permission: dto.permission, level: up.level };
    }

    async revoke(currentUserId: number, dto: RevokePermissionDto) {
        const currentUserPerm = await this.getUserPermissionLevel(currentUserId, dto.permission);
        if (currentUserPerm < 2) throw new ForbiddenException('No revoke ability');
        const user = await this.userRepo().findOne({ where: { id: dto.userId } });
        if (!user) throw new BadRequestException('Target user not found');
        const perm = await this.permRepo().findOne({ where: { name: dto.permission } });
        if (!perm) throw new BadRequestException('Permission not found');
        const up = await this.userPermRepo().findOne({ where: { user: { id: user.id }, permission: { id: perm.id } }, relations: ['grantedBy'] });
        if (!up) return { revoked: false };
        if (currentUserPerm === 2) {
            if (!up.grantedBy || up.grantedBy.id !== currentUserId) {
                throw new ForbiddenException('Level 2 can only revoke assignments granted by themselves');
            }
        }
        await this.userPermRepo().remove(up);
        return { revoked: true };
    }

    async getUserPermissionLevel(userId: number, permissionName: string): Promise<number> {
        const res = await this.userPermRepo().createQueryBuilder('up')
            .innerJoin('up.permission', 'p')
            .innerJoin('up.user', 'u')
            .where('u.id = :userId AND p.name = :permission', { userId, permission: permissionName })
            .getOne();
        return res?.level || 0;
    }

    async listUserPermissions(userId: number) {
        const ups = await this.userPermRepo().find({ where: { user: { id: userId } } });
        return ups.map(u => ({ permission: u.permission.name, level: u.level }));
    }
}
