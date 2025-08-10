import {
    Injectable,
    NotFoundException
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Book } from '../entities/book.entity';
import { Tag } from '../entities/tag.entity';

@Injectable()
export class BooksService {
    constructor(
        @InjectRepository(Book)
        private bookRepository: Repository<Book>,
        @InjectRepository(Tag)
        private tagRepository: Repository<Tag>,
    ) { }

    // ...existing methods...

    async recommendByBook(bookId: number, limit = 5): Promise<Book[]> {
        if (limit <= 0) return [];
        if (limit > 50) limit = 50;
        const base = await this.bookRepository.findOne({
            where: { id: bookId },
            relations: ['tags'],
        });
        if (!base) throw new NotFoundException('Book not found');
        if (!base.tags || base.tags.length === 0) return [];
        const tagIds = base.tags.map((t) => t.id);

        // 先取候选书籍及其重叠标签数量
        const raw = await this.bookRepository
            .createQueryBuilder('book')
            .innerJoin('book.tags', 'tag')
            .where('tag.id IN (:...tagIds)', { tagIds })
            .andWhere('book.id <> :bookId', { bookId })
            .select(['book.id as id', 'COUNT(DISTINCT tag.id) as overlap'])
            .groupBy('book.id')
            .orderBy('overlap', 'DESC')
            .addOrderBy('book.created_at', 'DESC')
            .limit(limit)
            .getRawMany();

        if (raw.length === 0) return [];
        const ids = raw.map((r) => r.id);
        const books = await this.bookRepository.find({
            where: ids.map((id) => ({ id })),
            relations: ['tags'],
        });
        // 保持排序
        const map = new Map(books.map((b) => [b.id, b]));
        return ids.map((id) => map.get(id)).filter(Boolean) as Book[];
    }
}
