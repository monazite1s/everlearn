/** @fileoverview 注册 Search 模块拥有的投影消费、扫描与内部触发边界。 */

import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { SearchProjectionController } from './search-projection.controller';
import { SearchProjectionService } from './search-projection.service';

/** 用于集中声明 Search 对 PostgreSQL 投影的唯一写入所有权。 */
@Module({
  controllers: [SearchProjectionController],
  exports: [SearchProjectionService],
  imports: [DatabaseModule],
  providers: [SearchProjectionService],
})
export class SearchModule {}
