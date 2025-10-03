import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../../app/app.module';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User } from '../../../entities/user.entity';
import { Permission } from '../../../entities/permission.entity';
import { UserPermission } from '../../../entities/user-permission.entity';

/**
 * E2E 场景:
 * - 注册 adminA 与 userB
 * - 手动给 adminA 赋予 USER_UPDATE level3 (直接写库) 模拟超级管理员
 * - adminA 使用 /permissions/grant 给 userB 赋 USER_READ level1
 * - userB 登录后访问需要 USER_READ 的接口: /permissions/user/:id (需要 USER_READ level1)
 * - userB 尝试提升自己权限 (应失败: 没有 USER_UPDATE level2)
 * - adminA revoke userB 的权限
 */

describe('Permissions (e2e)', () => {
    let app: INestApplication;
    let ds: DataSource;

    let adminToken: string;
    let userToken: string;
    let adminId: number;
    let userId: number;

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
        // 使用原生 SQL 清理，避免空 criteria 限制
        await ds.query('DELETE FROM user_permission');
        await ds.query('DELETE FROM permission');
        await ds.query('DELETE FROM "user"');
    });

    async function register(username: string, email: string) {
        const res = await request(app.getHttpServer())
            .post('/auth/register')
            .send({ username, email, password: 'password123' })
            .expect(201);
        return { token: res.body.access_token as string, id: res.body.user.id as number };
    }

    async function ensurePermission(name: string) {
        const repo = ds.getRepository(Permission);
        let p = await repo.findOne({ where: { name } });
        if (!p) {
            p = repo.create({ name });
            await repo.save(p);
        }
        return p;
    }

    async function grantDirect(userId: number, permission: string, level: number) {
        const p = await ensurePermission(permission);
        const user = await ds.getRepository(User).findOne({ where: { id: userId } });
        const upRepo = ds.getRepository(UserPermission);
        let up = await upRepo.findOne({ where: { user: { id: userId }, permission: { id: p.id } } });
        if (!up) {
            up = upRepo.create({ user: user!, permission: p, level, grantedBy: user! });
        } else {
            up.level = level;
        }
        await upRepo.save(up);
    }

    it('full permission lifecycle', async () => {
        // 注册两个用户
        ({ token: adminToken, id: adminId } = await register('adminA', 'a@example.com'));
        ({ token: userToken, id: userId } = await register('userB', 'b@example.com'));

        // 直接赋予 adminA 超级权限 (通过种子或直接插入)
        await grantDirect(adminId, 'USER_UPDATE', 3);
        await grantDirect(adminId, 'USER_READ', 3);

        // adminA 给 userB 授予 USER_READ level1
        await request(app.getHttpServer())
            .post('/permissions/grant')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ userId: userId, permission: 'USER_READ', level: 1 })
            .expect(201)
            .expect(res => {
                expect(res.body).toEqual({ userId: userId, permission: 'USER_READ', level: 1 });
            });

        // userB 访问需要 USER_READ 的接口 (查询自己权限)
        await request(app.getHttpServer())
            .get(`/permissions/user/${userId}`)
            .set('Authorization', `Bearer ${userToken}`)
            .expect(200)
            .expect(res => {
                expect(res.body).toEqual([{ permission: 'USER_READ', level: 1 }]);
            });

        // userB 尝试授予权限 (应403)
        await request(app.getHttpServer())
            .post('/permissions/grant')
            .set('Authorization', `Bearer ${userToken}`)
            .send({ userId: userId, permission: 'USER_READ', level: 1 })
            .expect(403);

        // 未登录访问受保护接口，应返回 401
        await request(app.getHttpServer())
            .post('/permissions/grant')
            .send({ userId: userId, permission: 'USER_READ', level: 1 })
            .expect(401);

        // adminA revoke userB USER_READ
        await request(app.getHttpServer())
            .post('/permissions/revoke')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ userId: userId, permission: 'USER_READ' })
            .expect(201)
            .expect(res => {
                expect(res.body).toEqual({ revoked: true });
            });

        // userB 再次查询权限应为空 (403 因无 USER_READ)
        await request(app.getHttpServer())
            .get(`/permissions/user/${userId}`)
            .set('Authorization', `Bearer ${userToken}`)
            .expect(403);

        // 未登录查询，应为 401
        await request(app.getHttpServer())
            .get(`/permissions/user/${userId}`)
            .expect(401);
    });
});
