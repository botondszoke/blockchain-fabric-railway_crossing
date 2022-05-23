/*
 * SPDX-License-Identifier: Apache-2.0
 */

import { Context } from 'fabric-contract-api';
import { ChaincodeStub, ClientIdentity } from 'fabric-shim';
import { CrossingContract } from './';

import * as chai from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import * as sinon from 'sinon';
import * as sinonChai from 'sinon-chai';
import { CrossingStatus, Crossing } from './crossing';
import winston = require('winston');
// import { should } from 'chai';

chai.should();
chai.use(chaiAsPromised);
chai.use(sinonChai);

class TestContext implements Context {
    public stub: sinon.SinonStubbedInstance<ChaincodeStub> = sinon.createStubInstance(ChaincodeStub);
    public clientIdentity: sinon.SinonStubbedInstance<ClientIdentity> = sinon.createStubInstance(ClientIdentity);
    public logging = {
        getLogger: sinon.stub().returns(sinon.createStubInstance(winston.createLogger().constructor)),
        setLevel: sinon.stub(),
     };
}

describe('CrossingContract', () => {

    let contract: CrossingContract;
    let ctx: TestContext;
    let date: number;

    beforeEach(() => {
        contract = new CrossingContract();
        ctx = new TestContext();
        date = Math.floor(Date.now() /1000);
        ctx.stub.getState.withArgs('1001').resolves(Buffer.from(`{"status":"FreeToCross", "timeOfUpdate": ${date}, "validityTime": "123456789", "lanes": [[false]]}`));
        ctx.stub.getState.withArgs('10002').resolves(Buffer.from(`{"status":"FreeToCross", "timeOfUpdate": ${date}, "validityTime": "123456789", "lanes": [[true]]}`));
        ctx.stub.getState.withArgs('10003').resolves(Buffer.from(`{"status":"Locked", "timeOfUpdate": ${date}, "validityTime": "123456789", "lanes": [[false]]}`));
        ctx.stub.getState.withArgs('101').resolves(Buffer.from('{"status": "Go", "timeOfRequest": -1, "timeout":90}'));
        ctx.stub.getState.withArgs('102').resolves(Buffer.from('{"status": "Go", "timeOfRequest": -1, "timeout":0}'));
        ctx.stub.getState.withArgs('104').resolves(Buffer.from('{"status": "InCrossing", "timeOfRequest": -1, "timeout":90}'));
    });

    describe('#crossingExists', () => {

        it('should return crossing', async ()=> {
            await contract.crossingExists(ctx, '1001').should.eventually.be.true;
        });

        it('should return false for a crossing that does not exist', async () => {
            await contract.crossingExists(ctx, '1003').should.eventually.be.false;
        });

    });

    describe('#trainExists', () => {

        it('should return train', async ()=> {
            await contract.trainExists(ctx, '101').should.eventually.be.true;
        });

        it('should return false for a train that does not exist', async () => {
            await contract.trainExists(ctx, '103').should.eventually.be.false;
        });

    });

    describe('#createCrossing', () => {

        it('should return crossing', async ()=> {
            ctx.clientIdentity.getMSPID.returns('RailwayCompanyMSP');
            ctx.clientIdentity.assertAttributeValue.withArgs('role', 'infraController').returns(true);
            ctx.stub.getDateTimestamp.returns(new Date(Date.now()));
            await contract.createCrossing(ctx, '1002', CrossingStatus.FREE_TO_CROSS, 20, 1, 1).should.eventually.fulfilled;
        });

        it('should return error for a crossing that already exists', async () => {
            ctx.clientIdentity.getMSPID.returns('RailwayCompanyMSP');
            ctx.clientIdentity.assertAttributeValue.withArgs('role', 'infraController').returns(true);
            ctx.stub.getDateTimestamp.returns(new Date(Date.now()));
            await contract.createCrossing(ctx, '1001', CrossingStatus.FREE_TO_CROSS, 20, 1, 1).should.be.rejectedWith(/The crossing 1001 already exists/);
        });

        it('should return error for a crossing with wrong lane number', async () => {
            ctx.clientIdentity.getMSPID.returns('RailwayCompanyMSP');
            ctx.clientIdentity.assertAttributeValue.withArgs('role', 'infraController').returns(true);
            ctx.stub.getDateTimestamp.returns(new Date(Date.now()));
            await contract.createCrossing(ctx, '1002', CrossingStatus.FREE_TO_CROSS, 20, 0, 1).should.be.rejectedWith(/At least 1 lane is needed/);
        });

        it('should return error for a crossing with wrong lane capacity', async () => {
            ctx.clientIdentity.getMSPID.returns('RailwayCompanyMSP');
            ctx.clientIdentity.assertAttributeValue.withArgs('role', 'infraController').returns(true);
            ctx.stub.getDateTimestamp.returns(new Date(Date.now()));
            await contract.createCrossing(ctx, '1002', CrossingStatus.FREE_TO_CROSS, 20, 1, 0).should.be.rejectedWith(/Lane capacity should be at least 1/);
        });

    });

    describe('#permissionToCrossVehicle', () => {
        it('should grant permission with FREE TO CROSS status and enough space', async ()=> {

            // Init crossing
            ctx.stub.getDateTimestamp.returns(new Date(Date.now()));

            const crossing: Crossing = await contract.readCrossing(ctx,'1001');
            ctx.clientIdentity.getMSPID.returns('VehiclesMSP');
            ctx.clientIdentity.assertAttributeValue.withArgs('licensePlate', null).returns(false);
            ctx.clientIdentity.getAttributeValue.withArgs('licensePlate').returns('ABC123');

            const result = await contract.permissionToCrossVehicle(ctx, '1001');
            ctx.stub.putPrivateData.should.have.been.calledOnceWithExactly('RailwayPrivateCollection','ABC123', Buffer.from(JSON.stringify([0, 0])));
            ctx.stub.putState.should.have.been.calledWith('1001', Buffer.from(`{"status":"FreeToCross","timeOfUpdate":${crossing.timeOfUpdate},"validityTime":"123456789","lanes":[[true]]}`));
            result[0].should.equal(0);
            result[1].should.equal(0);
        });

        it('should not grant permission with not enough space', async ()=> {

            // Init crossing
            ctx.stub.getDateTimestamp.returns(new Date(Date.now()));

            ctx.clientIdentity.getMSPID.returns('VehiclesMSP');
            ctx.clientIdentity.assertAttributeValue.withArgs('licensePlate', null).returns(false);
            ctx.clientIdentity.getAttributeValue.withArgs('licensePlate').returns('ABC123');

            const result = await contract.permissionToCrossVehicle(ctx, '10002');
            ctx.stub.putState.callCount.should.be.equal(0);
            ctx.stub.putPrivateData.callCount.should.be.equal(0);
            result[0].should.equal(-1);
            result[1].should.equal(-1);
        });

        it('should not grant permission if status is not FREE TO CROSS', async ()=> {

            // Init crossing
            ctx.stub.getDateTimestamp.returns(new Date(Date.now()));

            ctx.clientIdentity.getMSPID.returns('VehiclesMSP');
            ctx.clientIdentity.assertAttributeValue.withArgs('licensePlate', null).returns(false);
            ctx.clientIdentity.getAttributeValue.withArgs('licensePlate').returns('ABC123');

            const result = await contract.permissionToCrossVehicle(ctx, '10003');
            ctx.stub.putState.callCount.should.be.equal(0);
            ctx.stub.putPrivateData.callCount.should.be.equal(0);
            result[0].should.equal(-1);
            result[1].should.equal(-1);
        });

        it('should not allow method, if not vehicle', async ()=> {

            ctx.clientIdentity.getMSPID.returns('RailwayCompanyMSP');

            await contract.permissionToCrossVehicle(ctx, '10003').should.be.rejectedWith(/You do not have permission to execute this operation./);
        });
    });

    describe('#permissionToCrossTrain', () => {
        it('should not allow method, if not from RailwayCompany', async ()=> {
            ctx.clientIdentity.getMSPID.returns('VehiclesMSP');
            await contract.permissionToCrossTrain(ctx, '1001', '101').should.be.rejectedWith(/You do not have permission to execute this operation./);
        });

        it('should not grant permission, if another train interacted with the crossing', async ()=> {
            ctx.stub.getDateTimestamp.returns(new Date(Date.now()));
            ctx.clientIdentity.getMSPID.returns('RailwayCompanyMSP');

            await contract.permissionToCrossTrain(ctx, '10003', '101');
            ctx.stub.putState.should.have.been.calledWith('101', Buffer.from('{"status":"Stop","timeOfRequest":-1,"timeout":90}'));
        });

        it('should change crossing and train, if permission probably will be given', async ()=> {
            ctx.stub.getDateTimestamp.returns(new Date(Date.now()));
            ctx.clientIdentity.getMSPID.returns('RailwayCompanyMSP');
            const crossing: Crossing = await contract.readCrossing(ctx,'10002');
            await contract.permissionToCrossTrain(ctx, '10002', '101');
            ctx.stub.putState.should.have.been.calledWith('101', Buffer.from(`{"status":"Caution","timeOfRequest":${date},"timeout":90}`));
            ctx.stub.putState.should.have.been.calledWith('10002', Buffer.from(`{"status":"WillBeLocked","timeOfUpdate":${crossing.timeOfUpdate},"validityTime":"123456789","lanes":[[true]]}`));
        });

        it('should stop train and free crossing, if permission was denied because of timeout', async ()=> {
            ctx.stub.getDateTimestamp.returns(new Date(Date.now()));
            ctx.clientIdentity.getMSPID.returns('RailwayCompanyMSP');
            const crossing: Crossing = await contract.readCrossing(ctx,'10002');
            await contract.permissionToCrossTrain(ctx, '10002', '102');
            ctx.stub.putState.should.have.been.calledWith('102', Buffer.from(`{"status":"Stop","timeOfRequest":${date},"timeout":0}`));
            ctx.stub.putState.should.have.been.calledWith('10002', Buffer.from(`{"status":"FreeToCross","timeOfUpdate":${crossing.timeOfUpdate},"validityTime":"123456789","lanes":[[true]]}`));
        });

        it('should grant permission, if crossing is empty and FREE TO CROSS', async ()=> {
            ctx.stub.getDateTimestamp.returns(new Date(Date.now()));
            ctx.clientIdentity.getMSPID.returns('RailwayCompanyMSP');
            const crossing: Crossing = await contract.readCrossing(ctx,'1001');
            await contract.permissionToCrossTrain(ctx, '1001', '101');
            ctx.stub.putState.should.have.been.calledWith('101', Buffer.from(`{"status":"InCrossing","timeOfRequest":${date},"timeout":90}`));
            ctx.stub.putState.should.have.been.calledWith('1001', Buffer.from(`{"status":"Locked","timeOfUpdate":${crossing.timeOfUpdate},"validityTime":"123456789","lanes":[[false]]}`));
        });
    });

    describe('#permissionReleaseVehicle', () => {
        it('should not allow method, if not vehicle', async ()=> {
            ctx.clientIdentity.getMSPID.returns('RailwayCompanyMSP');
            await contract.permissionReleaseVehicle(ctx, '1001', 0, 0).should.be.rejectedWith(/You do not have permission to execute this operation./);
        });

        it('should not allow method for invalid position', async ()=> {
            ctx.clientIdentity.getMSPID.returns('VehiclesMSP');
            ctx.clientIdentity.assertAttributeValue.withArgs('licensePlate', null).returns(false);
            ctx.clientIdentity.getAttributeValue.withArgs('licensePlate').returns('ABC123');
            ctx.stub.getDateTimestamp.returns(new Date(Date.now()));

            await contract.permissionReleaseVehicle(ctx, '1001', 0, 0).should.be.rejectedWith(/Invalid position given./);
            await contract.permissionReleaseVehicle(ctx, '1001', -1, 0).should.be.rejectedWith(/Invalid position given./);
            await contract.permissionReleaseVehicle(ctx, '1001', 0, -1).should.be.rejectedWith(/Invalid position given./);
            await contract.permissionReleaseVehicle(ctx, '1001', 1, 0).should.be.rejectedWith(/Invalid position given./);
            await contract.permissionReleaseVehicle(ctx, '1001', 0, 1).should.be.rejectedWith(/Invalid position given./);
        });

        it('should release permission with good parameters', async ()=> {
            ctx.clientIdentity.getMSPID.returns('VehiclesMSP');
            ctx.clientIdentity.assertAttributeValue.withArgs('licensePlate', null).returns(false);
            ctx.clientIdentity.getAttributeValue.withArgs('licensePlate').returns('ABC123');
            ctx.stub.getDateTimestamp.returns(new Date(Date.now()));

            const crossing: Crossing = await contract.readCrossing(ctx,'1001');
            await contract.permissionReleaseVehicle(ctx, '10002', 0, 0);
            ctx.stub.putState.should.have.been.calledWith('10002', Buffer.from(`{"status":"FreeToCross","timeOfUpdate":${crossing.timeOfUpdate},"validityTime":"123456789","lanes":[[false]]}`));
            ctx.stub.putPrivateData.should.have.been.calledOnceWithExactly('RailwayPrivateCollection','ABC123', Buffer.from(JSON.stringify([0, 0, -1])));
        });
    });

    describe('#permissionReleaseTrain', () => {
        it('should not allow method, if not from RailwayCompany', async ()=> {
            ctx.clientIdentity.getMSPID.returns('VehiclesMSP');
            await contract.permissionReleaseTrain(ctx, '1001', '101').should.be.rejectedWith(/You do not have permission to execute this operation./);
        });

        it('cannot release if the crossing is not locked', async ()=> {
            ctx.stub.getDateTimestamp.returns(new Date(Date.now()));
            ctx.clientIdentity.getMSPID.returns('RailwayCompanyMSP');

            await contract.permissionReleaseTrain(ctx, '10002', '101');
            ctx.stub.putState.callCount.should.be.equal(0);
        });

        it('cannot release if the train is not in crossing', async ()=> {
            ctx.stub.getDateTimestamp.returns(new Date(Date.now()));
            ctx.clientIdentity.getMSPID.returns('RailwayCompanyMSP');

            await contract.permissionReleaseTrain(ctx, '10003', '101');
            ctx.stub.putState.callCount.should.be.equal(0);
        });

        it('releases permission if everything is ok', async ()=> {
            ctx.stub.getDateTimestamp.returns(new Date(Date.now()));
            ctx.clientIdentity.getMSPID.returns('RailwayCompanyMSP');
            const crossing: Crossing = await contract.readCrossing(ctx,'10003');
            await contract.permissionReleaseTrain(ctx, '10003', '104');
            ctx.stub.putState.should.have.been.calledWith('104', Buffer.from(`{"status":"Go","timeOfRequest":-1,"timeout":90}`));
            ctx.stub.putState.should.have.been.calledWith('10003', Buffer.from(`{"status":"FreeToCross","timeOfUpdate":${crossing.timeOfUpdate},"validityTime":"123456789","lanes":[[false]]}`));
        });
    });
});
