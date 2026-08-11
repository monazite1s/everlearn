/** @fileoverview Seeds the stable local development identity independently from schema DDL. */

import type { Migration } from 'kysely/migration' with { 'resolution-mode': 'import' };

export const LOCAL_USER_ID = '00000000-0000-4000-8000-000000000001';

export const localUserSeedMigration: Migration = {
  /** Inserts the stable local user once without overwriting an existing identity. */
  async up(database): Promise<void> {
    await database
      .insertInto('users')
      .values({
        id: LOCAL_USER_ID,
        display_name: '本地用户',
        timezone: 'Asia/Shanghai',
      })
      .onConflict((conflict) => conflict.column('id').doNothing())
      .execute();
  },
  /** Removes only the known local seed and preserves all unrelated identities. */
  async down(database): Promise<void> {
    await database.deleteFrom('users').where('id', '=', LOCAL_USER_ID).execute();
  },
};
