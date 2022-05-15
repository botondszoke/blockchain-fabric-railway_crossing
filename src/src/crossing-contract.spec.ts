/*
 * SPDX-License-Identifier: Apache-2.0
 */

import { Context } from 'fabric-contract-api';
import { ChaincodeStub, ClientIdentity } from 'fabric-shim';
import { CrossingContract } from '.';

import * as chai from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import * as sinon from 'sinon';
import * as sinonChai from 'sinon-chai';
import { CrossingStatus } from './crossing';
import winston = require('winston');
//import { should } from 'chai';

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

    beforeEach(() => {
        contract = new CrossingContract();
        ctx = new TestContext();
        ctx.stub.getState.withArgs('1001').resolves(Buffer.from('{"value":"crossing 1001 value"}'));
        ctx.stub.getState.withArgs('1002').resolves(Buffer.from('{"value":"crossing 1002 value"}'));
    });

    describe('#permissionReleaseVehicle', () => {

        it('should return false if vehicle does not exist', async () => {
            await contract.permissionReleaseVehicle(ctx, '1001').should.be.rejectedWith(/Vehicle not found/);
        });

        /*it('should return false for a crossing that does not exist', async () => {
            await contract.crossingExists(ctx, '1003').should.eventually.be.false;
        });*/

    });

    describe('#crossingExists', () => {

        it('should return crossing', async ()=> {
            await contract.crossingExists(ctx, '1001').should.eventually.be.true;
        }); 

        it('should return false for a crossing that does not exist', async () => {
            await contract.crossingExists(ctx, '1003').should.eventually.be.false;
        });

    });

    describe('#createCrossing', () => {

        it('should create a crossing', async () => {
            await contract.createCrossing(ctx, '1003', CrossingStatus.FREE_TO_CROSS,1000000,1);
            ctx.stub.putState.should.have.been.calledOnceWithExactly('1003', Buffer.from('{"status":"FreeToCross", "validityTime":1000000,"laneCapacities":[1]}'));
        });

        /*it('should throw an error for a crossing that already exists', async () => {
            await contract.createCrossing(ctx, '1001', 'myvalue').should.be.rejectedWith(/The crossing 1001 already exists/);
        });*/

    });

    describe('#readCrossing', () => {

        /*it('should return a crossing', async () => {
            await contract.readCrossing(ctx, '1001').should.eventually.deep.equal({ value: 'crossing 1001 value' });
        });

        it('should throw an error for a crossing that does not exist', async () => {
            await contract.readCrossing(ctx, '1003').should.be.rejectedWith(/The crossing 1003 does not exist/);
        });*/

    });

    describe('#updateCrossing', () => {

        /*it('should update a crossing', async () => {
            await contract.updateCrossing(ctx, '1001', 'crossing 1001 new value');
            ctx.stub.putState.should.have.been.calledOnceWithExactly('1001', Buffer.from('{"value":"crossing 1001 new value"}'));
        });

        it('should throw an error for a crossing that does not exist', async () => {
            await contract.updateCrossing(ctx, '1003', 'crossing 1003 new value').should.be.rejectedWith(/The crossing 1003 does not exist/);
        });*/

    });

    describe('#deleteCrossing', () => {

        it('should delete a crossing', async () => {
            await contract.deleteCrossing(ctx, '1001');
            ctx.stub.deleteState.should.have.been.calledOnceWithExactly('1001');
        });

        it('should throw an error for a crossing that does not exist', async () => {
            await contract.deleteCrossing(ctx, '1003').should.be.rejectedWith(/The crossing 1003 does not exist/);
        });

    });

});
