/** @fileoverview 独立于 Schema DDL 写入稳定本地开发身份。 */

import type { Migration } from 'kysely/migration' with { 'resolution-mode': 'import' };

import { LOCAL_USER_ID } from '../../identity/local-identity.constants';

export { LOCAL_USER_ID };

export const localUserSeedMigration: Migration = {
  /** 用于写入稳定本地用户且不覆盖已有身份。 */
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
  /** 用于只删除已知本地种子并保留其他身份。 */
  async down(database): Promise<void> {
    await database.deleteFrom('users').where('id', '=', LOCAL_USER_ID).execute();
  },
};
