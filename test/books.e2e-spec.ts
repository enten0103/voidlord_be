import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Repository, DataSource } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { createTestModule } from './test-module.factory';
import { Book } from '../src/entities/book.entity';
import { Tag } from '../src/entities/tag.entity';
import { User } from '../src/entities/user.entity';
import { grantPermissions } from './permissions.seed';

describe('Books (e2e)', () => {
    let app: INestApplication;
    let bookRepository: Repository<Book>;
    let tagRepository: Repository<Tag>;
    let userRepository: Repository<User>;
    let authToken: string;
    let userId: number;

    beforeAll(async () => {
        const moduleFixture: TestingModule = await createTestModule();
        app = moduleFixture.createNestApplication();
        // 不绕过权限，真实测试 + 预置最小权限数据
        app.useGlobalPipes(
            new ValidationPipe({
                whitelist: true,
                transform: true,
            }),
        );
        await app.init();

        bookRepository = moduleFixture.get<Repository<Book>>(
            getRepositoryToken(Book),
        );
        tagRepository = moduleFixture.get<Repository<Tag>>(getRepositoryToken(Tag));
        userRepository = moduleFixture.get<Repository<User>>(
            getRepositoryToken(User),
        );

        // 创建测试用户并获取认证token
        const testUser = {
            username: 'testuser',
            email: 'test@example.com',
            password: 'testpassword123',
        };

        const reg = await request(app.getHttpServer()).post('/auth/register').send(testUser).expect(201);
        userId = reg.body.user.id;

        const loginResponse = await request(app.getHttpServer())
            .post('/auth/login')
            .send({
                username: testUser.username,
                password: testUser.password,
            });
        authToken = loginResponse.body.access_token;
        // 授予该测试用户书籍相关权限 (level1)
        const ds = moduleFixture.get(DataSource);
        await grantPermissions(ds, userId, {
            BOOK_CREATE: 1,
            BOOK_UPDATE: 1,
            BOOK_DELETE: 1,
        });
    });

    // (seed helper moved to shared permissions.seed.ts)

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
        try {
            const ds = app.get(DataSource);
            if (ds?.isInitialized) {
                await ds.destroy();
            }
        } catch (e) {
            // ignore
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
                    res.body.forEach((book) => {
                        expect(book.tags.some((tag) => tag.key === 'author')).toBe(true);
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
            return request(app.getHttpServer()).get('/books/999999').expect(404);
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
                    expect(
                        res.body.tags.some(
                            (tag) => tag.key === 'author' && tag.value === 'New Author',
                        ),
                    ).toBe(true);
                });
        });

        it('should return 401 without authentication', () => {
            return request(app.getHttpServer())
                .patch(`/books/${bookId}`)
                .send({ title: 'Unauthorized Update' })
                .expect(401);
        });
    });

    describe('/books/search (POST)', () => {
        let bookId1: number;
        let bookId2: number;
        let bookId3: number;

        beforeEach(async () => {
            // 清理数据 - 使用级联删除
            const books = await bookRepository.find();
            if (books.length > 0) {
                await bookRepository.remove(books);
            }

            const tags = await tagRepository.find();
            if (tags.length > 0) {
                await tagRepository.remove(tags);
            }

            // 创建测试数据
            const book1 = await request(app.getHttpServer())
                .post('/books')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    hash: 'search-book-1',
                    title: 'Science Fiction Book',
                    description: 'A sci-fi book',
                    tags: [
                        { key: 'author', value: 'Isaac Asimov' },
                        { key: 'genre', value: 'Science Fiction' },
                        { key: 'year', value: '1950' },
                    ],
                });
            bookId1 = book1.body.id;

            const book2 = await request(app.getHttpServer())
                .post('/books')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    hash: 'search-book-2',
                    title: 'Fantasy Novel',
                    description: 'A fantasy book',
                    tags: [
                        { key: 'author', value: 'J.R.R. Tolkien' },
                        { key: 'genre', value: 'Fantasy' },
                        { key: 'year', value: '1954' },
                    ],
                });
            bookId2 = book2.body.id;

            const book3 = await request(app.getHttpServer())
                .post('/books')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    hash: 'search-book-3',
                    title: 'Another Sci-Fi',
                    description: 'Another sci-fi book',
                    tags: [
                        { key: 'author', value: 'Isaac Asimov' },
                        { key: 'genre', value: 'Science Fiction' },
                        { key: 'year', value: '1951' },
                    ],
                });
            bookId3 = book3.body.id;
        });

        it('should search books by tag keys', async () => {
            const response = await request(app.getHttpServer())
                .post('/books/search')
                .send({
                    tagKeys: 'author,genre',
                })
                .expect(201);

            expect(response.body).toHaveLength(3);
            expect(response.body.map((book: any) => book.id).sort()).toEqual(
                [bookId1, bookId2, bookId3].sort(),
            );
        });

        it('should search books by specific tag key-value pair', async () => {
            const response = await request(app.getHttpServer())
                .post('/books/search')
                .send({
                    tagKey: 'author',
                    tagValue: 'Isaac Asimov',
                })
                .expect(201);

            expect(response.body).toHaveLength(2);
            expect(response.body.map((book: any) => book.id).sort()).toEqual(
                [bookId1, bookId3].sort(),
            );
        });

        it('should search books by multiple tag filters', async () => {
            const response = await request(app.getHttpServer())
                .post('/books/search')
                .send({
                    tagFilters: [
                        { key: 'genre', value: 'Fantasy' },
                        { key: 'year', value: '1950' },
                    ],
                })
                .expect(201);

            expect(response.body).toHaveLength(2);
            expect(response.body.map((book: any) => book.id).sort()).toEqual(
                [bookId1, bookId2].sort(),
            );
        });

        it('should return all books when no search criteria provided', async () => {
            const response = await request(app.getHttpServer())
                .post('/books/search')
                .send({})
                .expect(201);

            expect(response.body).toHaveLength(3);
        });

        it('should return empty array when no books match criteria', async () => {
            const response = await request(app.getHttpServer())
                .post('/books/search')
                .send({
                    tagKey: 'author',
                    tagValue: 'Nonexistent Author',
                })
                .expect(201);

            expect(response.body).toHaveLength(0);
        });
    });

    describe('/books/tags/:key/:value (GET)', () => {
        let bookId1: number;
        let bookId2: number;

        beforeEach(async () => {
            // 清理数据 - 使用级联删除
            const books = await bookRepository.find();
            if (books.length > 0) {
                await bookRepository.remove(books);
            }

            const tags = await tagRepository.find();
            if (tags.length > 0) {
                await tagRepository.remove(tags);
            }

            // 创建测试数据
            const book1 = await request(app.getHttpServer())
                .post('/books')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    hash: 'tag-search-1',
                    title: 'Book by Asimov',
                    tags: [
                        { key: 'author', value: 'Isaac Asimov' },
                        { key: 'genre', value: 'Science Fiction' },
                    ],
                });
            bookId1 = book1.body.id;

            const book2 = await request(app.getHttpServer())
                .post('/books')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    hash: 'tag-search-2',
                    title: 'Another Asimov Book',
                    tags: [
                        { key: 'author', value: 'Isaac Asimov' },
                        { key: 'genre', value: 'Science Fiction' },
                    ],
                });
            bookId2 = book2.body.id;
        });

        it('should return books with specific tag key-value pair', async () => {
            const response = await request(app.getHttpServer())
                .get('/books/tags/author/Isaac%20Asimov')
                .expect(200);

            expect(response.body).toHaveLength(2);
            expect(response.body.map((book: any) => book.id).sort()).toEqual(
                [bookId1, bookId2].sort(),
            );

            response.body.forEach((book: any) => {
                expect(
                    book.tags.some(
                        (tag: any) => tag.key === 'author' && tag.value === 'Isaac Asimov',
                    ),
                ).toBe(true);
            });
        });

        it('should return empty array when no books match the tag', async () => {
            const response = await request(app.getHttpServer())
                .get('/books/tags/author/Nonexistent%20Author')
                .expect(200);

            expect(response.body).toHaveLength(0);
        });

        it('should handle URL encoded values correctly', async () => {
            const response = await request(app.getHttpServer())
                .get('/books/tags/genre/Science%20Fiction')
                .expect(200);

            expect(response.body).toHaveLength(2);
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
            const deletedBook = await bookRepository.findOne({
                where: { id: bookId },
            });
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

    describe('/books/tag-id/:id (GET)', () => {
        let bookId1: number;
        let bookId2: number;
        let tagId: number;

        beforeEach(async () => {
            // 清理数据 - 使用级联删除
            const books = await bookRepository.find();
            if (books.length > 0) {
                await bookRepository.remove(books);
            }

            const tags = await tagRepository.find();
            if (tags.length > 0) {
                await tagRepository.remove(tags);
            }

            // 创建测试数据
            const book1 = await request(app.getHttpServer())
                .post('/books')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    hash: 'tagid-search-1',
                    title: 'Book with Author Tag',
                    tags: [
                        { key: 'author', value: 'Isaac Asimov' },
                        { key: 'genre', value: 'Science Fiction' },
                    ],
                });
            bookId1 = book1.body.id;

            const book2 = await request(app.getHttpServer())
                .post('/books')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    hash: 'tagid-search-2',
                    title: 'Another Book with Author Tag',
                    tags: [
                        { key: 'author', value: 'Isaac Asimov' },
                        { key: 'genre', value: 'Fantasy' },
                    ],
                });
            bookId2 = book2.body.id;

            // 获取author tag的ID
            const authorTag = await tagRepository.findOne({
                where: { key: 'author', value: 'Isaac Asimov' },
            });
            if (!authorTag) {
                throw new Error('Author tag not found');
            }
            tagId = authorTag.id;
        });

        it('should return books by tag ID', async () => {
            const response = await request(app.getHttpServer())
                .get(`/books/tag-id/${tagId}`)
                .expect(200);

            expect(response.body).toHaveLength(2);
            expect(response.body.map((book: any) => book.id).sort()).toEqual(
                [bookId1, bookId2].sort(),
            );
            expect(response.body[0]).toHaveProperty('tags');
        });

        it('should return empty array for non-existent tag ID', async () => {
            const response = await request(app.getHttpServer())
                .get('/books/tag-id/999999')
                .expect(200);

            expect(response.body).toHaveLength(0);
        });

        it('should return 400 for invalid tag ID', async () => {
            await request(app.getHttpServer())
                .get('/books/tag-id/invalid')
                .expect(400);
        });

        it('should return 400 for negative tag ID', async () => {
            await request(app.getHttpServer()).get('/books/tag-id/-1').expect(400);
        });
    });

    describe('/books/tag-ids/:ids (GET)', () => {
        let bookId1: number;
        let bookId2: number;
        let bookId3: number;
        let authorTagId: number;
        let genreTagId: number;

        beforeEach(async () => {
            // 清理数据 - 使用级联删除
            const books = await bookRepository.find();
            if (books.length > 0) {
                await bookRepository.remove(books);
            }

            const tags = await tagRepository.find();
            if (tags.length > 0) {
                await tagRepository.remove(tags);
            }

            // 创建测试数据
            const book1 = await request(app.getHttpServer())
                .post('/books')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    hash: 'tagids-search-1',
                    title: 'Sci-Fi Book',
                    tags: [
                        { key: 'author', value: 'Isaac Asimov' },
                        { key: 'genre', value: 'Science Fiction' },
                    ],
                });
            bookId1 = book1.body.id;

            const book2 = await request(app.getHttpServer())
                .post('/books')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    hash: 'tagids-search-2',
                    title: 'Fantasy Book',
                    tags: [
                        { key: 'author', value: 'J.R.R. Tolkien' },
                        { key: 'genre', value: 'Science Fiction' },
                    ],
                });
            bookId2 = book2.body.id;

            const book3 = await request(app.getHttpServer())
                .post('/books')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    hash: 'tagids-search-3',
                    title: 'Another Asimov Book',
                    tags: [
                        { key: 'author', value: 'Isaac Asimov' },
                        { key: 'genre', value: 'Fantasy' },
                    ],
                });
            bookId3 = book3.body.id;

            // 获取tag IDs
            const authorTag = await tagRepository.findOne({
                where: { key: 'author', value: 'Isaac Asimov' },
            });
            const genreTag = await tagRepository.findOne({
                where: { key: 'genre', value: 'Science Fiction' },
            });
            if (!authorTag || !genreTag) {
                throw new Error('Required tags not found');
            }
            authorTagId = authorTag.id;
            genreTagId = genreTag.id;
        });

        it('should return books by multiple tag IDs', async () => {
            const response = await request(app.getHttpServer())
                .get(`/books/tag-ids/${authorTagId},${genreTagId}`)
                .expect(200);

            expect(response.body).toHaveLength(1);
            expect(response.body[0].id).toBe(bookId1);
        });

        it('should filter out invalid tag IDs', async () => {
            const response = await request(app.getHttpServer())
                .get(`/books/tag-ids/${authorTagId},invalid,${genreTagId},0`)
                .expect(200);

            expect(response.body).toHaveLength(1);
            expect(response.body[0].id).toBe(bookId1);
        });

        it('should return 400 when no valid tag IDs provided', async () => {
            await request(app.getHttpServer())
                .get('/books/tag-ids/invalid,0,-1')
                .expect(400);
        });

        it('should return empty array for non-existent tag IDs', async () => {
            const response = await request(app.getHttpServer())
                .get('/books/tag-ids/999999,888888')
                .expect(200);

            expect(response.body).toHaveLength(0);
        });
    });

    describe('/books/search (POST) with tag IDs', () => {
        let bookId1: number;
        let bookId2: number;
        let authorTagId: number;
        let genreTagId: number;

        beforeEach(async () => {
            // 清理数据 - 使用级联删除
            const books = await bookRepository.find();
            if (books.length > 0) {
                await bookRepository.remove(books);
            }

            const tags = await tagRepository.find();
            if (tags.length > 0) {
                await tagRepository.remove(tags);
            }

            // 创建测试数据
            const book1 = await request(app.getHttpServer())
                .post('/books')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    hash: 'search-tagids-1',
                    title: 'Tagged Book 1',
                    tags: [
                        { key: 'author', value: 'Isaac Asimov' },
                        { key: 'genre', value: 'Science Fiction' },
                    ],
                });
            bookId1 = book1.body.id;

            const book2 = await request(app.getHttpServer())
                .post('/books')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    hash: 'search-tagids-2',
                    title: 'Tagged Book 2',
                    tags: [
                        { key: 'author', value: 'Isaac Asimov' },
                        { key: 'genre', value: 'Fantasy' },
                    ],
                });
            bookId2 = book2.body.id;

            // 获取tag IDs
            const authorTag = await tagRepository.findOne({
                where: { key: 'author', value: 'Isaac Asimov' },
            });
            const genreTag = await tagRepository.findOne({
                where: { key: 'genre', value: 'Science Fiction' },
            });
            if (!authorTag || !genreTag) {
                throw new Error('Required tags not found');
            }
            authorTagId = authorTag.id;
            genreTagId = genreTag.id;
        });

        it('should search books by single tag ID', async () => {
            const response = await request(app.getHttpServer())
                .post('/books/search')
                .send({
                    tagId: authorTagId,
                })
                .expect(201);

            expect(response.body).toHaveLength(2);
            expect(response.body.map((book: any) => book.id).sort()).toEqual(
                [bookId1, bookId2].sort(),
            );
        });

        it('should search books by multiple tag IDs', async () => {
            const response = await request(app.getHttpServer())
                .post('/books/search')
                .send({
                    tagIds: `${authorTagId},${genreTagId}`,
                })
                .expect(201);

            expect(response.body).toHaveLength(1);
            expect(response.body[0].id).toBe(bookId1);
        });

        it('should return empty array for non-existent tag ID', async () => {
            const response = await request(app.getHttpServer())
                .post('/books/search')
                .send({
                    tagId: 999999,
                })
                .expect(201);

            expect(response.body).toHaveLength(0);
        });
    });

    describe('/books/recommend/:id (GET)', () => {
        let baseId: number;
        let relatedIds: number[] = [];
        let unrelatedId: number;

        beforeEach(async () => {
            // 清空
            await bookRepository.query('DELETE FROM book_tags');
            await bookRepository.query('DELETE FROM book');
            await tagRepository.query('DELETE FROM tag');

            // 基础书籍（tags: a,b,c）
            const base = await request(app.getHttpServer())
                .post('/books')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    hash: 'rec-base',
                    title: 'Base',
                    tags: [
                        { key: 'topic', value: 'AI' },
                        { key: 'lang', value: 'TS' },
                        { key: 'level', value: 'Advanced' },
                    ],
                });
            baseId = base.body.id;

            // 共享2个标签 (topic:AI, lang:TS)
            const b1 = await request(app.getHttpServer())
                .post('/books')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    hash: 'rec-b1',
                    title: 'Rel 1',
                    tags: [
                        { key: 'topic', value: 'AI' },
                        { key: 'lang', value: 'TS' },
                    ],
                });
            // 共享1个标签 (topic:AI)
            const b2 = await request(app.getHttpServer())
                .post('/books')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    hash: 'rec-b2',
                    title: 'Rel 2',
                    tags: [
                        { key: 'topic', value: 'AI' },
                        { key: 'lang', value: 'Go' },
                    ],
                });
            // 共享3个标签 (topic:AI, lang:TS, level:Advanced) => 应排在最前
            const b3 = await request(app.getHttpServer())
                .post('/books')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    hash: 'rec-b3',
                    title: 'Rel 3',
                    tags: [
                        { key: 'topic', value: 'AI' },
                        { key: 'lang', value: 'TS' },
                        { key: 'level', value: 'Advanced' },
                    ],
                });
            // 无共享标签
            const u = await request(app.getHttpServer())
                .post('/books')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    hash: 'rec-u1',
                    title: 'Unrelated',
                    tags: [
                        { key: 'topic', value: 'Math' },
                    ],
                });
            relatedIds = [b1.body.id, b2.body.id, b3.body.id];
            unrelatedId = u.body.id;
        });

        it('should return ordered recommendations by overlap desc', async () => {
            const res = await request(app.getHttpServer())
                .get(`/books/recommend/${baseId}`)
                .expect(200);
            // 期望包含 b3 (3 overlap) -> b1 (2) -> b2 (1)
            const ids = res.body.map((b: any) => b.id);
            expect(ids).toEqual(expect.arrayContaining(relatedIds));
            // 检查顺序前3
            const indexB3 = ids.indexOf(relatedIds[2]); // b3
            const indexB1 = ids.indexOf(relatedIds[0]); // b1
            const indexB2 = ids.indexOf(relatedIds[1]); // b2
            expect(indexB3).toBeLessThan(indexB1);
            expect(indexB1).toBeLessThan(indexB2);
            // 不应包含无关书籍
            expect(ids).not.toContain(unrelatedId);
        });

        it('should respect limit parameter', async () => {
            const res = await request(app.getHttpServer())
                .get(`/books/recommend/${baseId}?limit=2`)
                .expect(200);
            expect(res.body).toHaveLength(2);
        });

        it('should return 400 for invalid id', async () => {
            await request(app.getHttpServer())
                .get('/books/recommend/invalid')
                .expect(400);
        });

        it('should return 404 for non-existent book id', async () => {
            await request(app.getHttpServer())
                .get('/books/recommend/999999')
                .expect(404);
        });

        it('should return empty array when base book has no tags', async () => {
            // 创建无标签书籍
            const empty = await request(app.getHttpServer())
                .post('/books')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ hash: 'rec-empty', title: 'Empty' });
            const res = await request(app.getHttpServer())
                .get(`/books/recommend/${empty.body.id}`)
                .expect(200);
            expect(res.body).toEqual([]);
        });
    });
});
