/** @fileoverview Exposes the API-owned PostgreSQL client to explicit domain modules. */

import { Module } from '@nestjs/common';

import { DatabaseService } from './database.service';

/** Registers the database lifecycle without making it an implicit global dependency. */
@Module({ exports: [DatabaseService], providers: [DatabaseService] })
export class DatabaseModule {}
