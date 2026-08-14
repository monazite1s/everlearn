/** @fileoverview 提供不信任客户端所有权数据的固定本地操作者。 */

import { Injectable } from '@nestjs/common';

import { LOCAL_USER_ID } from './local-identity.constants';

export { LOCAL_USER_ID };

export interface CurrentActor {
  ownerId: string;
}

const LOCAL_ACTOR: CurrentActor = Object.freeze({ ownerId: LOCAL_USER_ID });

/** 用于提供可替换的当前操作者边界。 */
@Injectable()
export class LocalIdentityContext {
  /** 用于返回仅由服务端配置派生的不可变操作者。 */
  getActor(): CurrentActor {
    return LOCAL_ACTOR;
  }
}
