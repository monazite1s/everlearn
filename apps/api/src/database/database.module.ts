/** @fileoverview 向显式领域模块提供 API 所有的 PostgreSQL 客户端。 */

import { Module } from '@nestjs/common';

import { DatabaseService } from './database.service';

/** 用于注册数据库生命周期且不创建隐式全局依赖。 */
@Module({ exports: [DatabaseService], providers: [DatabaseService] })
export class DatabaseModule {}
