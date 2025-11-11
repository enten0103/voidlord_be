import type { ObjectLiteral, SelectQueryBuilder } from 'typeorm';

type Fn<Args extends any[] = any[], Ret = any> = jest.MockedFunction<
  (...args: Args) => Ret
>;

export interface RepoMock<T extends ObjectLiteral> {
  find: Fn<[object?], Promise<T[]>>;
  findOne: Fn<[object?], Promise<T | null>>;
  save: Fn<[any], Promise<T>>; // save 接受实体或数组，这里宽松处理
  remove: Fn<[any], Promise<T>>;
  create: Fn<[any?], T>; // tests 只需返回单实体
  count: Fn<[object?], Promise<number>>;
  findAndCount: Fn<[object?], Promise<[T[], number]>>;
  createQueryBuilder: Fn<[string?], SelectQueryBuilder<T>>;
  [extra: string]: unknown;
}

export function createRepoMock<T extends ObjectLiteral>(
  overrides?: Partial<RepoMock<T>>,
): RepoMock<T> {
  const repo: RepoMock<T> = {
    find: jest.fn<Promise<T[]>, [object?]>(),
    findOne: jest.fn<Promise<T | null>, [object?]>(),
    save: jest.fn<Promise<T>, [any]>(),
    remove: jest.fn<Promise<T>, [any]>(),
    create: jest.fn<T, [any?]>(),
    count: jest.fn<Promise<number>, [object?]>(),
    findAndCount: jest.fn<Promise<[T[], number]>, [object?]>(),
    createQueryBuilder: jest.fn<SelectQueryBuilder<T>, [string?]>(),
  };
  if (overrides) Object.assign(repo, overrides);
  return repo;
}

export function resetRepoMock<T extends ObjectLiteral>(
  repo: RepoMock<T>,
): void {
  Object.values(repo).forEach((v) => {
    if (typeof v === 'function' && 'mockReset' in v) {
      (v as jest.Mock).mockReset();
    }
  });
}
