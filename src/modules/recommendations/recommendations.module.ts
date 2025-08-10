import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RecommendationSection } from '../../entities/recommendation-section.entity';
import { RecommendationItem } from '../../entities/recommendation-item.entity';
import { Book } from '../../entities/book.entity';
import { RecommendationsService } from './recommendations.service';
import { RecommendationsController } from './recommendations.controller';

@Module({
    imports: [TypeOrmModule.forFeature([RecommendationSection, RecommendationItem, Book])],
    providers: [RecommendationsService],
    controllers: [RecommendationsController],
    exports: [RecommendationsService],
})
export class RecommendationsModule { }
