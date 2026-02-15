# VoidLord Backend - AI Coding Instructions

You are an AI assistant working on the VoidLord backend (NestJS + TypeORM + PostgreSQL).
Follow these instructions to write idiomatic, safe, and integrated code.

## 1. Project Architecture

- **Framework:** NestJS (Modules/Controllers/Services pattern).
- **ORM:** TypeORM with Repository pattern. Entities are in `src/entities/`.
- **Database:** PostgreSQL (Dockerized).
- **Docs:** Swagger is auto-generated. Always verify changes using `pnpm start` and checking Swagger UI or running tests.
- **Entry Point:** `src/main.ts` sets up global `ValidationPipe` (whitelist + transform) and Swagger.

## 2. Authentication & Permissions

This project uses a custom permission level system layered on JWT.

- **Guards:** Use `JwtAuthGuard` and `PermissionGuard` for protected routes.
- **Decorator:** Use `@ApiPermission('PERMISSION_NAME', level)` (default level 1).
  - Example: `@ApiPermission('BOOK_CREATE', 1)` enforces permission checks and documents it.
  - Usage: Always apply `@ApiBearerAuth('JWT-auth')` alongside auth guards.
- **User Context:** In Controllers, types `req` as `JwtRequestWithUser` (from `types/request.interface.ts`) to safely access `req.user.userId`.

## 3. Data & Validation Patterns

- **DTOs:** Mandatory for all Controller `Body` and `Query`. Check `src/modules/*/dto/`.
  - Use `class-validator` decorators explicitly.
- **Responses:**
  - Controllers use `UseInterceptors(ClassSerializerInterceptor)` to handle Entity serialization (e.g., `@Exclude` password).
  - Use Swagger decorators (`@ApiResponse`, `@ApiOperation`) on all endpoints.
- **Search Pattern:**
  - Complex searches (e.g., Books) often use a `POST /search` pattern with a condition array structure rather than complex URL queries.
- **TypeORM:**
  - When querying with relations or composite keys, strict typing is enforced. Use `as FindOptionsWhere<Entity>` if TS complains about deep partials.
  - Example: `where: { book: { id: bookId } as Book }`.

## 4. Testing Strategy

- **Unit Tests:** Located alongside files (e.g., `*.spec.ts`) or in `test/` folders inside modules.
- **E2E Tests:** Located in `test/` root folder.
- **Running Tests:**
  - Unit: `pnpm test`
  - E2E: `pnpm test:e2e`
- **Mocks:** Use `test/repo-mocks.ts` for standardized repository mocking patterns.

## 5. Directory Structure

- `src/modules/` - Feature modules (business logic).
- `src/entities/` - Database entities (Single source of truth for DB schema).
- `src/init/` & `src/utils/` - App bootstrapping and helpers.
- `docs/` - Domain specific documentation. **Check this folder** before refactoring complex logic (e.g. `BOOKS_TAG_SEARCH.md`).

## 6. Common Tasks

- **New Feature:** Create Module -> Entity -> Service -> Controller -> DTOs -> Register in `AppModule`.
- **Database Changes:** Modify Entity. (Note: Project uses `synchronize: true` locally or migrations, check `database.config.ts`).
- **Tagging:** Use `TagsService` or helper methods like `processTags` in services to handle many-to-many tag relations.
