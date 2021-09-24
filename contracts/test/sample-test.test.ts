const { expect } = require("chai");
const { ethers } = require("hardhat");

let owner;

describe("PhantomRisk", function () {
  it("Should return the new greeting once it's changed", async function () {
    [owner] = await ethers.getSigners();
    const pleb = await(await (await ethers.getContractFactory("Pleb")).deploy()).deployed();
    const factory = await ethers.getContractFactory("PhantomRisk");
    const contract = await factory.deploy(pleb.address);
    await contract.deployed();
  });
});
