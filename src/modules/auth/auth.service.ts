import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
  ) {}

  async validateUser(
    username: string,
    password: string,
  ): Promise<{ id: number; username: string; email: string } | null> {
    const user = await this.usersService.findByUsername(username);
    if (
      user &&
      (await this.usersService.validatePassword(password, user.password))
    ) {
      const { id, username: uname, email } = user;
      return { id, username: uname, email };
    }
    return null;
  }

  async login(user: { id: number; username: string; email: string }) {
    const payload = { username: user.username, sub: user.id };
    const access_token = await this.jwtService.signAsync(payload);
    return {
      access_token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
      },
    };
  }
}
