import { Test, TestingModule } from '@nestjs/testing';
import { PermissionsController } from '../permissions.controller';
import { PermissionsService } from '../permissions.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../../auth/guards/permission.guard';

const mockPermissionsService = {
    grant: jest.fn(),
    revoke: jest.fn(),
    listUserPermissions: jest.fn(),
};

describe('PermissionsController', () => {
    let controller: PermissionsController;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [PermissionsController],
            providers: [
                { provide: PermissionsService, useValue: mockPermissionsService },
            ],
        })
            .overrideGuard(JwtAuthGuard).useValue({ canActivate: () => true })
            .overrideGuard(PermissionGuard).useValue({ canActivate: () => true })
            .compile();

        controller = module.get<PermissionsController>(PermissionsController);
    });

    afterEach(() => jest.clearAllMocks());

    it('should grant permission', async () => {
        mockPermissionsService.grant.mockResolvedValue({ userId: 1, permission: 'USER_READ', level: 1 });
        const req = { user: { userId: 10 } } as any;
        const res = await controller.grant(req, { userId: 1, permission: 'USER_READ', level: 1 } as any);
        expect(res).toEqual({ userId: 1, permission: 'USER_READ', level: 1 });
        expect(mockPermissionsService.grant).toHaveBeenCalledWith(10, { userId: 1, permission: 'USER_READ', level: 1 });
    });

    it('should revoke permission', async () => {
        mockPermissionsService.revoke.mockResolvedValue({ revoked: true });
        const req = { user: { userId: 10 } } as any;
        const res = await controller.revoke(req, { userId: 1, permission: 'USER_READ' } as any);
        expect(res).toEqual({ revoked: true });
        expect(mockPermissionsService.revoke).toHaveBeenCalledWith(10, { userId: 1, permission: 'USER_READ' });
    });

    it('should list user permissions', async () => {
        mockPermissionsService.listUserPermissions.mockResolvedValue([{ permission: 'USER_READ', level: 1 }]);
        const res = await controller.list('1');
        expect(res).toEqual([{ permission: 'USER_READ', level: 1 }]);
        expect(mockPermissionsService.listUserPermissions).toHaveBeenCalledWith(1);
    });
});
