// 通用响应类型守卫与辅助函数，集中替换 e2e 测试中对 res.body 的 any 访问。
// 新增通用数组守卫与 id 对象守卫，供多模块复用。

export interface SimpleId {
  id: number;
}

export interface PagedResult<T> {
  total: number;
  items: T[];
}

// 书籍与标签的轻量形状
export interface TagLite {
  key: string;
  value: string;
}

export interface BookLite {
  id?: number;
  hash?: string;
  title?: string;
  description?: string | null;
  tags?: TagLite[];
}

// 书单明细（允许缺少 items，或 items 为数组）
export interface BookListDetailItem {
  book?: { id?: number; title?: string; hash?: string };
}
export interface BookListDetail {
  id?: number;
  name?: string;
  is_public?: boolean;
  items_count: number;
  items?: BookListDetailItem[];
}

// 基础对象判定
function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null;
}

export function isSimpleId(val: unknown): val is SimpleId {
  if (!isRecord(val)) return false;
  return typeof val.id === 'number';
}

export function isPagedResult<T>(
  val: unknown,
  itemGuard: (x: unknown) => x is T,
): val is PagedResult<T> {
  if (!isRecord(val)) return false;
  const total = val.total;
  const items = val.items;
  if (typeof total !== 'number' || !Array.isArray(items)) return false;
  return items.every((i) => itemGuard(i));
}

// 针对常见数组元素为 number 的分页结果
export function isPagedNumberIdResult(
  val: unknown,
): val is PagedResult<number> {
  return isPagedResult<number>(val, (x): x is number => typeof x === 'number');
}

// 简单标签守卫
export function isTagLite(val: unknown): val is TagLite {
  if (!isRecord(val)) return false;
  return typeof val.key === 'string' && typeof val.value === 'string';
}

// 简单书籍守卫（宽松，仅校验常用字段与 tags 的基本形状）
export function isBookLite(val: unknown): val is BookLite {
  if (!isRecord(val)) return false;
  if (val.id !== undefined && typeof val.id !== 'number') return false;
  if (val.hash !== undefined && typeof val.hash !== 'string') return false;
  if (val.title !== undefined && typeof val.title !== 'string') return false;
  if (
    val.description !== undefined &&
    typeof val.description !== 'string' &&
    val.description !== null
  )
    return false;
  if (val.tags !== undefined) {
    if (!Array.isArray(val.tags)) return false;
    if (!val.tags.every((t) => isTagLite(t))) return false;
  }
  return true;
}

export function isBookArray(val: unknown): val is BookLite[] {
  return Array.isArray(val) && val.every((b) => isBookLite(b));
}

// 通用：构造元素守卫的数组守卫
export function isArrayOf<T>(elemGuard: (o: unknown) => o is T) {
  return (o: unknown): o is T[] => Array.isArray(o) && o.every(elemGuard);
}

// 通用：至少包含 number id 的对象
export function isIdObject(o: unknown): o is { id: number } {
  if (typeof o !== 'object' || o === null) return false;
  return typeof (o as Record<string, unknown>).id === 'number';
}

// 安全获取并断言类型，失败抛错便于测试直接失败
export function expectGuard<T>(
  val: unknown,
  guard: (x: unknown) => x is T,
  msg?: string,
): T {
  if (!guard(val)) {
    throw new Error(msg || 'Unexpected response shape');
  }
  return val;
}

// 从 supertest.Response 中提取 body 并应用守卫
export function parseBody<T>(data: unknown, guard: (x: unknown) => x is T): T {
  return expectGuard(data, guard);
}

// BookList 明细守卫：允许只有计数，无 items；若有 items 则做浅校验
export function isBookListDetail(val: unknown): val is BookListDetail {
  if (!isRecord(val)) return false;
  const count = val.items_count;
  if (typeof count !== 'number') return false;
  if (val.items === undefined) return true;
  if (!Array.isArray(val.items)) return false;
  return val.items.every((it) => typeof it === 'object' && it !== null);
}
