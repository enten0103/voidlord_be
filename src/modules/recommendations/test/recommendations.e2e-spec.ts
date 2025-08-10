import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Repository, DataSource } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../../app/app.module';
import { User } from '../../../entities/user.entity';
import { Book } from '../../../entities/book.entity';
import { RecommendationSection } from '../../../entities/recommendation-section.entity';
import { RecommendationItem } from '../../../entities/recommendation-item.entity';
import { grantPermissions } from '../../permissions/test/permissions.seed';

// 集成测试使用 AppModule（含全部模块）
describe('Recommendations (e2e)', () => {
    let app: INestApplication;
    let userRepo: Repository<User>;
    let bookRepo: Repository<Book>;
    let sectionRepo: Repository<RecommendationSection>;
    let itemRepo: Repository<RecommendationItem>;
    let adminToken: string;
    let userToken: string;

    beforeAll(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();

        app = moduleFixture.createNestApplication();
        app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
        await app.init();

        userRepo = moduleFixture.get(getRepositoryToken(User));
        bookRepo = moduleFixture.get(getRepositoryToken(Book));
        sectionRepo = moduleFixture.get(getRepositoryToken(RecommendationSection));
        itemRepo = moduleFixture.get(getRepositoryToken(RecommendationItem));
    });

    afterAll(async () => {
        try {
            await itemRepo.query('DELETE FROM recommendation_items');
            await sectionRepo.query('DELETE FROM recommendation_sections');
            await bookRepo.query('DELETE FROM book');
            await userRepo.query('DELETE FROM "user"');
        } catch { }
        try {
            const ds = app.get(DataSource);
            if (ds?.isInitialized) await ds.destroy();
        } catch { }
        await app.close();
    });

    beforeEach(async () => {
        // 清理顺序：子表 -> 主表，避免外键错误
        const ds = app.get(DataSource);
        try { await ds.query('DELETE FROM recommendation_items'); } catch { }
        try { await ds.query('DELETE FROM recommendation_sections'); } catch { }
        try { await ds.query('DELETE FROM book'); } catch { }
        try { await ds.query('DELETE FROM user_permission'); } catch { }
        try { await ds.query('DELETE FROM "user"'); } catch { }

        // 创建 admin & 普通用户
        const adminRes = await request(app.getHttpServer()).post('/auth/register').send({
            username: 'admin',
            email: 'admin@example.com',
            password: 'password123',
        });
        adminToken = adminRes.body.access_token;
        const adminId = adminRes.body.user.id;

        const userRes = await request(app.getHttpServer()).post('/auth/register').send({
            username: 'normal',
            email: 'normal@example.com',
            password: 'password123',
        });
        userToken = userRes.body.access_token;

        // 授予 admin 推荐与书籍相关权限
        await grantPermissions(ds, adminId, {
            RECOMMENDATION_MANAGE: 1,
            BOOK_CREATE: 1,
        });

        // 创建两本书
        const b1 = await request(app.getHttpServer())
            .post('/books')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ hash: 'hash1', title: 'Book1' });
        expect(b1.status).toBe(201);
        const b2 = await request(app.getHttpServer())
            .post('/books')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ hash: 'hash2', title: 'Book2' });
        expect(b2.status).toBe(201);
    });

    it('admin can create section & add item & list public', async () => {
        const createSec = await request(app.getHttpServer())
            .post('/recommendations/sections')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ key: 'today_hot', title: '今日最热' });
        expect(createSec.status).toBe(201);
        const sectionId = createSec.body.id;

        // 使用创建书籍返回的真实 ID
        const books = await bookRepo.find();
        const firstBookId = books[0].id;
        const addItem = await request(app.getHttpServer())
            .post(`/recommendations/sections/${sectionId}/items`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ bookId: firstBookId });
        expect(addItem.status).toBe(201);

        const pub = await request(app.getHttpServer()).get('/recommendations/public');
        expect(pub.status).toBe(200);
        expect(pub.body[0].items.length).toBe(1);
    });

    it('normal user forbidden to create section', async () => {
        const res = await request(app.getHttpServer())
            .post('/recommendations/sections')
            .set('Authorization', `Bearer ${userToken}`)
            .send({ key: 'today_hot', title: '今日最热' });
        expect(res.status).toBe(403);
    });

    // 旧的 seedPermissions 函数已被统一的 grantPermissions helper 取代

    it('cannot add duplicate book in section', async () => {
        const createSec = await request(app.getHttpServer())
            .post('/recommendations/sections')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ key: 'today_hot', title: '今日最热' });
        const sectionId = createSec.body.id;
        const books = await bookRepo.find();
        const firstBookId = books[0].id;
        await request(app.getHttpServer())
            .post(`/recommendations/sections/${sectionId}/items`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ bookId: firstBookId })
            .expect(201);

        await request(app.getHttpServer())
            .post(`/recommendations/sections/${sectionId}/items`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ bookId: firstBookId })
            .expect(409);
    });

    it('reorder items', async () => {
        const sec = await request(app.getHttpServer())
            .post('/recommendations/sections')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ key: 'sec1', title: 'Sec1' });
        const secId = sec.body.id;

        const books = await bookRepo.find({ order: { id: 'ASC' } });
        await request(app.getHttpServer())
            .post(`/recommendations/sections/${secId}/items`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ bookId: books[0].id });

        await request(app.getHttpServer())
            .post(`/recommendations/sections/${secId}/items`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ bookId: books[1].id });

        // 拉取 section 详情获取真实 item id 顺序
        const detail = await request(app.getHttpServer())
            .get(`/recommendations/sections/${secId}`)
            .set('Authorization', `Bearer ${adminToken}`);
        expect(detail.status).toBe(200);
        const itemIds = detail.body.items.map((i: any) => i.id);
        expect(itemIds.length).toBe(2);
        const reversed = [...itemIds].reverse();
        const reorder = await request(app.getHttpServer())
            .patch(`/recommendations/sections/${secId}/items/reorder`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ itemIds: reversed });
        expect([200, 201, 204]).toContain(reorder.status);
    });

    it('disabled section not visible in public', async () => {
        const createSec = await request(app.getHttpServer())
            .post('/recommendations/sections')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ key: 'temp_sec', title: 'Temp' });
        const secId = createSec.body.id;
        // 设为 inactive
        await request(app.getHttpServer())
            .patch(`/recommendations/sections/${secId}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ active: false });
        const pub = await request(app.getHttpServer()).get('/recommendations/public');
        expect(pub.body.find((s: any) => s.id === secId)).toBeUndefined();
    });

    it('delete item removes it from public', async () => {
        const createSec = await request(app.getHttpServer())
            .post('/recommendations/sections')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ key: 'del_sec', title: 'DelSec' });
        const secId = createSec.body.id;
        const books = await bookRepo.find({ order: { id: 'ASC' } });
        await request(app.getHttpServer())
            .post(`/recommendations/sections/${secId}/items`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ bookId: books[0].id });
        const detail = await request(app.getHttpServer())
            .get(`/recommendations/sections/${secId}`)
            .set('Authorization', `Bearer ${adminToken}`);
        const itemId = detail.body.items[0].id;
        await request(app.getHttpServer())
            .delete(`/recommendations/sections/${secId}/items/${itemId}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .expect(200);
        const pub = await request(app.getHttpServer()).get('/recommendations/public');
        const sec = pub.body.find((s: any) => s.id === secId);
        expect(sec.items.length).toBe(0);
    });
});
