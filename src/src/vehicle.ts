import { Object, Property } from "fabric-contract-api";

@Object()
export class Vehicle {

    @Property()
    public licensePlate: string;

}