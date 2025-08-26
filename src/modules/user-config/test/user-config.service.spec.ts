import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserConfigService } from '../user-config.service';
import { UserConfig } from '../../../entities/user-config.entity';
import { User } from '../../../entities/user.entity';
import { FilesService } from '../../files/files.service';

describe('UserConfigService', () => {
    let service: UserConfigService;
    let configRepo: jest.Mocked<Repository<UserConfig>>;
    let userRepo: jest.Mocked<Repository<User>>;
    let files: jest.Mocked<FilesService>;

    const mockConfigRepo = {
        findOne: jest.fn(),
        create: jest.fn(),
        save: jest.fn(),
    } as any;

    const mockUserRepo = {
        findOne: jest.fn(),
    } as any;

    const mockFiles: Partial<FilesService> = {
        getPublicUrl: jest.fn((key: string) => `http://cdn/bucket/${key}`),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                UserConfigService,
                { provide: getRepositoryToken(UserConfig), useValue: mockConfigRepo },
                { provide: getRepositoryToken(User), useValue: mockUserRepo },
                { provide: FilesService, useValue: mockFiles },
            ],
        }).compile();

        service = module.get(UserConfigService);
        configRepo = module.get(getRepositoryToken(UserConfig));
        userRepo = module.get(getRepositoryToken(User));
        files = module.get(FilesService) as any;
        jest.clearAllMocks();
    });

    it('should create default config when missing', async () => {
        configRepo.findOne.mockResolvedValueOnce(null);
        userRepo.findOne.mockResolvedValueOnce({ id: 1 } as User);
        configRepo.create.mockReturnValueOnce({ user: { id: 1 }, locale: 'en' } as any);
        configRepo.save.mockResolvedValueOnce({ id: 10, user: { id: 1 }, locale: 'en' } as any);

        const cfg = await service.getOrCreateByUserId(1);
        expect(cfg.id).toBe(10);
        expect(configRepo.create).toHaveBeenCalled();
        expect(configRepo.save).toHaveBeenCalled();
    });

    it('should return public profile with derived avatar', async () => {
        configRepo.findOne.mockResolvedValueOnce({
            user: { id: 1 },
            avatar_key: 'a/b.png',
            avatar_url: null,
            display_name: 'Alice',
            bio: 'hi',
        } as any);

        const res = await service.getPublicByUserId(1);
        expect(res.avatar_url).toContain('a/b.png');
        expect(files.getPublicUrl).toHaveBeenCalled();
    });

    it('should update avatar_url from key when missing', async () => {
        jest.spyOn(service, 'getOrCreateByUserId').mockResolvedValueOnce({ id: 5 } as any);
        const saved = { id: 5, avatar_key: 'k.png', avatar_url: 'http://cdn/bucket/k.png' } as any;
        configRepo.save.mockResolvedValueOnce(saved);

        const res = await service.updateMy(1, { avatar_key: 'k.png' });
        expect(res).toEqual(saved);
        expect(files.getPublicUrl).toHaveBeenCalledWith('k.png');
    });
});
