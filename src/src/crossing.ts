/*
 * SPDX-License-Identifier: Apache-2.0
 */

import { Context, Object, Property } from 'fabric-contract-api';
import { Train, TrainStatus } from './train';

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

    @Property("lanes", "string[][]")
    public lanes: string[][];

    /*@Property()
    public async tryToClose(ctx: Context, crossingId: string, trainId: string, train: Train, timeout: number) {
        let success = false;
        let baseTime = Math.floor(Date.now() / 1000);
        let currentTime = baseTime;
        let crossing = this;
        while (currentTime - baseTime < timeout && !success) {
            let count = 0;
            for (let i = 0; i < crossing.lanes.length; i++) {
                for (let j = 0; j < crossing.lanes[i].length; j++) {
                    if (crossing.lanes[i][j] !== null) {
                        count++;
                    }
                }
            }

            if (count === 0) {
                crossing.status = CrossingStatus.LOCKED;
                let buffer = Buffer.from(JSON.stringify(crossing));
                await ctx.stub.putState(crossingId, buffer);

                train.status = TrainStatus.CROSSING;
                buffer = Buffer.from(JSON.stringify(train));
                await ctx.stub.putState(trainId, buffer);

                success = true;
            }
            if (!success) {
                // If crossing is occupied, we wait 1 second
                await new Promise(f => setTimeout(f, 1000));
            }
            currentTime = Math.floor(Date.now() / 1000);
        }
        if (!success) {
            crossing.status = CrossingStatus.FREE_TO_CROSS;
            let buffer: Buffer = Buffer.from(JSON.stringify(crossing));
            await ctx.stub.putState(crossingId, buffer);

            train.status = TrainStatus.STOP;
            buffer = Buffer.from(JSON.stringify(train));
            await ctx.stub.putState(trainId, buffer);
        }
        return true;
    }*/
}
