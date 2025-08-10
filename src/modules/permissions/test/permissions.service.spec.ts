import { Test, TestingModule } from '@nestjs/testing';
import { PermissionsService } from '../permissions.service';
import { DataSource, Repository } from 'typeorm';
import { Permission } from '../../../entities/permission.entity';
import { User } from '../../../entities/user.entity';
import { UserPermission } from '../../../entities/user-permission.entity';
import { BadRequestException, ForbiddenException } from '@nestjs/common';

// Helper to create a mocked repository with only used methods
function createRepoMock() {
    const base: any = {
        findOne: jest.fn(),
        create: jest.fn(),
        save: jest.fn(),
        remove: jest.fn(),
        find: jest.fn(),
        createQueryBuilder: jest.fn(),
    };
    return base as any;
}

describe('PermissionsService', () => {
    let service: PermissionsService;
    let dataSource: any;
    let permRepo: jest.Mocked<Repository<Permission>>;
    let userRepo: jest.Mocked<Repository<User>>;
    let userPermRepo: jest.Mocked<Repository<UserPermission>>;

    beforeEach(async () => {
        permRepo = createRepoMock();
        userRepo = createRepoMock();
        userPermRepo = createRepoMock();

        dataSource = {
            getRepository: (entity: any) => {
                if (entity === Permission) return permRepo;
                if (entity === User) return userRepo;
                if (entity === UserPermission) return userPermRepo;
                throw new Error('Unknown repository request');
            },
        } as unknown as DataSource;

        const module: TestingModule = await Test.createTestingModule({
            providers: [PermissionsService, { provide: DataSource, useValue: dataSource }],
        }).compile();

        service = module.get(PermissionsService);
    });

    afterEach(() => jest.clearAllMocks());

    describe('getUserPermissionLevel', () => {
        it('returns 0 when no record', async () => {
            const qb: any = { innerJoin: () => qb, where: () => qb, getOne: jest.fn().mockResolvedValue(null) };
            userPermRepo.createQueryBuilder.mockReturnValue(qb);
            const level = await service.getUserPermissionLevel(1, 'USER_READ');
            expect(level).toBe(0);
        });

        it('returns record level', async () => {
            const qb: any = { innerJoin: () => qb, where: () => qb, getOne: jest.fn().mockResolvedValue({ level: 2 }) };
            userPermRepo.createQueryBuilder.mockReturnValue(qb);
            const level = await service.getUserPermissionLevel(1, 'USER_READ');
            expect(level).toBe(2);
        });
    });

    describe('grant', () => {
        const currentUserId = 10;

        it('throws Invalid level', async () => {
            await expect(service.grant(currentUserId, { userId: 1, permission: 'USER_READ', level: 99 } as any)).rejects.toThrow(BadRequestException);
        });

        it('throws when no grant ability (<2)', async () => {
            jest.spyOn(service, 'getUserPermissionLevel').mockResolvedValue(1);
            await expect(service.grant(currentUserId, { userId: 1, permission: 'USER_READ', level: 1 })).rejects.toThrow(ForbiddenException);
        });

        it('level2 cannot grant >1', async () => {
            jest.spyOn(service, 'getUserPermissionLevel').mockResolvedValue(2);
            await expect(service.grant(currentUserId, { userId: 1, permission: 'USER_READ', level: 2 })).rejects.toThrow(ForbiddenException);
        });

        it('throws if target user not found', async () => {
            jest.spyOn(service, 'getUserPermissionLevel').mockResolvedValue(3);
            userRepo.findOne.mockResolvedValue(null);
            await expect(service.grant(currentUserId, { userId: 1, permission: 'USER_READ', level: 1 })).rejects.toThrow(BadRequestException);
        });

        it('creates new assignment', async () => {
            jest.spyOn(service, 'getUserPermissionLevel').mockResolvedValue(3);
            userRepo.findOne.mockResolvedValue({ id: 1 } as any);
            permRepo.findOne.mockResolvedValue({ id: 2, name: 'USER_READ' } as any);
            userPermRepo.findOne.mockResolvedValue(null);
            userPermRepo.create.mockReturnValue({ id: 5, level: 1 } as any);
            userPermRepo.save.mockResolvedValue({ id: 5, level: 1 } as any);
            const res = await service.grant(currentUserId, { userId: 1, permission: 'USER_READ', level: 1 });
            expect(res).toEqual({ userId: 1, permission: 'USER_READ', level: 1 });
        });

        it('updates existing assignment with higher power', async () => {
            jest.spyOn(service, 'getUserPermissionLevel').mockResolvedValue(3);
            userRepo.findOne.mockResolvedValue({ id: 1 } as any);
            permRepo.findOne.mockResolvedValue({ id: 2, name: 'USER_READ' } as any);
            userPermRepo.findOne.mockResolvedValue({ id: 9, level: 1, grantedBy: null } as any);
            userPermRepo.save.mockResolvedValue({ id: 9, level: 1 } as any);
            const res = await service.grant(currentUserId, { userId: 1, permission: 'USER_READ', level: 1 });
            expect(userPermRepo.save).toHaveBeenCalled();
            expect(res).toEqual({ userId: 1, permission: 'USER_READ', level: 1 });
        });

        it('cannot upgrade equal/higher assignment', async () => {
            jest.spyOn(service, 'getUserPermissionLevel').mockResolvedValue(2);
            userRepo.findOne.mockResolvedValue({ id: 1 } as any);
            permRepo.findOne.mockResolvedValue({ id: 2, name: 'USER_READ' } as any);
            userPermRepo.findOne.mockResolvedValue({ id: 9, level: 2 } as any);
            await expect(service.grant(currentUserId, { userId: 1, permission: 'USER_READ', level: 1 })).rejects.toThrow(ForbiddenException);
        });
    });

    describe('revoke', () => {
        const currentUserId = 10;

        it('no revoke ability (<2)', async () => {
            jest.spyOn(service, 'getUserPermissionLevel').mockResolvedValue(1);
            await expect(service.revoke(currentUserId, { userId: 1, permission: 'USER_READ' })).rejects.toThrow(ForbiddenException);
        });

        it('target user not found', async () => {
            jest.spyOn(service, 'getUserPermissionLevel').mockResolvedValue(3);
            userRepo.findOne.mockResolvedValue(null);
            await expect(service.revoke(currentUserId, { userId: 1, permission: 'USER_READ' })).rejects.toThrow(BadRequestException);
        });

        it('permission not found', async () => {
            jest.spyOn(service, 'getUserPermissionLevel').mockResolvedValue(3);
            userRepo.findOne.mockResolvedValue({ id: 1 } as any);
            permRepo.findOne.mockResolvedValue(null);
            await expect(service.revoke(currentUserId, { userId: 1, permission: 'USER_READ' })).rejects.toThrow(BadRequestException);
        });

        it('returns revoked:false if no assignment', async () => {
            jest.spyOn(service, 'getUserPermissionLevel').mockResolvedValue(3);
            userRepo.findOne.mockResolvedValue({ id: 1 } as any);
            permRepo.findOne.mockResolvedValue({ id: 2, name: 'USER_READ' } as any);
            userPermRepo.findOne.mockResolvedValue(null);
            const res = await service.revoke(currentUserId, { userId: 1, permission: 'USER_READ' });
            expect(res).toEqual({ revoked: false });
        });

        it('level2 cannot revoke others grant', async () => {
            jest.spyOn(service, 'getUserPermissionLevel').mockResolvedValue(2);
            userRepo.findOne.mockResolvedValue({ id: 1 } as any);
            permRepo.findOne.mockResolvedValue({ id: 2, name: 'USER_READ' } as any);
            userPermRepo.findOne.mockResolvedValue({ id: 9, level: 1, grantedBy: { id: 999 } as any } as any);
            await expect(service.revoke(currentUserId, { userId: 1, permission: 'USER_READ' })).rejects.toThrow(ForbiddenException);
        });

        it('revokes when allowed', async () => {
            jest.spyOn(service, 'getUserPermissionLevel').mockResolvedValue(3);
            userRepo.findOne.mockResolvedValue({ id: 1 } as any);
            permRepo.findOne.mockResolvedValue({ id: 2, name: 'USER_READ' } as any);
            userPermRepo.findOne.mockResolvedValue({ id: 9, level: 1, grantedBy: { id: 10 } as any } as any);
            const res = await service.revoke(currentUserId, { userId: 1, permission: 'USER_READ' });
            expect(userPermRepo.remove).toHaveBeenCalled();
            expect(res).toEqual({ revoked: true });
        });
    });

    describe('listUserPermissions', () => {
        it('maps to array', async () => {
            userPermRepo.find.mockResolvedValue([
                { permission: { name: 'USER_READ' }, level: 1 } as any,
                { permission: { name: 'USER_UPDATE' }, level: 2 } as any,
            ]);
            const res = await service.listUserPermissions(1);
            expect(res).toEqual([
                { permission: 'USER_READ', level: 1 },
                { permission: 'USER_UPDATE', level: 2 },
            ]);
        });
    });
});
