import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { User } from '../entities/user.entity';
import { Permission } from '../entities/permission.entity';
import { UserPermission } from '../entities/user-permission.entity';
import { PERMISSIONS } from '../modules/auth/permissions.constants';

(async () => {
  const config = new ConfigService(
    process.env as Record<string, string | undefined>,
  );
  const adminUsername = config.get<string>('ADMIN_USERNAME', 'admin');

  const ds = new DataSource({
    type: 'postgres',
    host: config.get<string>('DB_HOST', 'localhost'),
    port: config.get<number>('DB_PORT', 5432),
    username: config.get<string>('DB_USERNAME', 'postgres'),
    password: config.get<string>('DB_PASSWORD', 'postgres'),
    database: config.get<string>('DB_NAME', 'voidlord'),
    entities: [User, Permission, UserPermission],
  });

  await ds.initialize();

  const userRepo = ds.getRepository(User);
  const permRepo = ds.getRepository(Permission);
  const upRepo = ds.getRepository(UserPermission);

  const admin = await userRepo.findOne({ where: { username: adminUsername } });
  if (!admin) {
    console.error(`[verify-admin] 用户 ${adminUsername} 不存在`);
    process.exitCode = 1;
    await ds.destroy();
    return;
  }
  console.log(
    `[verify-admin] Admin 用户存在: id=${admin.id}, username=${admin.username}, email=${admin.email}`,
  );

  const allPerms = await permRepo.find();
  const permNames = new Set(allPerms.map((p) => p.name));
  const expected = new Set(PERMISSIONS);

  const missingInDB = [...expected].filter((p) => !permNames.has(p));
  if (missingInDB.length) {
    console.warn(
      `[verify-admin] 数据库缺少权限记录: ${missingInDB.join(', ')}`,
    );
  } else {
    console.log(
      `[verify-admin] 数据库权限总数=${allPerms.length} 与 PERMISSIONS 常量一致`,
    );
  }

  const ups = await upRepo.find({ where: { user: { id: admin.id } } });
  const userPermMap = new Map(ups.map((up) => [up.permission.name, up.level]));
  const missingAssignments = [...expected].filter((p) => !userPermMap.has(p));
  const nonLevel3 = [...expected].filter((p) => userPermMap.get(p) !== 3);

  if (missingAssignments.length === 0) {
    console.log('[verify-admin] Admin 已拥有所有权限分配');
  } else {
    console.warn(
      '[verify-admin] 缺失的权限分配: ' + missingAssignments.join(', '),
    );
  }
  if (nonLevel3.length === 0) {
    console.log('[verify-admin] 所有权限 level=3');
  } else {
    console.warn('[verify-admin] 非 level=3 的权限: ' + nonLevel3.join(', '));
  }

  console.log(
    `[verify-admin] 统计: permissions_in_db=${allPerms.length}, assignments=${ups.length}`,
  );

  await ds.destroy();
  console.log('[verify-admin] 完成');
})().catch((err) => {
  // 统一输出错误并设置退出码

  console.error('[verify-admin] Failed', err);
  process.exit(1);
});
