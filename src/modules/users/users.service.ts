import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from '../../entities/user.entity';
import { MediaLibrary } from '../../entities/media-library.entity';
import { Repository } from 'typeorm';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(MediaLibrary)
    private readonly mediaLibraryRepo: Repository<MediaLibrary>,
  ) {}

  async create(createUserDto: CreateUserDto): Promise<User> {
    const { username, email, password } = createUserDto;

    // 检查用户名和邮箱是否已存在
    const existingUser = await this.userRepository.findOne({
      where: [{ username }, { email }],
    });

    if (existingUser) {
      throw new ConflictException('Username or email already exists');
    }

    // 加密密码
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const user = this.userRepository.create({
      username,
      email,
      password: hashedPassword,
    });

    const saved = await this.userRepository.save(user);

    // 创建系统“阅读记录”媒体库（替代原 reading-records 模块的记录集合）
    // 若后续需要扩展进度/统计，可在单独表或扩展 MediaLibraryItem 属性中实现。
    const systemReadingLibExists = await this.mediaLibraryRepo.findOne({
      where: { owner: { id: saved.id }, is_system: true, name: '系统阅读记录' },
    });
    if (!systemReadingLibExists) {
      const systemLib = this.mediaLibraryRepo.create({
        name: '系统阅读记录',
        description: '用户阅读书籍的系统集合（原 reading-records 模块已移除）',
        is_public: false,
        is_system: true,
        owner: { id: saved.id } as User,
        tags: [],
      });
      await this.mediaLibraryRepo.save(systemLib);
    }

    return saved;
  }

  async findAll(): Promise<User[]> {
    return this.userRepository.find();
  }

  async findOne(id: number): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    return user;
  }

  async findByUsername(username: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { username } });
  }

  async update(id: number, updateUserDto: UpdateUserDto): Promise<User> {
    const user = await this.findOne(id);

    if (updateUserDto.password) {
      const saltRounds = 10;
      updateUserDto.password = await bcrypt.hash(
        updateUserDto.password,
        saltRounds,
      );
    }

    Object.assign(user, updateUserDto);
    return this.userRepository.save(user);
  }

  async remove(id: number): Promise<void> {
    const user = await this.findOne(id);
    await this.userRepository.remove(user);
  }

  async validatePassword(
    plainPassword: string,
    hashedPassword: string,
  ): Promise<boolean> {
    return bcrypt.compare(plainPassword, hashedPassword);
  }
}
