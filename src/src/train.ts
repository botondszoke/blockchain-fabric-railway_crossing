import { Object, Property } from 'fabric-contract-api';

export enum TrainStatus {
    GO = 'Go',
    CAUTION = 'Caution',
    IN_CROSSING = 'InCrossing',
    STOP = 'Stop'
}

@Object()
export class Train {

    @Property()
    public status: TrainStatus;

    @Property()
    public timeOfRequest: number;

    @Property()
    public timeout: number;
}