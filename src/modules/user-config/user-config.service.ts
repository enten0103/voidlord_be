import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserConfig } from '../../entities/user-config.entity';
import { User } from '../../entities/user.entity';
import { UpdateUserConfigDto } from './dto/update-user-config.dto';
import { FilesService } from '../files/files.service';

@Injectable()
export class UserConfigService {
  constructor(
    @InjectRepository(UserConfig) private readonly repo: Repository<UserConfig>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly files: FilesService,
  ) {}

  async getOrCreateByUserId(userId: number): Promise<UserConfig> {
    let cfg = await this.repo.findOne({
      where: { user: { id: userId } },
      relations: ['user'],
    });
    if (!cfg) {
      const user = await this.users.findOne({ where: { id: userId } });
      if (!user) throw new NotFoundException('User not found');
      cfg = this.repo.create({
        user,
        locale: 'en',
        timezone: 'UTC',
        theme: 'light',
        email_notifications: true,
      });
      cfg = await this.repo.save(cfg);
    }
    return cfg;
  }

  async getPublicByUserId(userId: number) {
    const cfg = await this.repo.findOne({
      where: { user: { id: userId } },
      relations: ['user'],
    });
    if (!cfg)
      return { userId, avatar_url: null, display_name: null, bio: null };
    return {
      userId,
      avatar_url:
        cfg.avatar_url ??
        (cfg.avatar_key ? this.files.getPublicUrl(cfg.avatar_key) : null),
      display_name: cfg.display_name ?? null,
      bio: cfg.bio ?? null,
    };
  }

  async updateMy(
    userId: number,
    dto: UpdateUserConfigDto,
  ): Promise<UserConfig> {
    const cfg = await this.getOrCreateByUserId(userId);
    // If only key provided, precompute avatar_url via FilesService
    if (dto.avatar_key && !dto.avatar_url) {
      dto.avatar_url = this.files.getPublicUrl(dto.avatar_key);
    }
    Object.assign(cfg, dto);
    return this.repo.save(cfg);
  }
}
