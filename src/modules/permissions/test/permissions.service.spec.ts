import { Test, TestingModule } from '@nestjs/testing';
import { PermissionsService } from '../permissions.service';
import { DataSource } from 'typeorm';
import { Permission } from '../../../entities/permission.entity';
import { User } from '../../../entities/user.entity';
import { UserPermission } from '../../../entities/user-permission.entity';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { createRepoMock, RepoMock } from '../../../../test/repo-mocks';

// 使用共享 RepoMock 工具，得到强类型的仓库 mock

describe('PermissionsService', () => {
  let service: PermissionsService;
  let dataSource: DataSource;
  let permRepo: RepoMock<Permission>;
  let userRepo: RepoMock<User>;
  let userPermRepo: RepoMock<UserPermission>;

  beforeEach(async () => {
    permRepo = createRepoMock<Permission>();
    userRepo = createRepoMock<User>();
    userPermRepo = createRepoMock<UserPermission>();

    const mockDataSource = {
      getRepository: (entity: unknown) => {
        if (entity === Permission) return permRepo;
        if (entity === User) return userRepo;
        if (entity === UserPermission) return userPermRepo;
        throw new Error('Unknown repository request');
      },
    } as unknown as DataSource;
    dataSource = mockDataSource;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionsService,
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get(PermissionsService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('getUserPermissionLevel', () => {
    it('returns 0 when no record', async () => {
      type QbMock = {
        innerJoin: (...args: [string, string?]) => QbMock;
        where: (...args: [string, Record<string, unknown>?]) => QbMock;
        getOne: () => Promise<UserPermission | null>;
      };
      const qb: QbMock = {
        innerJoin: jest.fn(() => qb),
        where: jest.fn(() => qb),
        getOne: jest.fn(() => Promise.resolve(null)),
      };

      // 这里仅在测试中将轻量 qb 强转为 SelectQueryBuilder 以驱动 service 逻辑；加注释豁免 unsafe 分析

      // 使用最小接口适配 createQueryBuilder，避免直接 any；改用工厂返回轻量对象再强转

      const qbTyped =
        qb as unknown as import('typeorm').SelectQueryBuilder<UserPermission>;
      // 由于 SelectQueryBuilder 结构庞大，这里仅提供测试所需方法，强转是安全的（测试只调用这三个方法）

      userPermRepo.createQueryBuilder.mockImplementation(() => qbTyped);
      const level = await service.getUserPermissionLevel(1, 'USER_READ');
      expect(level).toBe(0);
    });

    it('returns record level', async () => {
      type QbMock = {
        innerJoin: (...args: [string, string?]) => QbMock;
        where: (...args: [string, Record<string, unknown>?]) => QbMock;
        getOne: () => Promise<{ level: number } | null>;
      };
      const qb: QbMock = {
        innerJoin: jest.fn(() => qb),
        where: jest.fn(() => qb),
        getOne: jest.fn(() => Promise.resolve({ level: 2 })),
      };

      userPermRepo.createQueryBuilder.mockReturnValue(
        qb as unknown as import('typeorm').SelectQueryBuilder<UserPermission>,
      );
      const level = await service.getUserPermissionLevel(1, 'USER_READ');
      expect(level).toBe(2);
    });
  });

  describe('grant', () => {
    const currentUserId = 10;

    it('throws Invalid level', async () => {
      await expect(
        service.grant(currentUserId, {
          userId: 1,
          permission: 'USER_READ',
          level: 99,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws when no grant ability (<2)', async () => {
      jest.spyOn(service, 'getUserPermissionLevel').mockResolvedValue(1);
      await expect(
        service.grant(currentUserId, {
          userId: 1,
          permission: 'USER_READ',
          level: 1,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('level2 cannot grant >1', async () => {
      jest.spyOn(service, 'getUserPermissionLevel').mockResolvedValue(2);
      await expect(
        service.grant(currentUserId, {
          userId: 1,
          permission: 'USER_READ',
          level: 2,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws if target user not found', async () => {
      jest.spyOn(service, 'getUserPermissionLevel').mockResolvedValue(3);
      userRepo.findOne.mockResolvedValue(null);
      await expect(
        service.grant(currentUserId, {
          userId: 1,
          permission: 'USER_READ',
          level: 1,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates new assignment', async () => {
      jest.spyOn(service, 'getUserPermissionLevel').mockResolvedValue(3);
      userRepo.findOne.mockResolvedValue({ id: 1 } as User);
      permRepo.findOne.mockResolvedValue({
        id: 2,
        name: 'USER_READ',
      } as Permission);
      userPermRepo.findOne.mockResolvedValue(null);
      userPermRepo.create.mockReturnValue({
        id: 5,
        level: 1,
      } as unknown as UserPermission);
      userPermRepo.save.mockResolvedValue({
        id: 5,
        level: 1,
      } as unknown as UserPermission);
      await expect(
        service.grant(currentUserId, {
          userId: 1,
          permission: 'USER_READ',
          level: 1,
        }),
      ).resolves.toEqual({ userId: 1, permission: 'USER_READ', level: 1 });
    });

    it('updates existing assignment with higher power', async () => {
      jest.spyOn(service, 'getUserPermissionLevel').mockResolvedValue(3);
      userRepo.findOne.mockResolvedValue({ id: 1 } as User);
      permRepo.findOne.mockResolvedValue({
        id: 2,
        name: 'USER_READ',
      } as Permission);
      userPermRepo.findOne.mockResolvedValue({
        id: 9,
        level: 1,
        grantedBy: null,
      } as unknown as UserPermission);
      userPermRepo.save.mockResolvedValue({
        id: 9,
        level: 1,
      } as unknown as UserPermission);
      await expect(
        service.grant(currentUserId, {
          userId: 1,
          permission: 'USER_READ',
          level: 1,
        }),
      ).resolves.toEqual({ userId: 1, permission: 'USER_READ', level: 1 });
      expect(userPermRepo.save).toHaveBeenCalled();
    });

    it('cannot upgrade equal/higher assignment', async () => {
      jest.spyOn(service, 'getUserPermissionLevel').mockResolvedValue(2);
      userRepo.findOne.mockResolvedValue({ id: 1 } as User);
      permRepo.findOne.mockResolvedValue({
        id: 2,
        name: 'USER_READ',
      } as Permission);
      userPermRepo.findOne.mockResolvedValue({
        id: 9,
        level: 2,
      } as unknown as UserPermission);
      await expect(
        service.grant(currentUserId, {
          userId: 1,
          permission: 'USER_READ',
          level: 1,
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('revoke', () => {
    const currentUserId = 10;

    it('no revoke ability (<2)', async () => {
      jest.spyOn(service, 'getUserPermissionLevel').mockResolvedValue(1);
      await expect(
        service.revoke(currentUserId, { userId: 1, permission: 'USER_READ' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('target user not found', async () => {
      jest.spyOn(service, 'getUserPermissionLevel').mockResolvedValue(3);
      userRepo.findOne.mockResolvedValue(null);
      await expect(
        service.revoke(currentUserId, { userId: 1, permission: 'USER_READ' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('permission not found', async () => {
      jest.spyOn(service, 'getUserPermissionLevel').mockResolvedValue(3);
      userRepo.findOne.mockResolvedValue({ id: 1 } as User);
      permRepo.findOne.mockResolvedValue(null);
      await expect(
        service.revoke(currentUserId, { userId: 1, permission: 'USER_READ' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('returns revoked:false if no assignment', async () => {
      jest.spyOn(service, 'getUserPermissionLevel').mockResolvedValue(3);
      userRepo.findOne.mockResolvedValue({ id: 1 } as User);
      permRepo.findOne.mockResolvedValue({
        id: 2,
        name: 'USER_READ',
      } as Permission);
      userPermRepo.findOne.mockResolvedValue(null);
      await expect(
        service.revoke(currentUserId, {
          userId: 1,
          permission: 'USER_READ',
        }),
      ).resolves.toEqual({ revoked: false });
    });

    it('level2 cannot revoke others grant', async () => {
      jest.spyOn(service, 'getUserPermissionLevel').mockResolvedValue(2);
      userRepo.findOne.mockResolvedValue({ id: 1 } as User);
      permRepo.findOne.mockResolvedValue({
        id: 2,
        name: 'USER_READ',
      } as Permission);
      userPermRepo.findOne.mockResolvedValue({
        id: 9,
        level: 1,
        grantedBy: { id: 999 } as User,
      } as unknown as UserPermission);
      await expect(
        service.revoke(currentUserId, { userId: 1, permission: 'USER_READ' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('revokes when allowed', async () => {
      jest.spyOn(service, 'getUserPermissionLevel').mockResolvedValue(3);
      userRepo.findOne.mockResolvedValue({ id: 1 } as User);
      permRepo.findOne.mockResolvedValue({
        id: 2,
        name: 'USER_READ',
      } as Permission);
      userPermRepo.findOne.mockResolvedValue({
        id: 9,
        level: 1,
        grantedBy: { id: 10 } as User,
      } as unknown as UserPermission);
      await expect(
        service.revoke(currentUserId, {
          userId: 1,
          permission: 'USER_READ',
        }),
      ).resolves.toEqual({ revoked: true });
      expect(userPermRepo.remove).toHaveBeenCalled();
    });
  });

  describe('listUserPermissions', () => {
    it('maps to array', async () => {
      userPermRepo.find.mockResolvedValue([
        {
          permission: { name: 'USER_READ' },
          level: 1,
        } as unknown as UserPermission,
        {
          permission: { name: 'USER_UPDATE' },
          level: 2,
        } as unknown as UserPermission,
      ]);
      await expect(service.listUserPermissions(1)).resolves.toEqual([
        { permission: 'USER_READ', level: 1 },
        { permission: 'USER_UPDATE', level: 2 },
      ]);
    });
  });
});
