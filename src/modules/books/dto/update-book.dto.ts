import { PartialType } from '@nestjs/swagger';
import { CreateBookDto } from './create-book.dto';

// 目前仅保留 tags 字段，因此 UpdateBookDto 继承 PartialType(CreateBookDto) 即可
export class UpdateBookDto extends PartialType(CreateBookDto) {}
