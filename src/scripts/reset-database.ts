import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { User } from '../entities/user.entity';
import { Book } from '../entities/book.entity';
import { Tag } from '../entities/tag.entity';
import { RecommendationSection } from '../entities/recommendation-section.entity';
import { RecommendationItem } from '../entities/recommendation-item.entity';
import { Permission } from '../entities/permission.entity';
import { UserPermission } from '../entities/user-permission.entity';
import { PERMISSIONS } from '../modules/auth/permissions.constants';
import * as bcrypt from 'bcryptjs';

// 简单读取 process.env，不加载完整 Nest 应用，保持脚本轻量
(async () => {
    const config = new ConfigService(process.env as any);

    const ds = new DataSource({
        type: 'postgres',
        host: config.get<string>('DB_HOST', 'localhost'),
        port: config.get<number>('DB_PORT', 5432),
        username: config.get<string>('DB_USERNAME', 'postgres'),
        password: config.get<string>('DB_PASSWORD', 'postgres'),
        database: config.get<string>('DB_NAME', 'voidlord'),
        entities: [User, Book, Tag, RecommendationSection, RecommendationItem, Permission, UserPermission],
    });

    console.log('[reset] Connecting to database ...');
    await ds.initialize();

    const shouldDrop = config.get<string>('DB_RESET_STRATEGY', 'truncate');

    // 禁用外键 (PostgreSQL)
    await ds.query('SET session_replication_role = replica;');
    try {
        const tables = await ds.query("SELECT tablename FROM pg_tables WHERE schemaname='public'");

        if (shouldDrop === 'drop') {
            console.log('[reset] Dropping tables ...');
            for (const row of tables) {
                await ds.query(`DROP TABLE IF EXISTS "${row.tablename}" CASCADE;`);
            }
        } else {
            console.log('[reset] Truncating tables ...');
            const tableNames = tables.map((t: any) => `"${t.tablename}"`).join(', ');
            if (tableNames) {
                await ds.query(`TRUNCATE ${tableNames} RESTART IDENTITY CASCADE;`);
            }
        }
    } finally {
        await ds.query('SET session_replication_role = DEFAULT;');
    }

    // 重新创建 schema (如果 drop 了并且未启用 synchronize，需要迁移，这里简单依赖 synchronize)
    const synchronize = config.get<string>('DB_SYNCHRONIZE', 'true') === 'true';
    if (synchronize) {
        console.log('[reset] Synchronizing schema ...');
        await ds.synchronize();
    }

    console.log('[reset] Seeding permissions & admin ...');
    const permRepo = ds.getRepository(Permission);
    const userRepo = ds.getRepository(User);
    const userPermRepo = ds.getRepository(UserPermission);

    for (const p of PERMISSIONS) {
        const exists = await permRepo.findOne({ where: { name: p } });
        if (!exists) await permRepo.save(permRepo.create({ name: p }));
    }

    const adminUsername = config.get<string>('ADMIN_USERNAME', 'admin');
    const adminEmail = config.get<string>('ADMIN_EMAIL', 'admin@example.com');
    const adminPassword = config.get<string>('ADMIN_PASSWORD', 'admin123');

    let admin = await userRepo.findOne({ where: { username: adminUsername } });
    if (!admin) {
        const hashed = await bcrypt.hash(adminPassword, 10);
        admin = await userRepo.save(userRepo.create({ username: adminUsername, email: adminEmail, password: hashed }));
        console.log(`[reset] Admin created: ${adminUsername}`);
    } else {
        console.log('[reset] Admin already exists, skipping create');
    }

    const allPerms = await permRepo.find();
    for (const perm of allPerms) {
        const existingUP = await userPermRepo.findOne({ where: { user: { id: admin.id }, permission: { id: perm.id } } });
        if (!existingUP) {
            await userPermRepo.save(userPermRepo.create({ user: admin, permission: perm, level: 3, grantedBy: null }));
        }
    }
    console.log('[reset] Admin permissions ensured');

    await ds.destroy();
    console.log('[reset] Done');
    process.exit(0);
})().catch(err => {
    console.error('[reset] Failed', err);
    process.exit(1);
});
