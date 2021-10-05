import { Contract, ContractTransaction } from "@ethersproject/contracts";
import { expect } from "chai";

export async function expectRevert(
  call: any,
  revertReason: string
): Promise<Chai.AsyncAssertion> {
  return expect(call).to.be.revertedWith(revertReason);
}

export async function expectEvent(
  call: ContractTransaction,
  contract: Contract,
  event: string,
  params: any[]
): Promise<Chai.AsyncAssertion> {
  return expect(call)
    .to.emit(contract, event)
    .withArgs(...params);
}

export async function expectNoEvent(
  call: ContractTransaction,
  contract: Contract,
  event: string
): Promise<Chai.AsyncAssertion> {
  return expect(call).to.not.emit(contract, event);
}