import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
    // 标准化未登录/无效令牌为 401，并暴露更清晰的信息
    handleRequest(err: any, user: any, info: any) {
        if (err || !user) {
            const message = info?.message || err?.message || 'Unauthorized';
            throw new UnauthorizedException(message);
        }
        return user;
    }
}
