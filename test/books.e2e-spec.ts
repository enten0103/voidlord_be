import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { createTestModule } from './test-module.factory';
import { Book } from '../src/entities/book.entity';
import { Tag } from '../src/entities/tag.entity';
import { User } from '../src/entities/user.entity';

describe('Books (e2e)', () => {
    let app: INestApplication;
    let bookRepository: Repository<Book>;
    let tagRepository: Repository<Tag>;
    let userRepository: Repository<User>;
    let authToken: string;

    beforeAll(async () => {
        const moduleFixture: TestingModule = await createTestModule();
        app = moduleFixture.createNestApplication();
        app.useGlobalPipes(new ValidationPipe({
            whitelist: true,
            transform: true,
        }));

        await app.init();

        bookRepository = moduleFixture.get<Repository<Book>>(getRepositoryToken(Book));
        tagRepository = moduleFixture.get<Repository<Tag>>(getRepositoryToken(Tag));
        userRepository = moduleFixture.get<Repository<User>>(getRepositoryToken(User));

        // 创建测试用户并获取认证token
        const testUser = {
            username: 'testuser',
            email: 'test@example.com',
            password: 'testpassword123',
        };

        await request(app.getHttpServer())
            .post('/auth/register')
            .send(testUser);

        const loginResponse = await request(app.getHttpServer())
            .post('/auth/login')
            .send({
                username: testUser.username,
                password: testUser.password,
            });

        authToken = loginResponse.body.access_token;
    });

    afterAll(async () => {
        try {
            // 清理测试数据
            await bookRepository.query('DELETE FROM book_tags');
            await bookRepository.query('DELETE FROM book');
            await tagRepository.query('DELETE FROM tag');
            await userRepository.query('DELETE FROM "user"');
        } catch (error) {
            console.log('Error cleaning up test data:', error.message);
        }
        await app.close();
    });

    beforeEach(async () => {
        try {
            // 清理测试数据
            await bookRepository.query('DELETE FROM book_tags');
            await bookRepository.query('DELETE FROM book');
            await tagRepository.query('DELETE FROM tag');
        } catch (error) {
            // 忽略清理错误，因为表可能不存在
            console.log('Error cleaning up before test:', error.message);
        }
    });

    describe('/books (POST)', () => {
        it('should create a new book with tags', () => {
            const createBookDto = {
                hash: 'test-hash-123',
                title: 'Test Book',
                description: 'A test book description',
                tags: [
                    { key: 'author', value: 'John Doe' },
                    { key: 'genre', value: 'Fiction' },
                ],
            };

            return request(app.getHttpServer())
                .post('/books')
                .set('Authorization', `Bearer ${authToken}`)
                .send(createBookDto)
                .expect(201)
                .expect((res) => {
                    expect(res.body.hash).toBe(createBookDto.hash);
                    expect(res.body.title).toBe(createBookDto.title);
                    expect(res.body.description).toBe(createBookDto.description);
                    expect(res.body.tags).toHaveLength(2);
                });
        });

        it('should create a book without tags', () => {
            const createBookDto = {
                hash: 'simple-book-hash',
                title: 'Simple Book',
            };

            return request(app.getHttpServer())
                .post('/books')
                .set('Authorization', `Bearer ${authToken}`)
                .send(createBookDto)
                .expect(201)
                .expect((res) => {
                    expect(res.body.hash).toBe(createBookDto.hash);
                    expect(res.body.title).toBe(createBookDto.title);
                    expect(res.body.tags).toHaveLength(0);
                });
        });

        it('should return 409 if book hash already exists', async () => {
            const createBookDto = {
                hash: 'duplicate-hash',
                title: 'First Book',
            };

            // 创建第一本书
            await request(app.getHttpServer())
                .post('/books')
                .set('Authorization', `Bearer ${authToken}`)
                .send(createBookDto)
                .expect(201);

            // 尝试创建相同hash的书
            return request(app.getHttpServer())
                .post('/books')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ ...createBookDto, title: 'Second Book' })
                .expect(409);
        });

        it('should return 401 without authentication', () => {
            const createBookDto = {
                hash: 'unauthorized-book',
                title: 'Unauthorized Book',
            };

            return request(app.getHttpServer())
                .post('/books')
                .send(createBookDto)
                .expect(401);
        });
    });

    describe('/books (GET)', () => {
        beforeEach(async () => {
            // 创建测试数据
            const book1: Book = await bookRepository.save({
                hash: 'book1-hash',
                title: 'Book One',
                description: 'First book',
                tags: [],
            });

            const book2: Book = await bookRepository.save({
                hash: 'book2-hash',
                title: 'Book Two',
                description: 'Second book',
                tags: [],
            });

            const tag1: Tag = await tagRepository.save({
                key: 'author',
                value: 'Author One',
                shown: true,
            });

            const tag2: Tag = await tagRepository.save({
                key: 'genre',
                value: 'Fiction',
                shown: true,
            });

            book1.tags = [tag1];
            book2.tags = [tag1, tag2];

            await bookRepository.save(book1);
            await bookRepository.save(book2);
        });

        it('should return all books', () => {
            return request(app.getHttpServer())
                .get('/books')
                .expect(200)
                .expect((res) => {
                    expect(res.body).toHaveLength(2);
                    expect(res.body[0].title).toBeDefined();
                    expect(res.body[0].tags).toBeDefined();
                });
        });

        it('should filter books by tags', () => {
            return request(app.getHttpServer())
                .get('/books?tags=author')
                .expect(200)
                .expect((res) => {
                    expect(res.body.length).toBeGreaterThan(0);
                    res.body.forEach(book => {
                        expect(book.tags.some(tag => tag.key === 'author')).toBe(true);
                    });
                });
        });
    });

    describe('/books/:id (GET)', () => {
        let bookId: number;

        beforeEach(async () => {
            const book = await bookRepository.save({
                hash: 'single-book-hash',
                title: 'Single Book',
                description: 'A single book for testing',
                tags: [],
            });
            bookId = book.id;
        });

        it('should return a book by ID', () => {
            return request(app.getHttpServer())
                .get(`/books/${bookId}`)
                .expect(200)
                .expect((res) => {
                    expect(res.body.id).toBe(bookId);
                    expect(res.body.hash).toBe('single-book-hash');
                    expect(res.body.title).toBe('Single Book');
                });
        });

        it('should return 404 for non-existent book', () => {
            return request(app.getHttpServer())
                .get('/books/999999')
                .expect(404);
        });
    });

    describe('/books/hash/:hash (GET)', () => {
        beforeEach(async () => {
            await bookRepository.save({
                hash: 'findable-hash',
                title: 'Findable Book',
                description: 'A book to find by hash',
                tags: [],
            });
        });

        it('should return a book by hash', () => {
            return request(app.getHttpServer())
                .get('/books/hash/findable-hash')
                .expect(200)
                .expect((res) => {
                    expect(res.body.hash).toBe('findable-hash');
                    expect(res.body.title).toBe('Findable Book');
                });
        });

        it('should return 404 for non-existent hash', () => {
            return request(app.getHttpServer())
                .get('/books/hash/non-existent-hash')
                .expect(404);
        });
    });

    describe('/books/:id (PATCH)', () => {
        let bookId: number;

        beforeEach(async () => {
            const book = await bookRepository.save({
                hash: 'updatable-hash',
                title: 'Original Title',
                description: 'Original description',
                tags: [],
            });
            bookId = book.id;
        });

        it('should update a book', () => {
            const updateDto = {
                title: 'Updated Title',
                description: 'Updated description',
            };

            return request(app.getHttpServer())
                .patch(`/books/${bookId}`)
                .set('Authorization', `Bearer ${authToken}`)
                .send(updateDto)
                .expect(200)
                .expect((res) => {
                    expect(res.body.title).toBe('Updated Title');
                    expect(res.body.description).toBe('Updated description');
                });
        });

        it('should update book tags', () => {
            const updateDto = {
                tags: [
                    { key: 'author', value: 'New Author' },
                    { key: 'year', value: '2024' },
                ],
            };

            return request(app.getHttpServer())
                .patch(`/books/${bookId}`)
                .set('Authorization', `Bearer ${authToken}`)
                .send(updateDto)
                .expect(200)
                .expect((res) => {
                    expect(res.body.tags).toHaveLength(2);
                    expect(res.body.tags.some(tag => tag.key === 'author' && tag.value === 'New Author')).toBe(true);
                });
        });

        it('should return 401 without authentication', () => {
            return request(app.getHttpServer())
                .patch(`/books/${bookId}`)
                .send({ title: 'Unauthorized Update' })
                .expect(401);
        });
    });

    describe('/books/:id (DELETE)', () => {
        let bookId: number;

        beforeEach(async () => {
            const book = await bookRepository.save({
                hash: 'deletable-hash',
                title: 'Deletable Book',
                tags: [],
            });
            bookId = book.id;
        });

        it('should delete a book', async () => {
            await request(app.getHttpServer())
                .delete(`/books/${bookId}`)
                .set('Authorization', `Bearer ${authToken}`)
                .expect(200);

            // 验证书籍已被删除
            const deletedBook = await bookRepository.findOne({ where: { id: bookId } });
            expect(deletedBook).toBeNull();
        });

        it('should return 401 without authentication', () => {
            return request(app.getHttpServer())
                .delete(`/books/${bookId}`)
                .expect(401);
        });

        it('should return 404 for non-existent book', () => {
            return request(app.getHttpServer())
                .delete('/books/999999')
                .set('Authorization', `Bearer ${authToken}`)
                .expect(404);
        });
    });
});
