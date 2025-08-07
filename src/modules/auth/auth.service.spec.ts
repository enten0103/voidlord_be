import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { UsersService } from '../../users/users.service';
import { User } from '../../entities/user.entity';

describe('AuthService', () => {
    let service: AuthService;
    let usersService: UsersService;
    let jwtService: JwtService;

    const mockUsersService = {
        findByUsername: jest.fn(),
        validatePassword: jest.fn(),
    };

    const mockJwtService = {
        sign: jest.fn(),
    };

    const mockUser: User = {
        id: 1,
        username: 'testuser',
        email: 'test@example.com',
        password: 'hashedPassword',
        created_at: new Date(),
        updated_at: new Date(),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AuthService,
                {
                    provide: UsersService,
                    useValue: mockUsersService,
                },
                {
                    provide: JwtService,
                    useValue: mockJwtService,
                },
            ],
        }).compile();

        service = module.get<AuthService>(AuthService);
        usersService = module.get<UsersService>(UsersService);
        jwtService = module.get<JwtService>(JwtService);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('validateUser', () => {
        it('should return user data without password if validation succeeds', async () => {
            const { password, ...userWithoutPassword } = mockUser;

            mockUsersService.findByUsername.mockResolvedValue(mockUser);
            mockUsersService.validatePassword.mockResolvedValue(true);

            const result = await service.validateUser('testuser', 'password123');

            expect(usersService.findByUsername).toHaveBeenCalledWith('testuser');
            expect(usersService.validatePassword).toHaveBeenCalledWith('password123', mockUser.password);
            expect(result).toEqual(userWithoutPassword);
        });

        it('should return null if user not found', async () => {
            mockUsersService.findByUsername.mockResolvedValue(null);

            const result = await service.validateUser('testuser', 'password123');

            expect(usersService.findByUsername).toHaveBeenCalledWith('testuser');
            expect(result).toBeNull();
        });

        it('should return null if password is invalid', async () => {
            mockUsersService.findByUsername.mockResolvedValue(mockUser);
            mockUsersService.validatePassword.mockResolvedValue(false);

            const result = await service.validateUser('testuser', 'wrongpassword');

            expect(usersService.findByUsername).toHaveBeenCalledWith('testuser');
            expect(usersService.validatePassword).toHaveBeenCalledWith('wrongpassword', mockUser.password);
            expect(result).toBeNull();
        });
    });

    describe('login', () => {
        it('should return access token and user data', async () => {
            const token = 'jwt-token';
            mockJwtService.sign.mockReturnValue(token);

            const result = await service.login(mockUser);

            expect(jwtService.sign).toHaveBeenCalledWith({
                username: mockUser.username,
                sub: mockUser.id,
            });
            expect(result).toEqual({
                access_token: token,
                user: {
                    id: mockUser.id,
                    username: mockUser.username,
                    email: mockUser.email,
                },
            });
        });
    });
});
