const { expect } = require("chai");
const { ethers } = require("hardhat");

let owner;

describe("Greeter", function () {
  it("Should return the new greeting once it's changed", async function () {
    [owner] = await ethers.getSigners();
    const factory = await ethers.getContractFactory("PhantomRisk");
    const contract = await factory.deploy();
    await contract.deployed();

    await contract.connect(owner).addTester();
    console.log((await contract.connect(owner).viewTester()).toString())
    await contract.connect(owner).deleteTester();
    console.log((await contract.connect(owner).viewTester()).toString())

  });
});
