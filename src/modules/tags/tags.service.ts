import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tag } from '../../entities/tag.entity';

@Injectable()
export class TagsService {
  constructor(
    @InjectRepository(Tag)
    private readonly tagRepository: Repository<Tag>,
  ) {}

  /**
   * 根据传入的标签 DTO 列表，去重创建或查找对应的 Tag 实体。
   * 如果标签已存在（key + value 唯一），则复用；否则新建。
   */
  async processTags(
    tagDtos: { key: string; value: string; shown?: boolean }[],
  ): Promise<Tag[]> {
    const tags: Tag[] = [];

    for (const tagDto of tagDtos) {
      let tag = await this.tagRepository.findOne({
        where: {
          key: tagDto.key,
          value: tagDto.value,
        },
      });

      if (!tag) {
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
