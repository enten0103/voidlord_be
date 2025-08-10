import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/modules/app/app.module';
import { DataSource } from 'typeorm';
import { Permission } from '../src/entities/permission.entity';
import { User } from '../src/entities/user.entity';
import { UserPermission } from '../src/entities/user-permission.entity';
import { PERMISSIONS } from '../src/modules/auth/permissions.constants';

/**
 * 场景: 查询 admin 用户的所有权限
 * 步骤:
 * 1. 注册 admin 用户 (username=admin)
 * 2. 手动插入 PERMISSIONS 常量所列权限
 * 3. 为 admin 创建所有 user_permission level=3 记录
 * 4. 调用 GET /permissions/user/:id 验证返回完整权限集合 (level=3)
 */

describe('Admin Permissions Query (e2e)', () => {
    let app: INestApplication;
    let ds: DataSource;
    let adminId: number;
    let adminToken: string;

    beforeAll(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();

        app = moduleFixture.createNestApplication();
        app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
        await app.init();
        ds = app.get(DataSource);
    });

    afterAll(async () => {
        if (ds?.isInitialized) await ds.destroy();
        await app.close();
    });

    beforeEach(async () => {
        await ds.query('DELETE FROM user_permission');
        await ds.query('DELETE FROM permission');
        await ds.query('DELETE FROM "user"');

        // 注册 admin
        const res = await request(app.getHttpServer())
            .post('/auth/register')
            .send({ username: 'admin', email: 'admin@example.com', password: 'admin123' })
            .expect(201);
        adminToken = res.body.access_token;
        adminId = res.body.user.id;

        // 插入权限 & 赋予 admin
        const permRepo = ds.getRepository(Permission);
        const userRepo = ds.getRepository(User);
        const upRepo = ds.getRepository(UserPermission);
        const admin = await userRepo.findOne({ where: { id: adminId } });

        for (const p of PERMISSIONS) {
            let perm = await permRepo.findOne({ where: { name: p } });
            if (!perm) {
                perm = permRepo.create({ name: p });
                await permRepo.save(perm);
            }
            let up = await upRepo.findOne({ where: { user: { id: adminId }, permission: { id: perm.id } } });
            if (!up) {
                up = upRepo.create({ user: admin!, permission: perm, level: 3, grantedBy: admin! });
                await upRepo.save(up);
            }
        }
    });

    it('should return all admin permissions (level=3)', async () => {
        const expected = PERMISSIONS.map(p => ({ permission: p, level: 3 })).sort((a, b) => a.permission.localeCompare(b.permission));

        const resp = await request(app.getHttpServer())
            .get(`/permissions/user/${adminId}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .expect(200);

        const bodySorted = [...resp.body].sort((a: any, b: any) => a.permission.localeCompare(b.permission));
        expect(bodySorted).toEqual(expected);
    });
});
