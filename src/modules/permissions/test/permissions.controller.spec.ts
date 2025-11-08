import { Test, TestingModule } from '@nestjs/testing';
import { PermissionsController } from '../permissions.controller';
import { PermissionsService } from '../permissions.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../../auth/guards/permission.guard';
import { GrantPermissionDto } from '../dto/grant-permission.dto';
import { RevokePermissionDto } from '../dto/revoke-permission.dto';

interface GrantArgs {
  userId: number;
  permission: string;
  level: number;
}
interface RevokeArgs {
  userId: number;
  permission: string;
}
interface PermissionsServiceMockShape {
  grant: jest.Mock<
    Promise<{ userId: number; permission: string; level: number }>,
    [number, GrantArgs]
  >;
  revoke: jest.Mock<Promise<{ revoked: boolean }>, [number, RevokeArgs]>;
  listUserPermissions: jest.Mock<
    Promise<Array<{ permission: string; level: number }>>,
    [number]
  >;
}
const mockPermissionsService: PermissionsServiceMockShape = {
  grant: jest.fn<
    Promise<{ userId: number; permission: string; level: number }>,
    [number, GrantArgs]
  >(),
  revoke: jest.fn<Promise<{ revoked: boolean }>, [number, RevokeArgs]>(),
  listUserPermissions: jest.fn<
    Promise<Array<{ permission: string; level: number }>>,
    [number]
  >(),
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
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<PermissionsController>(PermissionsController);
  });

  afterEach(() => jest.clearAllMocks());

  it('should grant permission', async () => {
    mockPermissionsService.grant.mockResolvedValue({
      userId: 1,
      permission: 'USER_READ',
      level: 1,
    });
    const req = {
      user: { userId: 10, username: 'x' },
    } as unknown as import('../../../types/request.interface').JwtRequestWithUser;
    const dto: GrantPermissionDto = {
      userId: 1,
      permission: 'USER_READ',
      level: 1,
    };
    await expect(controller.grant(req, dto)).resolves.toEqual({
      userId: 1,
      permission: 'USER_READ',
      level: 1,
    });
    expect(mockPermissionsService.grant).toHaveBeenCalledWith(10, dto);
  });

  it('should revoke permission', async () => {
    mockPermissionsService.revoke.mockResolvedValue({ revoked: true });
    const req = {
      user: { userId: 10, username: 'y' },
    } as unknown as import('../../../types/request.interface').JwtRequestWithUser;
    const dto: RevokePermissionDto = { userId: 1, permission: 'USER_READ' };
    await expect(controller.revoke(req, dto)).resolves.toEqual({
      revoked: true,
    });
    expect(mockPermissionsService.revoke).toHaveBeenCalledWith(10, dto);
  });

  it('should list user permissions', async () => {
    mockPermissionsService.listUserPermissions.mockResolvedValue([
      { permission: 'USER_READ', level: 1 },
    ]);
    const res = await controller.list('1');
    expect(res).toEqual([{ permission: 'USER_READ', level: 1 }]);
    expect(mockPermissionsService.listUserPermissions).toHaveBeenCalledWith(1);
  });
});
