/** @fileoverview Provides the fixed local actor without trusting client-supplied ownership data. */

import { Injectable } from '@nestjs/common';

import { LOCAL_USER_ID } from './local-identity.constants';

export { LOCAL_USER_ID };

export interface CurrentActor {
  ownerId: string;
}

const LOCAL_ACTOR: CurrentActor = Object.freeze({ ownerId: LOCAL_USER_ID });

/** Supplies the current actor boundary that later authentication can replace. */
@Injectable()
export class LocalIdentityContext {
  /** Returns an immutable actor derived exclusively from server configuration. */
  getActor(): CurrentActor {
    return LOCAL_ACTOR;
  }
}
