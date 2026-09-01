/** @fileoverview 注册 Search 模块拥有的投影消费、扫描与内部触发边界。 */

import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { LocalIdentityContext } from '../identity/local-identity.context';
import { SearchProjectionController } from './search-projection.controller';
import { SearchProjectionService } from './search-projection.service';
import { SearchQueryController } from './search-query.controller';
import { SearchQueryService } from './search-query.service';

/** 用于集中声明 Search 的投影写入与公开只读查询边界。 */
@Module({
  controllers: [SearchProjectionController, SearchQueryController],
  exports: [SearchProjectionService],
  imports: [DatabaseModule],
  providers: [LocalIdentityContext, SearchProjectionService, SearchQueryService],
})
export class SearchModule {}
