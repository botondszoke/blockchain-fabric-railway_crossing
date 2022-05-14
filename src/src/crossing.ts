/*
 * SPDX-License-Identifier: Apache-2.0
 */

import { Object, Property } from 'fabric-contract-api';

export enum CrossingStatus {
    FREE_TO_CROSS = "FreeToCross",
    LOCKED = "Locked",
    WILL_BE_LOCKED = "WillBeLocked"
}

@Object()
export class Crossing {

    @Property()
    public status: CrossingStatus;

    @Property()
    public timeOfUpdate: number;

    @Property()
    public validityTime: number;

    @Property()
    public lanes: Array<Array<string>>;

    public register(i: number, j: number, value: string): boolean {
        if (typeof this.lanes[i][j] === "undefined") {
            this.lanes[i][j] = value;
            return true;
        }
        return false;
    }
}
