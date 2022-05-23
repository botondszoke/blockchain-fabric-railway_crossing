/*
 * SPDX-License-Identifier: Apache-2.0
 */

import { Context, Contract, Info, Returns, Transaction } from 'fabric-contract-api';
import { ClientIdentity } from 'fabric-shim';
import { Crossing, CrossingStatus } from './crossing';
import { Train, TrainStatus } from './train';

@Info({title: 'CrossingContract', description: 'My Smart Contract' })
export class CrossingContract extends Contract {

    /**
     * Basic, generated method. Checks if the crossing with the given ID exists.
     */
    @Transaction(false)
    @Returns('boolean')
    public async crossingExists(ctx: Context, crossingId: string): Promise<boolean> {
        const data: Uint8Array = await ctx.stub.getState(crossingId);
        return (!!data && data.length > 0);
    }

    /**
     * Basic, generated method. Checks if the train with the given ID exists.
     */
    @Transaction(false)
    @Returns('boolean')
    public async trainExists(ctx: Context, trainId: string): Promise<boolean> {
        const data: Uint8Array = await ctx.stub.getState(trainId);
        return (!!data && data.length > 0);
    }

    /**
     * Creates a new crossing with the given parameters.
     */
    @Transaction()
    public async createCrossing(ctx: Context, crossingId: string, status: CrossingStatus, validityTime: number, laneNumber: number, laneCapacity: number): Promise<void> {
        // Check if the client has permission to execute the transaction
        const identity: ClientIdentity = ctx.clientIdentity;
        if (identity.getMSPID() !== 'RailwayCompanyMSP' || !identity.assertAttributeValue('role', 'infraController')) {
            throw new Error(`You do not have permission to execute this operation.`);
        }

        const exists: boolean = await this.crossingExists(ctx, crossingId);
        if (exists) {
            throw new Error(`The crossing ${crossingId} already exists`);
        }
        if (laneNumber <= 0) {
            throw new Error(`At least 1 lane is needed`);
        }
        if (laneCapacity <= 0) {
            throw new Error(`Lane capacity should be at least 1`);
        }
        const crossing: Crossing = new Crossing();

        const now = Math.floor(ctx.stub.getDateTimestamp().getTime() / 1000); // time in seconds
        crossing.status = status;
        crossing.timeOfUpdate = now;
        crossing.validityTime = validityTime;

        // Creates the given number of lanes, each
        // with the given number of capacity
        const lanes: boolean[][] = [];
        for (let i = 0; i < laneNumber; i++) {
            const lane = [];
            for (let j = 0; j < laneCapacity; j++) {
                lane.push(false);
            }
            lanes.push(lane);
        }
        crossing.lanes = lanes;

        const buffer: Buffer = Buffer.from(JSON.stringify(crossing));
        await ctx.stub.putState(crossingId, buffer);
    }

    /**
     * Creates a new train with the given parameters.
     */
    @Transaction()
    public async createTrain(ctx: Context, trainId: string, status: TrainStatus, timeout: number): Promise<void> {
        // Check if the client has permission to execute the transaction
        const identity: ClientIdentity = ctx.clientIdentity;
        if (identity.getMSPID() !== 'RailwayCompanyMSP' || !identity.assertAttributeValue('role', 'infraController')) {
            throw new Error(`You do not have permission to execute this operation.`);
        }

        const exists: boolean = await this.trainExists(ctx, trainId);
        if (exists) {
            throw new Error(`The train ${trainId} already exists`);
        }

        const train: Train = new Train();
        train.status = status;
        train.timeOfRequest = -1;
        train.timeout = timeout;

        const buffer: Buffer = Buffer.from(JSON.stringify(train));
        await ctx.stub.putState(trainId, buffer);
    }

    /**
     * Returns the crossing with the given ID, if it exists.
     */
    @Transaction(false)
    @Returns('Crossing')
    public async readCrossing(ctx: Context, crossingId: string): Promise<Crossing> {
        const exists: boolean = await this.crossingExists(ctx, crossingId);
        if (!exists) {
            throw new Error(`The crossing ${crossingId} does not exist`);
        }
        const data: Uint8Array = await ctx.stub.getState(crossingId);
        const crossing: Crossing = JSON.parse(data.toString()) as Crossing;

        const now = Math.floor(ctx.stub.getDateTimestamp().getTime() / 1000); // time in seconds

        // If last 'free to cross' from the infra becomes invalid,
        // the crossing will be assumed to be in a Locked state.
        if (crossing.status !== CrossingStatus.LOCKED && now >= crossing.timeOfUpdate + crossing.validityTime) {
            crossing.status = CrossingStatus.LOCKED;
        }

        return crossing;
    }

    /**
     * Returns the train with the given ID, if it exists.
     */
    @Transaction(false)
    @Returns('Train')
    public async readTrain(ctx: Context, trainId: string): Promise<Train> {
        // Check if the client has permission to execute the transaction
        const identity: ClientIdentity = ctx.clientIdentity;
        if (identity.getMSPID() !== 'RailwayCompanyMSP') {
            throw new Error(`You do not have permission to execute this operation.`);
        }

        const exists: boolean = await this.trainExists(ctx, trainId);
        if (!exists) {
            throw new Error(`The train ${trainId} does not exist`);
        }
        const data: Uint8Array = await ctx.stub.getState(trainId);
        const train: Train = JSON.parse(data.toString()) as Train;

        return train;
    }

    /**
     * Updates the crossing with the given ID to the given status and validity time.
     * The railway infrastructure can use this method to manage the crossing.
     */
    @Transaction()
    public async updateCrossing(ctx: Context, crossingId: string, newStatus: CrossingStatus, validityTime: number): Promise<void> {

        // Check if the client has permission to execute the transaction
        const identity: ClientIdentity = ctx.clientIdentity;
        if (identity.getMSPID() !== 'RailwayCompanyMSP' || !identity.assertAttributeValue('role', 'infraController')) {
            throw new Error(`You do not have permission to execute this operation.`);
        }

        const exists: boolean = await this.crossingExists(ctx, crossingId);
        if (!exists) {
            throw new Error(`The crossing ${crossingId} does not exist`);
        }
        const crossing: Crossing = await this.readCrossing(ctx, crossingId);
        const now = Math.floor(ctx.stub.getDateTimestamp().getTime() / 1000); // time in seconds
        crossing.status = newStatus;
        crossing.timeOfUpdate = now;
        crossing.validityTime = validityTime;
        const buffer: Buffer = Buffer.from(JSON.stringify(crossing));
        await ctx.stub.putState(crossingId, buffer);
    }

    /**
     * Deletes the crossing with the given ID, if it exists.
     */
    @Transaction()
    public async deleteCrossing(ctx: Context, crossingId: string): Promise<void> {
        // Check if the client has permission to execute the transaction
        const identity: ClientIdentity = ctx.clientIdentity;
        if (identity.getMSPID() !== 'RailwayCompanyMSP' || !identity.assertAttributeValue('role', 'infraController')) {
            throw new Error(`You do not have permission to execute this operation.`);
        }

        const exists: boolean = await this.crossingExists(ctx, crossingId);
        if (!exists) {
            throw new Error(`The crossing ${crossingId} does not exist`);
        }
        await ctx.stub.deleteState(crossingId);
    }

    /**
     * Deletes the train with the given ID, if it exists.
     */
    @Transaction()
    public async deleteTrain(ctx: Context, trainId: string): Promise<void> {
        // Check if the client has permission to execute the transaction
        const identity: ClientIdentity = ctx.clientIdentity;
        if (identity.getMSPID() !== 'RailwayCompanyMSP' || !identity.assertAttributeValue('role', 'infraController')) {
            throw new Error(`You do not have permission to execute this operation.`);
        }

        const exists: boolean = await this.trainExists(ctx, trainId);
        if (!exists) {
            throw new Error(`The train ${trainId} does not exist`);
        }
        await ctx.stub.deleteState(trainId);
    }


    /**
     * Requests permission to cross for the caller vehicle.
     * Returns if the permission was granted or not.
     */
    @Transaction()
    @Returns('number[]')
    public async permissionToCrossVehicle(ctx: Context, crossingId: string): Promise<number[]> {
        // Check if the client has permission to execute the transaction
        const identity: ClientIdentity = ctx.clientIdentity;
        if (identity.getMSPID() !== 'VehiclesMSP' || identity.assertAttributeValue('licensePlate', null)) {
            throw new Error(`You do not have permission to execute this operation.`);
        }
        const crossing = await this.readCrossing(ctx, crossingId);
        // If crossing is closed or will be closed, permission denied
        if (crossing.status !== CrossingStatus.FREE_TO_CROSS) {
            return [-1, -1];
        }
        else {
            // Check if there is free space for the vehicle
            const pos = [-1, -1];
            for (let i = 0; i < crossing.lanes.length; i++) {
                for (let j = 0; j < crossing.lanes[i].length; j++) {
                    if ((pos[0] === -1 || pos[1] === -1) && crossing.lanes[i][j] === false) {
                        pos[0] = i;
                        pos[1] = j;
                        break;
                    }
                }
                if (pos[0] !== -1 || pos[1] !== -1) {
                    break;
                }
            }

            // If no space, permission denied
            if (pos[0] === -1 || pos[1] === -1) {
                return [-1, -1];
            }

            // Register the changes
            crossing.lanes[pos[0]][pos[1]] = true;
            let buffer: Buffer = Buffer.from(JSON.stringify(crossing));
            await ctx.stub.putState(crossingId, buffer);

            // Register the vehicle in the private collection
            buffer = Buffer.from(JSON.stringify(pos));
            await ctx.stub.putPrivateData('RailwayPrivateCollection',identity.getAttributeValue('licensePlate'), buffer);
            return pos;
        }
    }

    /**
     * Releases the caller vehicle's permission.
     */
    @Transaction()
    public async permissionReleaseVehicle(ctx: Context, crossingId: string, pos0: number, pos1: number): Promise<void> {
        // Check if the client has permission to execute the transaction
        const identity: ClientIdentity = ctx.clientIdentity;
        if (identity.getMSPID() !== 'VehiclesMSP' || identity.assertAttributeValue('licensePlate', null)) {
            throw new Error(`You do not have permission to execute this operation.`);
        }
        const crossing = await this.readCrossing(ctx, crossingId);
        if (pos0 >= crossing.lanes.length || pos0 < 0 || pos1 >= crossing.lanes[pos0].length || pos1 < 0 || crossing.lanes[pos0][pos1] === false) {
            throw new Error(`Invalid position given.`);
        }

        // Register the changes
        crossing.lanes[pos0][pos1] = false;
        let buffer: Buffer = Buffer.from(JSON.stringify(crossing));
        await ctx.stub.putState(crossingId, buffer);

        // Register the vehicle in the private collection
        buffer = Buffer.from(JSON.stringify([pos0, pos1, -1]));
        await ctx.stub.putPrivateData('RailwayPrivateCollection',identity.getAttributeValue('licensePlate'), buffer);
    }

    /**
     * Tries to give permission to cross for the train with the given ID.
     * Retrying is the responsibility of the client.
     */
    @Transaction()
    public async permissionToCrossTrain(ctx: Context, crossingId: string, trainId: string): Promise<void> {
        // Check if the client has permission to execute the transaction
        const identity: ClientIdentity = ctx.clientIdentity;
        if (identity.getMSPID() !== 'RailwayCompanyMSP') {
            throw new Error(`You do not have permission to execute this operation.`);
        }

        const crossing = await this.readCrossing(ctx, crossingId);
        const train = await this.readTrain(ctx, trainId);
        let buffer: Buffer;

        // If another train interacted with the crossing, it is or will be occupied by it
        // so this train cannot get permission to cross
        if (crossing.status === CrossingStatus.LOCKED || (crossing.status === CrossingStatus.WILL_BE_LOCKED && train.status !== TrainStatus.CAUTION)) {
            train.status = TrainStatus.STOP;
            buffer = Buffer.from(JSON.stringify(train));
            await ctx.stub.putState(trainId, buffer);
            return;
        }

        // If no train interacted with the crossing yet, tries to give permission
        else {
            const now = Math.floor(ctx.stub.getDateTimestamp().getTime() / 1000); // time in seconds
            // If this is the first try of this train
            if (train.timeOfRequest === -1 || train.status === TrainStatus.GO) {
                train.timeOfRequest = now;
            }
            // Check for timeout
            if (now >= train.timeOfRequest + train.timeout) {
                crossing.status = CrossingStatus.FREE_TO_CROSS;
                buffer = Buffer.from(JSON.stringify(crossing));
                await ctx.stub.putState(crossingId, buffer);

                train.status = TrainStatus.STOP;
                buffer = Buffer.from(JSON.stringify(train));
                await ctx.stub.putState(trainId, buffer);
                return;
            }

            // Try to get permission
            crossing.status = CrossingStatus.WILL_BE_LOCKED;
            train.status = TrainStatus.CAUTION;

            let count = 0;
            for (const lane of crossing.lanes) {
                for (const space of lane) {
                    if (space !== false) {
                        count++;
                    }
                }
            }
            // If crossing is empty, permission can be given
            if (count === 0) {
                crossing.status = CrossingStatus.LOCKED;
                train.status = TrainStatus.IN_CROSSING;
            }

            // Save changes
            buffer = Buffer.from(JSON.stringify(crossing));
            await ctx.stub.putState(crossingId, buffer);

            buffer = Buffer.from(JSON.stringify(train));
            await ctx.stub.putState(trainId, buffer);

        }
    }

    /**
     * Releases the crossing permission of the train with the given ID
     * if it is possible (crossing is locked, train has permission).
     */
    @Transaction()
    public async permissionReleaseTrain(ctx: Context, crossingId: string, trainId: string): Promise<void> {
        // Check if the client has permission to execute the transaction
        const identity: ClientIdentity = ctx.clientIdentity;
        if (identity.getMSPID() !== 'RailwayCompanyMSP') {
            throw new Error(`You do not have permission to execute this operation.`);
        }

        const crossing = await this.readCrossing(ctx, crossingId);

        if (crossing.status === CrossingStatus.LOCKED) {
            const train = await this.readTrain(ctx, trainId);

            if (train.status === TrainStatus.IN_CROSSING) {

                // Register changes
                crossing.status = CrossingStatus.FREE_TO_CROSS;
                let buffer: Buffer = Buffer.from(JSON.stringify(crossing));
                await ctx.stub.putState(crossingId, buffer);

                train.status = TrainStatus.GO;
                train.timeOfRequest = -1;
                buffer = Buffer.from(JSON.stringify(train));
                await ctx.stub.putState(trainId, buffer);
            }
        }
    }

}
