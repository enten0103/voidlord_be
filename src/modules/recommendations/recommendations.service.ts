import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { RecommendationSection } from '../../entities/recommendation-section.entity';
import { MediaLibrary } from '../../entities/media-library.entity';
import { CreateSectionDto } from './dto/create-section.dto';
import { UpdateSectionDto } from './dto/update-section.dto';

@Injectable()
export class RecommendationsService {
  constructor(
    @InjectRepository(RecommendationSection)
    private sectionRepo: Repository<RecommendationSection>,
    @InjectRepository(MediaLibrary)
    private libraryRepo: Repository<MediaLibrary>,
  ) {}

  async createSection(dto: CreateSectionDto): Promise<RecommendationSection> {
    const exists = await this.sectionRepo.findOne({ where: { key: dto.key } });
    if (exists) throw new ConflictException('Section key already exists');
    // validate mediaLibraryId
    const lib = await this.libraryRepo.findOne({
      where: { id: dto.mediaLibraryId },
    });
    if (!lib) throw new NotFoundException('Library not found');
    if (!lib.is_public) throw new ConflictException('Library must be public');
    const section = this.sectionRepo.create({
      key: dto.key,
      title: dto.title,
      description: dto.description,
      sort_order: dto.sort_order ?? 0,
      active: dto.active ?? true,
      library: lib,
    });
    return this.sectionRepo.save(section);
  }

  async listSections(
    includeInactive = false,
  ): Promise<RecommendationSection[]> {
    return this.sectionRepo.find({
      where: includeInactive ? {} : { active: true },
      order: { sort_order: 'ASC', id: 'ASC' },
      relations: ['library'],
    });
  }

  async getSection(id: number): Promise<RecommendationSection> {
    const section = await this.sectionRepo.findOne({
      where: { id },
      relations: ['library'],
    });
    if (!section) {
      throw new NotFoundException('Section not found');
    }
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
    if (dto.mediaLibraryId !== undefined) {
      const lib = await this.libraryRepo.findOne({
        where: { id: dto.mediaLibraryId },
      });
      if (!lib) throw new NotFoundException('Library not found');
      if (!lib.is_public) throw new ConflictException('Library must be public');
      section.library = lib;
    }
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

  // Simplified model: Section directly references one public MediaLibrary.
}
