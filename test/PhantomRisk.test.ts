import { expect } from "chai";
import { ethers, network, waffle } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { PhantomRisk, Pleb } from "../typechain";
import { parseEther } from "@ethersproject/units";
import { Contract } from "@ethersproject/contracts";

enum Faction {
  Red,
  Blue,
  Green,
  Yellow,
}

let owner: SignerWithAddress,
  player1: SignerWithAddress,
  player2: SignerWithAddress,
  player3: SignerWithAddress,
  player4: SignerWithAddress,
  player5: SignerWithAddress;

let pleb: Pleb;
let risk: PhantomRisk;

//TODO create helper contract
//TODO deal with region setting
//TODO create updated staking model (mapping(bytes32 => mapping(address => uint256)))
//TODO how to claim ftm from tickets

describe("PhantomRisk", function () {
  beforeEach(async () => {
    [owner, player1, player2, player3, player4, player5] =
      await ethers.getSigners();
    //TODO send everyone a balance
    console.log(
      await (await ethers.provider.getBalance(player1.address)).toString()
    );
    pleb = await (
      await (await ethers.getContractFactory("Pleb")).deploy()
    ).deployed();
    risk = await (
      await (
        await ethers.getContractFactory("PhantomRisk")
      ).deploy(pleb.address)
    ).deployed();
  });
  context("deploys with correct values", function () {
    it("sets correct pleb address", async function () {
      expect(await risk.pleb()).to.be.equal(pleb.address);
    });
  });
  context("join game", function () {
    let result: any;
    context("happy case", () => {
      beforeEach(async () => {
        result = await risk
          .connect(player1)
          .joinGame({ value: parseEther("10") });
      });

      it("takes a fee", async function () {
        expect(await ethers.provider.getBalance(player1.address)).to.be.equal(
          0
        );
        expect(await ethers.provider.getBalance(risk.address)).to.be.equal(
          parseEther("10")
        );
      });
      it("asigns the player a faction", async function () {
        expect(await risk.player(player1.address)).to.be.equal(Faction.Red);
      });
      it("mints the starting amount of pleb", async function () {
        expect(await pleb.balanceOf(player1.address)).to.be.equal(1000);
      });
      it("emits an event", async function () {
        expect(result)
          .to.emit(risk, "JoinedGame")
          .withArgs(player1.address, Faction.Red);
      });
      it("asigns the next player the next faction", async function () {
        await risk.connect(player2).joinGame({ value: parseEther("10") });
        expect(await risk.player(player2.address)).to.be.equal(Faction.Blue);
        await risk.connect(player3).joinGame({ value: parseEther("10") });
        await risk.connect(player4).joinGame({ value: parseEther("10") });
        await risk.connect(player5).joinGame({ value: parseEther("10") });
        expect(await risk.player(player5.address)).to.be.equal(Faction.Red);
      });
      it("skips a faction when they got eliminated", async function () {
        //TODO ...
      });
    });
    context("error case", () => {
      it("reverts when the paid amount is not high enough", async function () {
        await expect(risk.connect(player1).joinGame()).to.be.revertedWith(
          "you didnt pay enough"
        );
      });
    });
  });
  context("deploy worker", function () {
    let result: any;
    context("happy case", () => {
      beforeEach(async () => {
        result = await risk
          .connect(player1)
          .joinGame({ value: parseEther("10") });
      });
    });
    context("error case", () => {
      it("reverts when the paid amount is not high enough", async function () {
        await expect(risk.connect(player1).joinGame()).to.be.revertedWith(
          "you didnt pay enough"
        );
      });
    });
  });
  context("deploy garrison", function () {
    let result: any;
    context("happy case", () => {
      beforeEach(async () => {
        result = await risk
          .connect(player1)
          .joinGame({ value: parseEther("10") });
      });
    });
    context("error case", () => {
      it("reverts when the paid amount is not high enough", async function () {
        await expect(risk.connect(player1).joinGame()).to.be.revertedWith(
          "you didnt pay enough"
        );
      });
    });
  });
  context("claim pleb", function () {
    let result: any;
    context("happy case", () => {
      beforeEach(async () => {
        result = await risk
          .connect(player1)
          .joinGame({ value: parseEther("10") });
      });
    });
    context("error case", () => {
      it("reverts when the paid amount is not high enough", async function () {
        await expect(risk.connect(player1).joinGame()).to.be.revertedWith(
          "you didnt pay enough"
        );
      });
    });
  });
  context("attack", function () {
    let result: any;
    context("happy case", () => {
      beforeEach(async () => {
        result = await risk
          .connect(player1)
          .joinGame({ value: parseEther("10") });
      });
    });
    context("error case", () => {
      it("reverts when the paid amount is not high enough", async function () {
        await expect(risk.connect(player1).joinGame()).to.be.revertedWith(
          "you didnt pay enough"
        );
      });
    });
  });
  context("resolve Siege", function () {
    let result: any;
    context("happy case", () => {
      beforeEach(async () => {
        result = await risk
          .connect(player1)
          .joinGame({ value: parseEther("10") });
      });
    });
    context("error case", () => {
      it("reverts when the paid amount is not high enough", async function () {
        await expect(risk.connect(player1).joinGame()).to.be.revertedWith(
          "you didnt pay enough"
        );
      });
    });
  });
  context("claim fees", function () {
    let result: any;
    context("happy case", () => {
      beforeEach(async () => {
        result = await risk
          .connect(player1)
          .joinGame({ value: parseEther("10") });
      });
    });
    context("error case", () => {
      it("reverts when the paid amount is not high enough", async function () {
        await expect(risk.connect(player1).joinGame()).to.be.revertedWith(
          "you didnt pay enough"
        );
      });
    });
  });
  context("setter", function () {
    let result: any;
    context("happy case", () => {
      beforeEach(async () => {
        result = await risk
          .connect(player1)
          .joinGame({ value: parseEther("10") });
      });
    });
    context("error case", () => {
      it("reverts when the paid amount is not high enough", async function () {
        await expect(risk.connect(player1).joinGame()).to.be.revertedWith(
          "you didnt pay enough"
        );
      });
    });
  });
});
