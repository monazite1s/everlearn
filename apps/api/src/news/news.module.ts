/**
 * @fileoverview 装配资讯订阅、简报运行与内部执行端点。
 */

import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { LocalIdentityContext } from '../identity/local-identity.context';
import { requireJsonContentType } from '../http-boundary/require-json-content-type';
import { NewsInternalController } from './news-internal.controller';
import { NewsController } from './news.controller';
import { NewsItemsService } from './news-items.service';
import { NewsRunsService } from './news-runs.service';
import { NewsService } from './news.service';
import { NewsWebSearchService } from './news-web-search.service';

/** 用于持有资讯切片的控制器、服务与数据库依赖。 */
@Module({
  controllers: [NewsController, NewsInternalController],
  imports: [DatabaseModule],
  providers: [
    LocalIdentityContext,
    NewsItemsService,
    NewsRunsService,
    NewsService,
    NewsWebSearchService,
  ],
})
export class NewsModule implements NestModule {
  /** 用于向资讯读取路由应用仅 JSON 规则。 */
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(requireJsonContentType).forRoutes(NewsController);
  }
}
