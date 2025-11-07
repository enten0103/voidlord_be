import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { createTestModule } from '../../../../test/test-module.factory';
import { DataSource, Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Book } from '../../../entities/book.entity';
import { grantPermissions } from '../../permissions/test/permissions.seed';

describe('Book Lists (e2e)', () => {
    let app: INestApplication;
    let bookRepo: Repository<Book>;
    let userToken: string;
    let userId: number;
    let otherToken: string;
    let ds: DataSource;

    beforeAll(async () => {
        const moduleFixture: TestingModule = await createTestModule();
        app = moduleFixture.createNestApplication();
        app.useGlobalPipes(
            new ValidationPipe({ whitelist: true, transform: true }),
        );
        await app.init();

        bookRepo = moduleFixture.get<Repository<Book>>(getRepositoryToken(Book));
        ds = moduleFixture.get(DataSource);

        // register user
        const reg = await request(app.getHttpServer())
            .post('/auth/register')
            .send({
                username: 'luser',
                email: 'luser@example.com',
                password: 'p@ssw0rd!',
            })
            .expect(201);
        userId = reg.body.user.id;
        const login = await request(app.getHttpServer())
            .post('/auth/login')
            .send({ username: 'luser', password: 'p@ssw0rd!' })
            .expect(201);
        userToken = login.body.access_token;
        // grant BOOK_CREATE to allow creating books
        await grantPermissions(ds, userId, { BOOK_CREATE: 1 });

        // other user
        const or = await request(app.getHttpServer())
            .post('/auth/register')
            .send({
                username: 'otherl',
                email: 'otherl@example.com',
                password: 'p@ssw0rd!',
            })
            .expect(201);
        const ol = await request(app.getHttpServer())
            .post('/auth/login')
            .send({ username: 'otherl', password: 'p@ssw0rd!' })
            .expect(201);
        otherToken = ol.body.access_token;
    });

    afterAll(async () => {
        try {
            await app.close();
        } catch { }
    });

    it('create list, add book, view detail, privacy works', async () => {
        // create a book to add
        const b = await request(app.getHttpServer())
            .post('/books')
            .set('Authorization', `Bearer ${userToken}`)
            .send({ hash: 'fav-h1', title: 'Fav One' })
            .expect(201);

        // create list private
        const cl = await request(app.getHttpServer())
            .post('/book-lists')
            .set('Authorization', `Bearer ${userToken}`)
            .send({ name: 'MyFav', is_public: false })
            .expect(201);

        const listId = cl.body.id;

        // add book
        await request(app.getHttpServer())
            .post(`/book-lists/${listId}/books`)
            .set('Authorization', `Bearer ${userToken}`)
            .send({ bookId: b.body.id })
            .expect(201);

        // other user cannot view private
        await request(app.getHttpServer())
            .get(`/book-lists/${listId}`)
            .set('Authorization', `Bearer ${otherToken}`)
            .expect(403);

        // set public
        await request(app.getHttpServer())
            .patch(`/book-lists/${listId}`)
            .set('Authorization', `Bearer ${userToken}`)
            .send({ is_public: true })
            .expect(200);

        // now other can view
        const view = await request(app.getHttpServer())
            .get(`/book-lists/${listId}`)
            .expect(200);
        expect(view.body.items_count).toBe(1);
        expect(view.body.items[0].book.title).toBe('Fav One');

        // duplicate add -> 409
        await request(app.getHttpServer())
            .post(`/book-lists/${listId}/books`)
            .set('Authorization', `Bearer ${userToken}`)
            .send({ bookId: b.body.id })
            .expect(409);

        // remove book
        await request(app.getHttpServer())
            .delete(`/book-lists/${listId}/books/${b.body.id}`)
            .set('Authorization', `Bearer ${userToken}`)
            .expect(200);
    });

    it('copy public list to another user creates a private duplicate with items', async () => {
        // owner creates a book
        const b = await request(app.getHttpServer())
            .post('/books')
            .set('Authorization', `Bearer ${userToken}`)
            .send({ hash: 'copy-h1', title: 'Copy One' })
            .expect(201);

        // owner creates a public source list
        const cl = await request(app.getHttpServer())
            .post('/book-lists')
            .set('Authorization', `Bearer ${userToken}`)
            .send({ name: 'CopySrc', is_public: true })
            .expect(201);
        const srcId = cl.body.id;

        // add book to source list
        await request(app.getHttpServer())
            .post(`/book-lists/${srcId}/books`)
            .set('Authorization', `Bearer ${userToken}`)
            .send({ bookId: b.body.id })
            .expect(201);

        // other user copies it
        const cp = await request(app.getHttpServer())
            .post(`/book-lists/${srcId}/copy`)
            .set('Authorization', `Bearer ${otherToken}`)
            .expect(201);

        expect(cp.body).toHaveProperty('id');
        expect(cp.body.is_public).toBe(false);
        expect(cp.body.items_count).toBe(1);

        // copied list defaults to private; response already contains items_count
    });

    it('copying private list of others is forbidden', async () => {
        // owner creates a book
        const b = await request(app.getHttpServer())
            .post('/books')
            .set('Authorization', `Bearer ${userToken}`)
            .send({ hash: 'copy-h2', title: 'Private Copy Book' })
            .expect(201);

        // owner creates a private source list
        const cl = await request(app.getHttpServer())
            .post('/book-lists')
            .set('Authorization', `Bearer ${userToken}`)
            .send({ name: 'PrivateSrc', is_public: false })
            .expect(201);
        const srcId = cl.body.id;

        await request(app.getHttpServer())
            .post(`/book-lists/${srcId}/books`)
            .set('Authorization', `Bearer ${userToken}`)
            .send({ bookId: b.body.id })
            .expect(201);

        // other tries to copy -> 403
        await request(app.getHttpServer())
            .post(`/book-lists/${srcId}/copy`)
            .set('Authorization', `Bearer ${otherToken}`)
            .expect(403);
    });

    it('copy uses name suffix when target has same-name list', async () => {
        // owner creates a book
        const b = await request(app.getHttpServer())
            .post('/books')
            .set('Authorization', `Bearer ${userToken}`)
            .send({ hash: 'copy-h3', title: 'Same Name Book' })
            .expect(201);

        // owner creates a public source list with name Collision
        const cl = await request(app.getHttpServer())
            .post('/book-lists')
            .set('Authorization', `Bearer ${userToken}`)
            .send({ name: 'Collision', is_public: true })
            .expect(201);
        const srcId = cl.body.id;

        await request(app.getHttpServer())
            .post(`/book-lists/${srcId}/books`)
            .set('Authorization', `Bearer ${userToken}`)
            .send({ bookId: b.body.id })
            .expect(201);

        // other user already has a list named Collision
        await request(app.getHttpServer())
            .post('/book-lists')
            .set('Authorization', `Bearer ${otherToken}`)
            .send({ name: 'Collision', is_public: false })
            .expect(201);

        // copying should succeed with a suffixed name
        const cp = await request(app.getHttpServer())
            .post(`/book-lists/${srcId}/copy`)
            .set('Authorization', `Bearer ${otherToken}`)
            .expect(201);
        expect(typeof cp.body.name).toBe('string');
        expect(cp.body.name).toMatch(/Collision \(copy( \d+)?\)$/);
        expect(cp.body.items_count).toBe(1);
    });
});
