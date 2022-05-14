/*
 * SPDX-License-Identifier: Apache-2.0
 */

import { Context, Contract, Info, Returns, Transaction } from 'fabric-contract-api';
import { Crossing, CrossingStatus } from './crossing';

@Info({title: 'CrossingContract', description: 'My Smart Contract' })
export class CrossingContract extends Contract {

    @Transaction(false)
    @Returns('boolean')
    private async crossingExists(ctx: Context, crossingId: string): Promise<boolean> {
        const data: Uint8Array = await ctx.stub.getState(crossingId);
        return (!!data && data.length > 0);
    }

    @Transaction()
    public async createCrossing(ctx: Context, crossingId: string, status: CrossingStatus, validityTime: number, laneCapacities: number[]): Promise<void> {
        const exists: boolean = await this.crossingExists(ctx, crossingId);
        if (exists) {
            throw new Error(`The crossing ${crossingId} already exists`);
        }
        if (laneCapacities.length <= 0) {
            throw new Error(`Lane capacities were not provided`);
        }
        const crossing: Crossing = new Crossing();

        const now = Math.floor(Date.now() / 1000); // time in seconds
        crossing.status = status;
        crossing.timeOfUpdate = now;
        crossing.validityTime = validityTime;

        const lanes: string[][] = [];
        for (let i = 0; i < laneCapacities.length; i++) {
            const lane = new Array<string>(laneCapacities[i]);
            lanes.push(lane);
        }
        crossing.lanes = lanes;

        const buffer: Buffer = Buffer.from(JSON.stringify(crossing));
        await ctx.stub.putState(crossingId, buffer);
    }

    @Transaction(false)
    @Returns('Crossing')
    private async readCrossing(ctx: Context, crossingId: string): Promise<Crossing> {
        const exists: boolean = await this.crossingExists(ctx, crossingId);
        if (!exists) {
            throw new Error(`The crossing ${crossingId} does not exist`);
        }
        const data: Uint8Array = await ctx.stub.getState(crossingId);
        const crossing: Crossing = JSON.parse(data.toString()) as Crossing;

        let now = Math.floor(Date.now() / 1000);
        if (now >= crossing.timeOfUpdate + crossing.validityTime) {
            crossing.status = CrossingStatus.LOCKED;
        }

        return crossing;
    }

    @Transaction()
    public async updateCrossing(ctx: Context, crossingId: string, newStatus: CrossingStatus, validityTime: number): Promise<void> {
        const exists: boolean = await this.crossingExists(ctx, crossingId);
        if (!exists) {
            throw new Error(`The crossing ${crossingId} does not exist`);
        }
        const crossing: Crossing = new Crossing();
        const now = Math.floor(Date.now() / 1000); // time in seconds
        crossing.status = newStatus;
        crossing.timeOfUpdate = now;
        crossing.validityTime = validityTime;
        const buffer: Buffer = Buffer.from(JSON.stringify(crossing));
        await ctx.stub.putState(crossingId, buffer);      
    }

    @Transaction()
    public async deleteCrossing(ctx: Context, crossingId: string): Promise<void> {
        const exists: boolean = await this.crossingExists(ctx, crossingId);
        if (!exists) {
            throw new Error(`The crossing ${crossingId} does not exist`);
        }
        await ctx.stub.deleteState(crossingId);
    }

    @Transaction()
    @Returns('boolean')
    public async permissionToCrossVehicle(ctx: Context, crossingId: string): Promise<boolean> {
        const crossing = await this.readCrossing(ctx, crossingId);
        if (crossing.status !== CrossingStatus.FREE_TO_CROSS)
            return false;
        else {
            let pos = [-1, -1];
            for (let i = 0; i < crossing.lanes.length; i++) {
                for (let j = 0; j < crossing.lanes[i].length; j++) {
                    if (pos === [-1, -1] && typeof crossing.lanes[i][j] === 'undefined') {
                        pos = [i, j];
                        break;
                    }
                }
                if (pos !== [-1, -1]) {
                    break;
                }
            }
            if (pos === [-1, -1]) {
                return false;
            }
            crossing.lanes[pos[0]][pos[1]] = ctx.clientIdentity.getID();
            const buffer: Buffer = Buffer.from(JSON.stringify(crossing));
            await ctx.stub.putState(crossingId, buffer); 
            return true;
        }
    }

    @Transaction()
    public async permissionReleaseVehicle(ctx: Context, crossingId: string): Promise<void> {
        const crossing = await this.readCrossing(ctx, crossingId);
        let pos = [-1, -1];
        for (let i = 0; i < crossing.lanes.length; i++) {
            for (let j = 0; j < crossing.lanes[i].length; j++) {
                if (pos === [-1, -1] && crossing.lanes[i][j] === ctx.clientIdentity.getID()) {
                    pos = [i, j];
                    break;
                }
            }
            if (pos !== [-1, -1]) {
                break;
            }
        }
        if (pos === [-1, -1]) {
            throw new Error("Vehicle not found");
        }
        crossing.lanes[pos[0]][pos[1]] = undefined;
        const buffer: Buffer = Buffer.from(JSON.stringify(crossing));
        await ctx.stub.putState(crossingId, buffer); 
    }

    @Transaction()
    @Returns('boolean')
    public async permissionToCrossTrain(ctx: Context, crossingId: string, timeout: number): Promise<boolean> {
        let crossing = await this.readCrossing(ctx, crossingId);
        // If another train interacted with the crossing, it is or will be occupied by it
        if (crossing.status !== CrossingStatus.FREE_TO_CROSS) {
            return false;
        }
        else {
            crossing.status = CrossingStatus.WILL_BE_LOCKED;
            let buffer: Buffer = Buffer.from(JSON.stringify(crossing));
            await ctx.stub.putState(crossingId, buffer);
            let baseTime = Math.floor(Date.now() / 1000);
            let currentTime = baseTime;
            let success = false;
            while (currentTime - baseTime < timeout && !success) {
                crossing = await this.readCrossing(ctx, crossingId);
                let count = 0;
                for (let i = 0; i < crossing.lanes.length; i++) {
                    for (let j = 0; j < crossing.lanes[i].length; j++) {
                        if (typeof crossing.lanes[i][j] !== 'undefined') {
                            count++;
                        }
                    }
                }
                if (count === 0) {
                    crossing.status = CrossingStatus.LOCKED;
                    buffer = Buffer.from(JSON.stringify(crossing));
                    await ctx.stub.putState(crossingId, buffer);
                    success = true;
                }
                currentTime = Math.floor(Date.now() / 1000);
            }
            return success;
        }
    }

    @Transaction()
    public async permissionReleaseTrain(ctx: Context, crossingId: string): Promise<void> {
        const crossing = await this.readCrossing(ctx, crossingId);
        if (crossing.status === CrossingStatus.LOCKED) {
            crossing.status = CrossingStatus.FREE_TO_CROSS;
            const buffer: Buffer = Buffer.from(JSON.stringify(crossing));
            await ctx.stub.putState(crossingId, buffer); 
        }
    }

}
