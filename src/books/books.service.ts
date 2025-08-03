import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Book } from '../entities/book.entity';
import { Tag } from '../entities/tag.entity';
import { CreateBookDto } from './dto/create-book.dto';
import { UpdateBookDto } from './dto/update-book.dto';

@Injectable()
export class BooksService {
    constructor(
        @InjectRepository(Book)
        private bookRepository: Repository<Book>,
        @InjectRepository(Tag)
        private tagRepository: Repository<Tag>,
    ) { }

    async create(createBookDto: CreateBookDto): Promise<Book> {
        // 检查hash是否已存在
        const existingBook = await this.bookRepository.findOne({
            where: { hash: createBookDto.hash }
        });

        if (existingBook) {
            throw new ConflictException('Book with this hash already exists');
        }

        // 处理标签
        let tags: Tag[] = [];
        if (createBookDto.tags && createBookDto.tags.length > 0) {
            tags = await this.processTags(createBookDto.tags);
        }

        // 创建书籍
        const book = this.bookRepository.create({
            hash: createBookDto.hash,
            title: createBookDto.title,
            description: createBookDto.description,
            tags,
        });

        return this.bookRepository.save(book);
    }

    async findAll(): Promise<Book[]> {
        return this.bookRepository.find({
            relations: ['tags'],
            order: { created_at: 'DESC' },
        });
    }

    async findOne(id: number): Promise<Book> {
        const book = await this.bookRepository.findOne({
            where: { id },
            relations: ['tags'],
        });

        if (!book) {
            throw new NotFoundException(`Book with ID ${id} not found`);
        }

        return book;
    }

    async findByHash(hash: string): Promise<Book> {
        const book = await this.bookRepository.findOne({
            where: { hash },
            relations: ['tags'],
        });

        if (!book) {
            throw new NotFoundException(`Book with hash ${hash} not found`);
        }

        return book;
    }

    async update(id: number, updateBookDto: UpdateBookDto): Promise<Book> {
        const book = await this.findOne(id);

        // 如果更新hash，检查是否冲突
        if (updateBookDto.hash && updateBookDto.hash !== book.hash) {
            const existingBook = await this.bookRepository.findOne({
                where: { hash: updateBookDto.hash }
            });

            if (existingBook) {
                throw new ConflictException('Book with this hash already exists');
            }
        }

        // 处理标签更新
        if (updateBookDto.tags) {
            const tags = await this.processTags(updateBookDto.tags);
            book.tags = tags;
        }

        // 更新其他字段
        if (updateBookDto.title) book.title = updateBookDto.title;
        if (updateBookDto.hash) book.hash = updateBookDto.hash;
        if (updateBookDto.description !== undefined) book.description = updateBookDto.description;

        return this.bookRepository.save(book);
    }

    async remove(id: number): Promise<void> {
        const book = await this.findOne(id);
        await this.bookRepository.remove(book);
    }

    async findByTags(tagKeys: string[]): Promise<Book[]> {
        return this.bookRepository
            .createQueryBuilder('book')
            .leftJoinAndSelect('book.tags', 'tag')
            .where('tag.key IN (:...tagKeys)', { tagKeys })
            .getMany();
    }

    private async processTags(tagDtos: any[]): Promise<Tag[]> {
        const tags: Tag[] = [];

        for (const tagDto of tagDtos) {
            // 查找是否已存在相同的key和value的标签
            let tag = await this.tagRepository.findOne({
                where: {
                    key: tagDto.key,
                    value: tagDto.value
                },
            });

            if (!tag) {
                // 创建新标签
                tag = this.tagRepository.create({
                    key: tagDto.key,
                    value: tagDto.value,
                    shown: tagDto.shown !== undefined ? tagDto.shown : true,
                });
                tag = await this.tagRepository.save(tag);
            }

            tags.push(tag);
        }

        return tags;
    }
}
