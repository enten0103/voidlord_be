import { Request } from 'express';

export interface JwtRequestWithUser extends Request {
  user: { userId: number; username: string };
}

export interface LocalRequestWithUser extends Request {
  user: { id: number; username: string; email: string };
}
