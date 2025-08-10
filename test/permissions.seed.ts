import { DataSource } from 'typeorm';
import { Permission } from '../src/entities/permission.entity';
import { UserPermission } from '../src/entities/user-permission.entity';
import { User } from '../src/entities/user.entity';

/**
 * Ensure a Permission row exists (idempotent)
 */
export async function ensurePermission(ds: DataSource, name: string): Promise<Permission> {
    const repo = ds.getRepository(Permission);
    let p = await repo.findOne({ where: { name } });
    if (!p) {
        p = repo.create({ name });
        p = await repo.save(p);
    }
    return p;
}

/**
 * Grant (or upsert) a permission to target user.
 * grantedBy can be same user id when not relevant.
 */
export async function grantPermission(ds: DataSource, granterUserId: number, targetUserId: number, permissionName: string, level: number) {
    const userRepo = ds.getRepository(User);
    const upRepo = ds.getRepository(UserPermission);
    const targetUser = await userRepo.findOne({ where: { id: targetUserId } });
    if (!targetUser) throw new Error('Target user not found for granting');
    const perm = await ensurePermission(ds, permissionName);
    let up = await upRepo.findOne({ where: { user: { id: targetUser.id }, permission: { id: perm.id } } });
    if (!up) {
        up = upRepo.create({ user: targetUser, permission: perm, level, grantedBy: { id: granterUserId } as any });
    } else {
        up.level = level;
        if (!up.grantedBy) up.grantedBy = { id: granterUserId } as any;
    }
    await upRepo.save(up);
}

/**
 * Batch grant multiple permissions to a user with same level map.
 */
export async function grantPermissions(ds: DataSource, userId: number, levelMap: Record<string, number>) {
    for (const [perm, lvl] of Object.entries(levelMap)) {
        await grantPermission(ds, userId, userId, perm, lvl);
    }
}
