import { Object, Property } from "fabric-contract-api";

export enum TrainStatus {
    GO = "Go",
    CAUTION = "Caution",
    CROSSING = "Crossing",
    STOP = "Stop"
}

@Object()
export class Train {

    @Property()
    public status: TrainStatus;

}