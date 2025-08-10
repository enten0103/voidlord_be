import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { UsersService } from '../users.service';
import { CreateUserDto } from '../dto/create-user.dto';
import * as bcrypt from 'bcryptjs';
import { User } from '../../../entities/user.entity';

jest.mock('bcryptjs');

describe('UsersService', () => {
  let service: UsersService;
  let repository: Repository<User>;

  const mockRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getRepositoryToken(User),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    repository = module.get<Repository<User>>(getRepositoryToken(User));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a new user', async () => {
      const createUserDto: CreateUserDto = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'password123',
      };

      const hashedPassword = 'hashedPassword';
      const savedUser = {
        id: 1,
        ...createUserDto,
        password: hashedPassword,
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockRepository.findOne.mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue(hashedPassword);
      mockRepository.create.mockReturnValue(savedUser);
      mockRepository.save.mockResolvedValue(savedUser);

      const result = await service.create(createUserDto);

      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: [
          { username: createUserDto.username },
          { email: createUserDto.email },
        ],
      });
      expect(bcrypt.hash).toHaveBeenCalledWith(createUserDto.password, 10);
      expect(mockRepository.create).toHaveBeenCalledWith({
        username: createUserDto.username,
        email: createUserDto.email,
        password: hashedPassword,
      });
      expect(mockRepository.save).toHaveBeenCalledWith(savedUser);
      expect(result).toEqual(savedUser);
    });

    it('should throw ConflictException if user already exists', async () => {
      const createUserDto: CreateUserDto = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'password123',
      };

      mockRepository.findOne.mockResolvedValue({ id: 1, username: 'testuser' });

      await expect(service.create(createUserDto)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('findOne', () => {
    it('should return a user if found', async () => {
      const user = { id: 1, username: 'testuser', email: 'test@example.com' };
      mockRepository.findOne.mockResolvedValue(user);

      const result = await service.findOne(1);

      expect(mockRepository.findOne).toHaveBeenCalledWith({ where: { id: 1 } });
      expect(result).toEqual(user);
    });

    it('should throw NotFoundException if user not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne(1)).rejects.toThrow(NotFoundException);
    });
  });

  describe('validatePassword', () => {
    it('should return true for valid password', async () => {
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.validatePassword(
        'password',
        'hashedPassword',
      );

      expect(bcrypt.compare).toHaveBeenCalledWith('password', 'hashedPassword');
      expect(result).toBe(true);
    });

    it('should return false for invalid password', async () => {
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      const result = await service.validatePassword(
        'wrongpassword',
        'hashedPassword',
      );

      expect(bcrypt.compare).toHaveBeenCalledWith(
        'wrongpassword',
        'hashedPassword',
      );
      expect(result).toBe(false);
    });
  });
});
