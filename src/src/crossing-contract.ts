/*
 * SPDX-License-Identifier: Apache-2.0
 */

import { Context, Contract, Info, Returns, Transaction } from 'fabric-contract-api';
import { Crossing, CrossingStatus } from './crossing';
import { Train, TrainStatus } from './train';
import { Vehicle } from './vehicle';

@Info({title: 'CrossingContract', description: 'My Smart Contract' })
export class CrossingContract extends Contract {

    @Transaction(false)
    @Returns('boolean')
    public async crossingExists(ctx: Context, crossingId: string): Promise<boolean> {
        const data: Uint8Array = await ctx.stub.getState(crossingId);
        return (!!data && data.length > 0);
    }

    @Transaction(false)
    @Returns('boolean')
    public async vehicleExists(ctx: Context, vehicleId: string): Promise<boolean> {
        const data: Uint8Array = await ctx.stub.getState(vehicleId);
        return (!!data && data.length > 0);
    }

    @Transaction(false)
    @Returns('boolean')
    public async trainExists(ctx: Context, trainId: string): Promise<boolean> {
        const data: Uint8Array = await ctx.stub.getState(trainId);
        return (!!data && data.length > 0);
    }

    @Transaction()
    public async createCrossing(ctx: Context, crossingId: string, status: CrossingStatus, validityTime: number, laneNumber: number, laneCapacity: number): Promise<void> {
        const exists: boolean = await this.crossingExists(ctx, crossingId);
        if (exists) {
            throw new Error(`The crossing ${crossingId} already exists`);
        }
        if (laneNumber <= 0) {
            throw new Error(`At least 1 lane is needed`);
        }
        if (laneCapacity <= 0) {
            throw new Error(`Lane capacity should be at least 1`)
        }
        const crossing: Crossing = new Crossing();

        const now = Math.floor(Date.now() / 1000); // time in seconds
        crossing.status = status;
        crossing.timeOfUpdate = now;
        crossing.validityTime = validityTime;

        const lanes: string[][] = [];
        for (let i = 0; i < laneNumber; i++) {
            let lane = [];
            for (let j = 0; j < laneCapacity; j++) {
                lane.push(null);
            }
            lanes.push(lane);
        }
        crossing.lanes = lanes;

        const buffer: Buffer = Buffer.from(JSON.stringify(crossing));
        await ctx.stub.putState(crossingId, buffer);
    }

    @Transaction(false)
    @Returns('Crossing')
    public async readCrossing(ctx: Context, crossingId: string): Promise<Crossing> {
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
        const crossing: Crossing = await this.readCrossing(ctx, crossingId);
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
    public async permissionToCrossVehicle(ctx: Context, crossingId: string, vehicleId: string): Promise<boolean> {
        const crossing = await this.readCrossing(ctx, crossingId);
        if (crossing.status !== CrossingStatus.FREE_TO_CROSS)
            return false;
        else {
            const vehicle = await this.readVehicle(ctx, vehicleId);
            let pos = [-1, -1];
            for (let i = 0; i < crossing.lanes.length; i++) {
                for (let j = 0; j < crossing.lanes[i].length; j++) {
                    if (pos[0] === -1 || pos[1] === -1 && crossing.lanes[i][j] === null) {
                        pos[0] = i;
                        pos[1] = j;
                        break;
                    }
                }
                if (pos[0] !== -1 || pos[1] !== -1) {
                    break;
                }
            }
            if (pos[0] === -1 || pos[1] === -1) {
                return false;
            }
            crossing.lanes[pos[0]][pos[1]] = vehicle.licensePlate;
            const buffer: Buffer = Buffer.from(JSON.stringify(crossing));
            await ctx.stub.putState(crossingId, buffer); 
            return true;
        }
    }

    @Transaction()
    public async permissionReleaseVehicle(ctx: Context, crossingId: string, vehicleId: string): Promise<void> {
        const crossing = await this.readCrossing(ctx, crossingId);
        const vehicle = await this.readVehicle(ctx, vehicleId);
        let pos = [-1, -1];
        for (let i = 0; i < crossing.lanes.length; i++) {
            for (let j = 0; j < crossing.lanes[i].length; j++) {
                if (pos[0] === -1 || pos[1] === -1 && crossing.lanes[i][j] === vehicle.licensePlate) {
                    pos[0] = i;
                    pos[1] = j;
                    break;
                }
            }
            if (pos[0] !== -1 || pos[1] !== -1) {
                break;
            }
        }
        if (pos[0] === -1 || pos[1] === -1) {
            throw new Error("Vehicle not found in the crossing");
        }
        crossing.lanes[pos[0]][pos[1]] = null;
        const buffer: Buffer = Buffer.from(JSON.stringify(crossing));
        await ctx.stub.putState(crossingId, buffer); 
    }

    @Transaction()
    @Returns('boolean')
    public async permissionToCrossTrain(ctx: Context, crossingId: string, timeout: number, trainId: string): Promise<boolean> {
        let crossing = await this.readCrossing(ctx, crossingId);
        let train = await this.readTrain(ctx, trainId);

        // If another train interacted with the crossing, it is or will be occupied by it
        if (crossing.status !== CrossingStatus.FREE_TO_CROSS) {
            train.status = TrainStatus.STOP;
            const buffer = Buffer.from(JSON.stringify(train));
            await ctx.stub.putState(trainId, buffer);
            
            return false;
        }
        else {
            crossing.status = CrossingStatus.WILL_BE_LOCKED;
            let buffer: Buffer = Buffer.from(JSON.stringify(crossing));
            await ctx.stub.putState(crossingId, buffer);

            train.status = TrainStatus.CAUTION;
            buffer = Buffer.from(JSON.stringify(train));
            await ctx.stub.putState(trainId, buffer);

            let baseTime = Math.floor(Date.now() / 1000);
            let currentTime = baseTime;
            let success = false;

            while (currentTime - baseTime < timeout && !success) {
                crossing = await this.readCrossing(ctx, crossingId);
                train = await this.readTrain(ctx, trainId);

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
                    buffer = Buffer.from(JSON.stringify(crossing));
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
            return success;
            //crossing.tryToClose(ctx, crossingId, trainId, train, timeout);
            return true;
        }
    }

    @Transaction()
    public async permissionReleaseTrain(ctx: Context, crossingId: string, trainId: string): Promise<void> {
        const crossing = await this.readCrossing(ctx, crossingId);
        if (crossing.status === CrossingStatus.LOCKED) {
            const train = await this.readTrain(ctx, trainId);
            if (train.status === TrainStatus.CROSSING) {

                crossing.status = CrossingStatus.FREE_TO_CROSS;
                let buffer: Buffer = Buffer.from(JSON.stringify(crossing));
                await ctx.stub.putState(crossingId, buffer); 

                train.status = TrainStatus.GO;
                buffer = Buffer.from(JSON.stringify(train));
                await ctx.stub.putState(trainId, buffer);
            }
        }
    }


    @Transaction()
    public async createVehicle(ctx: Context, vehicleId: string, licensePlate: string): Promise<void> {
        const exists: boolean = await this.vehicleExists(ctx, vehicleId);
        if (exists) {
            throw new Error(`The vehicle ${vehicleId} already exists`);
        }

        const vehicle: Vehicle = new Vehicle();
        vehicle.licensePlate = licensePlate;

        const buffer: Buffer = Buffer.from(JSON.stringify(vehicle));
        await ctx.stub.putState(vehicleId, buffer);
    }

    @Transaction()
    public async deleteVehicle(ctx: Context, vehicleId: string): Promise<void> {
        const exists: boolean = await this.crossingExists(ctx, vehicleId);
        if (!exists) {
            throw new Error(`The vehicle ${vehicleId} does not exist`);
        }
        await ctx.stub.deleteState(vehicleId);
    }

    @Transaction(false)
    @Returns('Vehicle')
    public async readVehicle(ctx: Context, vehicleId: string): Promise<Vehicle> {
        const exists: boolean = await this.vehicleExists(ctx, vehicleId);
        if (!exists) {
            throw new Error(`The vehicle ${vehicleId} does not exist`);
        }
        const data: Uint8Array = await ctx.stub.getState(vehicleId);
        const vehicle: Vehicle = JSON.parse(data.toString()) as Vehicle;

        return vehicle;
    }

    @Transaction()
    public async createTrain(ctx: Context, trainId: string, status: TrainStatus): Promise<void> {
        const exists: boolean = await this.trainExists(ctx, trainId);
        if (exists) {
            throw new Error(`The train ${trainId} already exists`);
        }

        const train: Train = new Train();
        train.status = status;

        const buffer: Buffer = Buffer.from(JSON.stringify(train));
        await ctx.stub.putState(trainId, buffer);
    }

    @Transaction()
    public async deleteTrain(ctx: Context, trainId: string): Promise<void> {
        const exists: boolean = await this.trainExists(ctx, trainId);
        if (!exists) {
            throw new Error(`The train ${trainId} does not exist`);
        }
        await ctx.stub.deleteState(trainId);
    }

    @Transaction(false)
    @Returns('Vehicle')
    public async readTrain(ctx: Context, trainId: string): Promise<Train> {
        const exists: boolean = await this.vehicleExists(ctx, trainId);
        if (!exists) {
            throw new Error(`The train ${trainId} does not exist`);
        }
        const data: Uint8Array = await ctx.stub.getState(trainId);
        const train: Train = JSON.parse(data.toString()) as Train;

        return train;
    }
}
