import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { RecommendationSection } from '../../entities/recommendation-section.entity';
import { RecommendationItem } from '../../entities/recommendation-item.entity';
import { Book } from '../../entities/book.entity';
import { CreateSectionDto } from './dto/create-section.dto';
import { UpdateSectionDto } from './dto/update-section.dto';
import { AddItemDto } from './dto/add-item.dto';
import { ReorderItemsDto } from './dto/reorder-items.dto';

@Injectable()
export class RecommendationsService {
  constructor(
    @InjectRepository(RecommendationSection)
    private sectionRepo: Repository<RecommendationSection>,
    @InjectRepository(RecommendationItem)
    private itemRepo: Repository<RecommendationItem>,
    @InjectRepository(Book)
    private bookRepo: Repository<Book>,
  ) {}

  async createSection(dto: CreateSectionDto): Promise<RecommendationSection> {
    const exists = await this.sectionRepo.findOne({ where: { key: dto.key } });
    if (exists) throw new ConflictException('Section key already exists');
    const section = this.sectionRepo.create({ ...dto });
    return this.sectionRepo.save(section);
  }

  async listSections(
    includeInactive = false,
  ): Promise<RecommendationSection[]> {
    return this.sectionRepo.find({
      where: includeInactive ? {} : { active: true },
      order: { sort_order: 'ASC', id: 'ASC' },
      relations: ['items', 'items.book', 'items.book.tags'],
    });
  }

  async getSection(id: number): Promise<RecommendationSection> {
    const section = await this.sectionRepo.findOne({
      where: { id },
      relations: ['items', 'items.book', 'items.book.tags'],
    });
    if (!section) throw new NotFoundException('Section not found');
    section.items.sort((a, b) => a.position - b.position || a.id - b.id);
    return section;
  }

  async updateSection(
    id: number,
    dto: UpdateSectionDto,
  ): Promise<RecommendationSection> {
    const section = await this.getSection(id);
    if (dto.key && dto.key !== section.key) {
      const dup = await this.sectionRepo.findOne({ where: { key: dto.key } });
      if (dup) throw new ConflictException('Section key already exists');
      section.key = dto.key;
    }
    if (dto.title !== undefined) section.title = dto.title;
    if (dto.description !== undefined) section.description = dto.description;
    if (dto.sort_order !== undefined) section.sort_order = dto.sort_order;
    if (dto.active !== undefined) section.active = dto.active;
    return this.sectionRepo.save(section);
  }

  async deleteSection(id: number): Promise<void> {
    const section = await this.sectionRepo.findOne({ where: { id } });
    if (!section) return; // idempotent
    await this.sectionRepo.remove(section);
  }

  async batchReorder(sectionOrder: number[]): Promise<void> {
    const sections = await this.sectionRepo.findBy({ id: In(sectionOrder) });
    const map = new Map(sections.map((s) => [s.id, s]));
    let order = 0;
    for (const id of sectionOrder) {
      const s = map.get(id);
      if (s) {
        s.sort_order = order++;
      }
    }
    await this.sectionRepo.save([...map.values()]);
  }

  async addItem(
    sectionId: number,
    dto: AddItemDto,
  ): Promise<RecommendationItem> {
    const section = await this.sectionRepo.findOne({
      where: { id: sectionId },
      relations: ['items'],
    });
    if (!section) throw new NotFoundException('Section not found');
    const book = await this.bookRepo.findOne({
      where: { id: dto.bookId },
      relations: ['tags'],
    });
    if (!book) throw new NotFoundException('Book not found');

    const dup = await this.itemRepo.findOne({
      where: { section: { id: sectionId }, book: { id: dto.bookId } } as any,
    });
    if (dup) throw new ConflictException('Book already in section');

    let position: number;
    if (dto.position !== undefined) {
      position = dto.position;
    } else {
      position =
        section.items.length === 0
          ? 0
          : Math.max(...section.items.map((i) => i.position)) + 1;
    }

    const item = this.itemRepo.create({
      section,
      book,
      position,
      note: dto.note,
    });
    return this.itemRepo.save(item);
  }

  async removeItem(sectionId: number, itemId: number): Promise<void> {
    const item = await this.itemRepo.findOne({
      where: { id: itemId },
      relations: ['section'],
    });
    if (!item || item.section.id !== sectionId)
      throw new NotFoundException('Item not found in section');
    await this.itemRepo.remove(item);
  }

  async reorderItems(sectionId: number, dto: ReorderItemsDto): Promise<void> {
    const items = await this.itemRepo.find({
      where: { section: { id: sectionId } } as any,
    });
    const map = new Map(items.map((i) => [i.id, i]));
    let pos = 0;
    for (const id of dto.itemIds) {
      const item = map.get(id);
      if (item) item.position = pos++;
      else throw new BadRequestException(`Item ${id} not found in section`);
    }
    await this.itemRepo.save([...map.values()]);
  }

  async publicRecommendations(): Promise<RecommendationSection[]> {
    const sections = await this.sectionRepo.find({
      where: { active: true },
      order: { sort_order: 'ASC', id: 'ASC' },
      relations: ['items', 'items.book', 'items.book.tags'],
    });
    for (const s of sections) {
      s.items.sort((a, b) => a.position - b.position || a.id - b.id);
    }
    return sections;
  }
}
