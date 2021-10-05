import { expect } from "chai";
import { ethers, network, waffle } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { PhantomRiskV1, PhantomRiskV1Helper, Pleb } from "../typechain";
import { parseEther } from "@ethersproject/units";
import { Contract } from "@ethersproject/contracts";
import { BigNumber } from "@ethersproject/bignumber";
import { utils } from "ethers";
import {
  expectEvent,
  expectNoEvent,
  expectRevert,
} from "../scripts/expectResults";
import { exec } from "child_process";

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
let risk: PhantomRiskV1Helper;
const MINTER_ROLE = ethers.utils.id("MINTER_ROLE");
const HOUR_IN_SEC = 3600;
const DAY_IN_SEC = 86400;

async function createGame(): Promise<void> {
  await risk.connect(owner).setRegionTiers([
    { workerLimit: 1500, requiredGarrison: 0, plebPerSec: 1000 },
    { workerLimit: 3000, requiredGarrison: 1000, plebPerSec: 2000 },
    { workerLimit: 5000, requiredGarrison: 2000, plebPerSec: 4000 },
    { workerLimit: 10000, requiredGarrison: 3000, plebPerSec: 8000 },
    { workerLimit: 15000, requiredGarrison: 4000, plebPerSec: 16000 },
  ]);
  await risk.connect(owner).createRegions(
    [0, 1, 2, 3, 4],
    [0, 1, 2, 0, 1],
    [0, 0, 0, 1, 1],
    [
      [1, 3, 4],
      [0, 2, 3, 4],
      [1, 4],
      [0, 1, 4],
      [0, 1, 2, 3],
    ],
    [0, 0, 0, 0, 0],
    [50, 50, 50, 50, 50],
    [Faction.Red, Faction.Red, Faction.Red, Faction.Blue, Faction.Green],
    [0, 0, 0, 0, 0]
  );
  await risk.connect(player1).joinGame({ value: parseEther("10") });
  await risk.connect(player2).joinGame({ value: parseEther("10") });
  await risk.connect(player3).joinGame({ value: parseEther("10") });
  await risk.connect(player4).joinGame({ value: parseEther("10") });
  await risk.connect(player5).joinGame({ value: parseEther("10") });

  await pleb.connect(player1).approve(risk.address, parseEther("1000"));
  await pleb.connect(player2).approve(risk.address, parseEther("1000"));
  await pleb.connect(player3).approve(risk.address, parseEther("1000"));
  await pleb.connect(player4).approve(risk.address, parseEther("1000"));
  await pleb.connect(player5).approve(risk.address, parseEther("1000"));
}

async function conquerRegion(): Promise<void> {
  await risk.connect(player1).attack(3, 0, 51);
  const block = await waffle.provider.getBlock("latest");
  await waffle.provider.send("evm_mine", [block.timestamp + 3 * DAY_IN_SEC]);
  await risk.resolveSiege(3);
}

describe("PhantomRiskV1", function () {
  beforeEach(async () => {
    [owner, player1, player2, player3, player4, player5] =
      await ethers.getSigners();
    pleb = await (
      await (await ethers.getContractFactory("Pleb")).deploy()
    ).deployed();
    risk = await (
      await (
        await ethers.getContractFactory("PhantomRiskV1Helper")
      ).deploy(pleb.address, owner.address)
    ).deployed();
    await pleb.grantRole(MINTER_ROLE, risk.address);
  });
  describe("deploys with correct values", function () {
    it("sets correct pleb address", async function () {
      expect(await risk.pleb()).to.be.equal(pleb.address);
    });
    it("sets `ticketRevenueRecipient` to be `owner`", async () => {
      expect(await risk.ticketRevenueRecipient()).to.be.equal(owner.address);
    });
    it("sets `settings` to default vaules", async () => {
      expect(await risk.settings()).to.deep.equal([
        parseEther("10"),
        BigNumber.from(String(8 * HOUR_IN_SEC)),
        BigNumber.from(String(DAY_IN_SEC)),
        BigNumber.from(String(4 * DAY_IN_SEC)),
        BigNumber.from(String(3)),
        BigNumber.from(String(2)),
        BigNumber.from(String(2)),
      ]);
    });
  });
  context("setter", function () {
    context("happy case", () => {
      it("sets the settings", async () => {
        const result = await risk
          .connect(owner)
          .setSettings(
            parseEther("1"),
            4 * HOUR_IN_SEC,
            12 * HOUR_IN_SEC,
            2 * DAY_IN_SEC,
            1,
            4,
            4
          );
        expectEvent(result, risk, "SettingsChanged", [
          [
            parseEther("10"),
            BigNumber.from(String(8 * HOUR_IN_SEC)),
            BigNumber.from(String(DAY_IN_SEC)),
            BigNumber.from(String(4 * DAY_IN_SEC)),
            BigNumber.from(String(3)),
            BigNumber.from(String(2)),
            BigNumber.from(String(2)),
          ],
          [
            parseEther("1"),
            BigNumber.from(String(4 * HOUR_IN_SEC)),
            BigNumber.from(String(12 * HOUR_IN_SEC)),
            BigNumber.from(String(2 * DAY_IN_SEC)),
            BigNumber.from(String(1)),
            BigNumber.from(String(4)),
            BigNumber.from(String(4)),
          ],
        ]);
        expect(await risk.connect(owner).settings()).to.deep.equal([
          parseEther("1"),
          BigNumber.from(String(4 * HOUR_IN_SEC)),
          BigNumber.from(String(12 * HOUR_IN_SEC)),
          BigNumber.from(String(2 * DAY_IN_SEC)),
          BigNumber.from(String(1)),
          BigNumber.from(String(4)),
          BigNumber.from(String(4)),
        ]);
      });
      it("sets the region tiers", async () => {
        await risk.connect(owner).setRegionTiers([
          { workerLimit: 0, requiredGarrison: 0, plebPerSec: 0 },
          { workerLimit: 0, requiredGarrison: 0, plebPerSec: 0 },
          { workerLimit: 0, requiredGarrison: 0, plebPerSec: 0 },
          { workerLimit: 0, requiredGarrison: 0, plebPerSec: 0 },
          { workerLimit: 0, requiredGarrison: 0, plebPerSec: 0 },
        ]);
        expect(await risk.connect(owner).regionTiers(0)).to.deep.equal([
          BigNumber.from("0"),
          BigNumber.from("0"),
          BigNumber.from("0"),
        ]);
        expect(await risk.connect(owner).regionTiers(4)).to.deep.equal([
          BigNumber.from("0"),
          BigNumber.from("0"),
          BigNumber.from("0"),
        ]);
      });
      it("sets regions", async () => {
        await risk
          .connect(owner)
          .createRegions(
            [0, 1, 2, 3],
            [0, 1, 2, 0],
            [0, 0, 0, 1],
            [[1, 3], [0, 2, 3], [1], [0, 1, 2]],
            [0, 0, 0, 0],
            [50, 50, 50, 50],
            [Faction.Red, Faction.Red, Faction.Red, Faction.Blue],
            [0, 0, 0, 0]
          );
        expect(await risk.regionIds(0)).to.equal(0);
        expect(await risk.regionIds(3)).to.equal(3);
        expect(await risk.regions(0)).to.deep.equal([
          0,
          0,
          0,
          0,
          BigNumber.from("50"),
          BigNumber.from("0"),
          Faction.Red,
          false,
          BigNumber.from("0"),
          [0, BigNumber.from("0"), BigNumber.from("0")],
        ]);
        expect(await risk.regions(3)).to.deep.equal([
          3,
          0,
          1,
          0,
          BigNumber.from("50"),
          BigNumber.from("0"),
          Faction.Blue,
          false,
          BigNumber.from("0"),
          [0, BigNumber.from("0"), BigNumber.from("0")],
        ]);
        expect(await risk.regionsPerFaction(Faction.Red)).to.equal(3);
        expect(await risk.regionsPerFaction(Faction.Blue)).to.equal(1);
      });
      it("sets the deployment done", async () => {
        await risk.connect(owner).setDeploymentDone();
        expect(await risk.connect(owner).deploymentDone()).to.be.equal(true);
      });
    });
    context("error case", () => {
      it("is not called by owner", async function () {
        await expect(
          risk
            .connect(player1)
            .setSettings(
              parseEther("1"),
              4 * HOUR_IN_SEC,
              12 * HOUR_IN_SEC,
              2 * DAY_IN_SEC,
              1,
              4,
              4
            )
        ).to.be.revertedWith("Ownable: caller is not the owner");
        await expect(
          risk.connect(player1).setRegionTiers([
            { workerLimit: 0, requiredGarrison: 0, plebPerSec: 0 },
            { workerLimit: 0, requiredGarrison: 0, plebPerSec: 0 },
            { workerLimit: 0, requiredGarrison: 0, plebPerSec: 0 },
            { workerLimit: 0, requiredGarrison: 0, plebPerSec: 0 },
            { workerLimit: 0, requiredGarrison: 0, plebPerSec: 0 },
          ])
        ).to.be.revertedWith("Ownable: caller is not the owner");
        await expect(
          risk.connect(player1).setDeploymentDone()
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });
      it("cant set regions nor region tiers after deploymentDone = true", async () => {
        await risk.connect(owner).setDeploymentDone();
        await expect(
          risk.connect(owner).setDeploymentDone()
        ).to.be.revertedWith("deployment already done");
        await expect(
          risk
            .connect(owner)
            .createRegions([0], [0], [0], [[0]], [0], [0], [0], [0])
        ).to.be.revertedWith("deployment already done");
      });
    });
  });
  describe("join game", function () {
    let prevBalance: BigNumber;
    let result: any;
    context("happy case", () => {
      beforeEach(async () => {
        prevBalance = await ethers.provider.getBalance(player1.address);
        result = await risk
          .connect(player1)
          .joinGame({ value: parseEther("10") });
      });

      it("takes a fee", async function () {
        expect(
          await (
            await ethers.provider.getBalance(player1.address)
          ).lt(prevBalance.sub(parseEther("10")))
        ).to.be.equal(true);
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
        await risk.killFaction(Faction.Red);
        await risk.connect(player1).joinGame({ value: parseEther("10") });
        expect(await risk.player(player1.address)).to.be.equal(Faction.Blue);
      });
      it("overwrites a players faction if they join again", async function () {
        await risk.connect(player1).joinGame({ value: parseEther("10") });
        expect(await risk.player(player1.address)).to.be.equal(Faction.Blue);
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
  describe("deploy worker", function () {
    let result: any;
    let deployTime: number;
    context("happy case", () => {
      beforeEach(async () => {
        await createGame();
        result = await risk.connect(player1).deployWorker(0, 1000);
        deployTime = await (await waffle.provider.getBlock("latest")).timestamp;
      });
      it("emits event", async () => {
        await expectEvent(result, risk, "DeployedWorker", [
          player1.address,
          0,
          1000,
        ]);
      });
      it("reduces players pleb balance and burns token", async () => {
        expect(await pleb.balanceOf(player1.address)).to.equal(0);
        expect(await pleb.balanceOf(risk.address)).to.equal(0);
        expect(await pleb.totalSupply()).to.equal(4000);
      });
      it("adds to worker balance of region", async () => {
        const region = await risk.regions(0);
        expect(region.totalWorker).to.equal(1000);
      });
      it("resolves siege in the region", async () => {
        await risk.setSiege(0, 5, Faction.Blue);
        const block = await waffle.provider.getBlock("latest");
        await waffle.provider.send("evm_mine", [block.timestamp + DAY_IN_SEC]);
        expect(await risk.connect(player5).deployWorker(0, 100)).to.emit(
          risk,
          "ResolvedSiege"
        );
      });
      it("updates the `claimable` and `lastClaimedAt`", async () => {
        expect(
          await risk.getProductionByLord(0, player1.address)
        ).to.deep.equal([
          BigNumber.from("1000"),
          BigNumber.from("0"),
          BigNumber.from(String(deployTime)),
        ]);
      });
    });
    context("error case", () => {
      beforeEach(async () => {
        await createGame();
      });
      it("reverts when the region is besieged", async function () {
        await risk.setSiege(0, 1000, Faction.Green);
        await expectRevert(
          risk.connect(player1).deployWorker(0, 1000),
          "regions must be yours + peaceful"
        );
      });
      it("reverts when the region is not yours", async function () {
        await expectRevert(
          risk.connect(player1).deployWorker(3, 1000),
          "regions must be yours + peaceful"
        );
      });
      it("reverts when the pleb balance is not high enough", async function () {
        await expectRevert(
          risk.connect(player1).deployWorker(0, 1500),
          "not enough pleb"
        );
      });
      it("reverts when a higher region tier is required", async function () {
        await risk.setWorker(0, 1100);
        await expectRevert(
          risk.connect(player1).deployWorker(0, 1000),
          "increase region tier"
        );
      });
    });
  });
  describe("deploy garrison", function () {
    let result: any;
    let deployTime: number;
    context("happy case", () => {
      beforeEach(async () => {
        await createGame();
        await pleb.connect(owner).mint(player1.address, 100);
        await risk.connect(player1).deployWorker(0, 100);
        result = await risk.connect(player1).deployGarrison(0, 1, 500);
        deployTime = await (await waffle.provider.getBlock("latest")).timestamp;
      });
      it("emits event", async () => {
        await expectEvent(result, risk, "DeployedGarrison", [
          player1.address,
          0,
          500,
        ]);
      });
      it("reduces players pleb balance and burns token", async () => {
        expect(await pleb.balanceOf(player1.address)).to.equal(0);
        expect(await pleb.balanceOf(risk.address)).to.equal(0);
        expect(await pleb.totalSupply()).to.equal(4000);
      });
      it("adds to garrison of region", async () => {
        const region = await risk.regions(0);
        expect(region.garrison).to.equal(550);
      });
      it("increases regionTier if `newGarrison` > `requiredGarrison`", async () => {
        const region = await risk.regions(0);
        expect(region.tier).to.equal(1);
      });
      it("allows adding to the garrison of other factions", async () => {
        await pleb.connect(owner).mint(player1.address, 1000);
        await risk.connect(player1).deployGarrison(3, 0, 500);
        const region = await risk.regions(3);
        expect(region.garrison).to.equal(550);
      });
      it("resolves siege in the region", async () => {
        await pleb.connect(owner).mint(player5.address, 200);
        await risk.setSiege(0, 5, Faction.Blue);
        const block = await waffle.provider.getBlock("latest");
        await waffle.provider.send("evm_mine", [block.timestamp + DAY_IN_SEC]);
        expect(await risk.connect(player5).deployGarrison(0, 1, 100)).to.emit(
          risk,
          "ResolvedSiege"
        );
      });
      it("resolves siege in the neigborRegion", async () => {
        await pleb.connect(owner).mint(player5.address, 200);
        await risk.setSiege(1, 5, Faction.Blue);
        const block = await waffle.provider.getBlock("latest");
        await waffle.provider.send("evm_mine", [block.timestamp + DAY_IN_SEC]);
        expect(await risk.connect(player5).deployGarrison(0, 1, 100)).to.emit(
          risk,
          "ResolvedSiege"
        );
      });
      it("updates the `claimable` and `lastClaimedAt`", async () => {
        expect(
          await risk.getProductionByLord(0, player1.address)
        ).to.deep.equal([
          BigNumber.from("100"),
          BigNumber.from("1000"),
          BigNumber.from(String(deployTime)),
        ]);
      });
    });
    context("error case", () => {
      beforeEach(async () => {
        await createGame();
      });
      it("reverts when regionFrom is besieged", async function () {
        await risk.setSiege(0, 1000, Faction.Green);
        await expectRevert(
          risk.connect(player1).deployWorker(0, 1000),
          "regions must be yours + peaceful"
        );
      });
      it("reverts when regionFrom is not yours", async function () {
        await risk.setSiege(0, 1000, Faction.Green);
        await expectRevert(
          risk.connect(player1).deployWorker(0, 1000),
          "regions must be yours + peaceful"
        );
      });
      it("reverts when regions are not neighbors", async function () {
        await expectRevert(
          risk.connect(player1).deployWorker(3, 1000),
          "regions must be yours + peaceful"
        );
      });
      it("reverts when the pleb balance is not high enough", async function () {
        await expectRevert(
          risk.connect(player1).deployWorker(0, 1500),
          "not enough pleb"
        );
      });
      it("reverts when a higher region tier is required", async function () {
        await risk.setWorker(0, 1100);
        await expectRevert(
          risk.connect(player1).deployWorker(0, 1000),
          "increase region tier"
        );
      });
    });
  });

  describe("claim pleb", function () {
    let result: any;
    const expectedAmount = BigNumber.from("498495");
    context("happy case", () => {
      beforeEach(async () => {
        await createGame();
        await risk.connect(owner).setRegionTiers([
          { workerLimit: 5000, requiredGarrison: 100, plebPerSec: 1000 },
          { workerLimit: 6000, requiredGarrison: 1000, plebPerSec: 3000 },
          { workerLimit: 7000, requiredGarrison: 2000, plebPerSec: 4000 },
          { workerLimit: 10000, requiredGarrison: 3000, plebPerSec: 8000 },
          { workerLimit: 15000, requiredGarrison: 4000, plebPerSec: 16000 },
        ]);
        await risk.connect(player1).deployWorker(0, 1000);
        await risk.connect(player5).deployWorker(0, 1000);
        const deployBlock = await waffle.provider.getBlock("latest");
        await waffle.provider.send("evm_mine", [deployBlock.timestamp + 1000]);
        result = await risk.connect(player1).claimPleb(0, 0, player1.address);
      });
      it("emits an event", async () => {
        expectEvent(result, risk, "ClaimedPleb", [
          player1.address,
          expectedAmount,
        ]);
      });
      it("adds to player balance and increases token supply", async () => {
        expect(await pleb.balanceOf(player1.address)).to.equal(expectedAmount);
        expect(await pleb.balanceOf(risk.address)).to.equal(0);
        expect(await pleb.totalSupply()).to.equal(
          expectedAmount.add(BigNumber.from("3000"))
        );
      });
      it("adds to the owner fee", async () => {
        expect(await risk.claimableFees(owner.address)).to.equal(
          BigNumber.from("2505")
        );
      });
      it("adds to the frontend fee and reduces the claimed amount by the frontendfee", async () => {
        const expectedFrontendFee = BigNumber.from("5005");
        const block = await waffle.provider.getBlock("latest");
        await waffle.provider.send("evm_mine", [block.timestamp + 1000]);
        await risk.connect(player5).claimPleb(0, 5, player3.address);
        expect(await risk.claimableFees(player3.address)).to.equal(
          expectedFrontendFee
        );
        expect(await pleb.balanceOf(player5.address)).to.equal(
          BigNumber.from("990990")
        );
      });
      it("earns more with a larger share", async () => {
        await pleb.connect(owner).mint(player1.address, 2000);
        await risk.connect(player1).deployWorker(0, 2000);
        const block = await waffle.provider.getBlock("latest");
        await waffle.provider.send("evm_mine", [block.timestamp + 1000]);
        await risk.connect(player1).claimPleb(0, 0, player1.address);
        expect(await pleb.balanceOf(player1.address)).to.equal(
          expectedAmount.mul(3)
        );
      });
      it("earns less with a smaller share", async () => {
        await pleb.connect(owner).mint(player1.address, 2000);
        await pleb.connect(owner).mint(player5.address, 1000);
        await risk.connect(player5).deployWorker(1, 1000);
        await risk.connect(player1).deployWorker(1, 2000);
        const block = await waffle.provider.getBlock("latest");
        await waffle.provider.send("evm_mine", [block.timestamp + 1000]);
        await risk.connect(player5).claimPleb(1, 0, player1.address);
        expect(await pleb.balanceOf(player5.address)).to.equal(
          expectedAmount.mul(2).div(3)
        );
      });
      it("takes the new rate if a region increased in tier between claiming", async () => {
        await pleb.connect(owner).mint(player1.address, 3000);
        await pleb.connect(owner).mint(player5.address, 2000);
        await risk.connect(player1).deployWorker(0, 2000);
        await risk.connect(player1).deployGarrison(0, 1, 1000);
        const block = await waffle.provider.getBlock("latest");
        await waffle.provider.send("evm_mine", [block.timestamp + 1000]);
        await risk.connect(player5).deployWorker(0, 2000);
        await risk.connect(player1).claimPleb(0, 0, player1.address);
        expect(await pleb.balanceOf(player1.address)).to.equal(
          BigNumber.from("1995467")
        );
      });
      it("resolves siege in the region", async () => {
        await risk.setSiege(0, 5, Faction.Blue);
        const block = await waffle.provider.getBlock("latest");
        await waffle.provider.send("evm_mine", [block.timestamp + DAY_IN_SEC]);
        expect(
          await risk.connect(player5).claimPleb(0, 0, player1.address)
        ).to.emit(risk, "ResolvedSiege");
      });
    });
    context("error case", () => {
      beforeEach(async () => {
        await createGame();
        await risk.connect(owner).setRegionTiers([
          { workerLimit: 5000, requiredGarrison: 100, plebPerSec: 1000 },
          { workerLimit: 6000, requiredGarrison: 1000, plebPerSec: 3000 },
          { workerLimit: 7000, requiredGarrison: 2000, plebPerSec: 4000 },
          { workerLimit: 10000, requiredGarrison: 3000, plebPerSec: 8000 },
          { workerLimit: 15000, requiredGarrison: 4000, plebPerSec: 16000 },
        ]);
        await risk.connect(player1).deployWorker(0, 1000);
        const deployBlock = await waffle.provider.getBlock("latest");
        await waffle.provider.send("evm_mine", [deployBlock.timestamp + 1000]);
      });
      it("reverts when the region is not at peace", async function () {
        await risk.setSiege(0, 1000, Faction.Green);
        await expect(
          risk.connect(player1).claimPleb(0, 0, player1.address)
        ).to.be.revertedWith("region must be at peace");
      });
      it("reverts when the frontendFee is too high", async function () {
        await risk.setSiege(0, 1000, Faction.Green);
        await expect(
          risk.connect(player1).claimPleb(0, 11, player1.address)
        ).to.be.revertedWith("thats a little greedy");
      });
      it("reverts when claiming to little pleb", async function () {
        await expect(
          risk.connect(player5).claimPleb(1, 0, player1.address)
        ).to.be.revertedWith("not enough pleb to claim");
      });
    });
  });
  describe("attack", function () {
    let attackTime: number;
    let result: any;
    context("happy case", () => {
      beforeEach(async () => {
        await createGame();
        await pleb.connect(owner).mint(player1.address, 100);
        await risk.connect(player1).deployWorker(0, 100);
        result = await risk.connect(player1).attack(3, 0, 500);
        attackTime = (await ethers.provider.getBlock("latest")).timestamp;
      });
      it("emits event", async () => {
        await expectEvent(result, risk, "Attacked", [
          player1.address,
          Faction.Red,
          3,
          500,
        ]);
      });
      it("reduces players pleb balance and burns token", async () => {
        expect(await pleb.balanceOf(player1.address)).to.equal(0);
        expect(await pleb.balanceOf(risk.address)).to.equal(0);
        expect(await pleb.totalSupply()).to.equal(4000);
      });
      it("creates a siege when no siege exists", async () => {
        const region = await risk.regions(3);
        expect(region.besieged).to.equal(true);
        expect(region.siege).to.deep.equal([
          Faction.Red,
          BigNumber.from(attackTime),
          BigNumber.from("500"),
        ]);
      });
      it("adds soldiers to siege if siege already exists", async () => {
        await pleb.connect(owner).mint(player1.address, 1000);
        await risk.connect(player1).attack(3, 0, 500);
        const region = await risk.regions(3);
        expect(region.siege.attackedAt).to.equal(BigNumber.from(attackTime));
        expect(region.siege.soldier).to.equal(BigNumber.from("1000"));
      });
      it("allows attacking with another factions", async () => {
        await risk.connect(player3).attack(3, 4, 500);
        const region = await risk.regions(3);
        expect(region.siege).to.deep.equal([
          Faction.Red,
          BigNumber.from(attackTime),
          BigNumber.from("1000"),
        ]);
      });
      it("resolves siege in the region", async () => {
        await waffle.provider.send("evm_mine", [attackTime + DAY_IN_SEC]);
        await pleb.connect(owner).mint(player5.address, 1000);
        expect(await risk.connect(player5).attack(3, 0, 500)).to.emit(
          risk,
          "ResolvedSiege"
        );
      });
      it("resolves siege in the neigborRegion", async () => {
        await pleb.connect(owner).mint(player5.address, 1000);
        await risk.setSiege(0, 5, Faction.Blue);
        await waffle.provider.send("evm_mine", [attackTime + DAY_IN_SEC]);
        expect(await risk.connect(player5).attack(3, 0, 500)).to.emit(
          risk,
          "ResolvedSiege"
        );
      });
      it("updates the `claimable` and `lastClaimedAt`", async () => {
        expect(
          await risk.getProductionByLord(0, player1.address)
        ).to.deep.equal([
          BigNumber.from("100"),
          BigNumber.from("1000"),
          BigNumber.from(String(attackTime)),
        ]);
      });
    });
    context("error case", () => {
      beforeEach(async () => {
        await createGame();
      });
      it("reverts when regionFrom is besieged", async function () {
        await risk.setSiege(0, 1000, Faction.Green);
        await expectRevert(
          risk.connect(player1).attack(3, 0, 500),
          "regions must allow movement"
        );
      });
      it("reverts when regionFrom is not yours", async function () {
        await risk.setSiege(0, 1000, Faction.Green);
        await expectRevert(
          risk.connect(player1).attack(3, 4, 500),
          "regions must allow movement"
        );
      });
      it("reverts when regions are not neighbors", async function () {
        await expectRevert(
          risk.connect(player1).attack(3, 2, 500),
          "regions must allow movement"
        );
      });
      it("reverts when the pleb balance is not high enough", async function () {
        await expectRevert(
          risk.connect(player1).attack(3, 0, 501),
          "not enough pleb"
        );
      });
    });
  });
  describe("isNeighbor", function () {
    beforeEach(async () => {
      await risk.connect(owner).createRegions(
        [0, 1, 2, 3, 4],
        [0, 1, 2, 0, 1],
        [0, 0, 0, 1, 1],
        [
          [1, 3, 4],
          [0, 2, 3, 4],
          [1, 4],
          [0, 1, 4],
          [0, 1, 2, 3],
        ],
        [0, 0, 0, 0, 0],
        [50, 50, 50, 50, 50],
        [Faction.Red, Faction.Red, Faction.Red, Faction.Blue, Faction.Green],
        [0, 0, 0, 0, 0]
      );
    });
    it("returns true if two regions are neighbors", async () => {
      expect(await risk.isNeighbor(0, 1)).to.equal(true);
      expect(await risk.isNeighbor(0, 4)).to.equal(true);
    });
    it("returns false if two regions are not neighbors", async () => {
      expect(await risk.isNeighbor(0, 2)).to.equal(false);
      expect(await risk.isNeighbor(3, 2)).to.equal(false);
    });
  });
  describe("allows attack", function () {
    beforeEach(async () => {
      await risk.connect(owner).createRegions(
        [0, 1, 2, 3, 4],
        [0, 1, 2, 0, 1],
        [0, 0, 0, 1, 1],
        [
          [1, 3, 4],
          [0, 2, 3, 4],
          [1, 4],
          [0, 1, 4],
          [0, 1, 2, 3],
        ],
        [0, 0, 0, 0, 0],
        [50, 50, 50, 50, 50],
        [Faction.Red, Faction.Red, Faction.Red, Faction.Blue, Faction.Green],
        [0, 0, 0, 0, 0]
      );
    });
    it("returns true if regions are neighbors, `regionFrom` is player faction and not besieged, `regionTo` is an enemy faction and is `block.timestamp` is higher than attackCooldown", async () => {
      expect(await risk.regionAllowsAttack(3, 0)).to.equal(true);
    });
    it("returns false if two regions are not neighbors", async () => {
      expect(await risk.regionAllowsAttack(3, 2)).to.equal(false);
    });
    it("returns false if `regionFrom` is not controlled by player faction", async () => {
      expect(await risk.regionAllowsAttack(3, 4)).to.equal(false);
    });
    it("returns false if `regionFrom` is besieged", async () => {
      await risk.setSiege(0, 500, Faction.Green);
      expect(await risk.regionAllowsAttack(3, 0)).to.equal(false);
    });
    it("returns false if `regionTo` is of player factions", async () => {
      expect(await risk.regionAllowsAttack(1, 0)).to.equal(false);
    });
    it("returns false if `block.timestamp` is lower than attackCooldown", async () => {
      const latestBlock = await ethers.provider.getBlock("latest");
      await risk.setCantGetAttackedTill(3, latestBlock.timestamp + 1000);
      expect(await risk.regionAllowsAttack(3, 0)).to.equal(false);
    });
  });
  describe("resolve Siege", function () {
    beforeEach(async () => {
      await createGame();
    });
    it("doesnt do anything when the time since attack is lower than `rallyTime`", async () => {
      await risk.setSiege(1, 100, Faction.Red);
      const result = await risk.resolveSiege(1);
      expectNoEvent(result, risk, "ResolvedSiege");
    });
    it("emits an event", async () => {
      await risk.setSiege(3, 300, Faction.Red);
      const block = await waffle.provider.getBlock("latest");
      await waffle.provider.send("evm_mine", [
        block.timestamp + 4 * DAY_IN_SEC,
      ]);
      expectEvent(await risk.resolveSiege(3), risk, "ResolvedSiege", [
        3,
        Faction.Blue,
        BigNumber.from("50"),
        Faction.Red,
        BigNumber.from("300"),
        false,
      ]);
    });
    context("defender win", function () {
      it("defender overwhelm the attacker if they have 3x more soldier", async () => {
        await risk.connect(player1).deployGarrison(0, 1, 250);
        await risk.setSiege(0, 100, Faction.Blue);
        const block = await waffle.provider.getBlock("latest");
        await waffle.provider.send("evm_mine", [
          block.timestamp + 9 * HOUR_IN_SEC,
        ]);
        expect(await risk.siegeOutcome(0)).to.deep.equal([
          true,
          true,
          BigNumber.from("250"),
        ]);
      });
      it("defender win after `siegeTime` when they have atleast as many soldier as the attacker", async () => {
        await risk.setSiege(0, 50, Faction.Blue);
        const block = await waffle.provider.getBlock("latest");
        await waffle.provider.send("evm_mine", [
          block.timestamp + 2 * DAY_IN_SEC,
        ]);
        expect(await risk.siegeOutcome(0)).to.deep.equal([
          true,
          true,
          BigNumber.from("0"),
        ]);
      });
      it("the remaining garrison is `oldGarrison` - (`attacker`/2) if its an overwhelming win", async () => {
        await risk.connect(player1).deployGarrison(0, 1, 250);
        await risk.setSiege(0, 100, Faction.Blue);
        const block = await waffle.provider.getBlock("latest");
        await waffle.provider.send("evm_mine", [
          block.timestamp + 9 * HOUR_IN_SEC,
        ]);
        await risk.resolveSiege(0);
        expect(await (await risk.regions(0)).garrison).to.equal(
          BigNumber.from("250")
        );
      });
      it("the remaining garrison is `oldGarrison` - `attacker` if its a win", async () => {
        await risk.setSiege(0, 49, Faction.Blue);
        const block = await waffle.provider.getBlock("latest");
        await waffle.provider.send("evm_mine", [
          block.timestamp + 2 * DAY_IN_SEC,
        ]);
        await risk.resolveSiege(0);
        expect(await (await risk.regions(0)).garrison).to.equal(
          BigNumber.from("1")
        );
      });
      it("sets besieged to false", async () => {
        await risk.setSiege(0, 49, Faction.Blue);
        const block = await waffle.provider.getBlock("latest");
        await waffle.provider.send("evm_mine", [
          block.timestamp + 2 * DAY_IN_SEC,
        ]);
        await risk.resolveSiege(0);
        expect(await (await risk.regions(0)).besieged).to.equal(false);
      });
      it("deletes the siege", async () => {
        await risk.setSiege(0, 49, Faction.Blue);
        const block = await waffle.provider.getBlock("latest");
        await waffle.provider.send("evm_mine", [
          block.timestamp + 4 * DAY_IN_SEC,
        ]);
        await risk.resolveSiege(0);
        expect(await (await risk.regions(0)).siege).to.deep.equal([
          0,
          BigNumber.from("0"),
          BigNumber.from("0"),
        ]);
      });
      it("sets regions `cantGetAttackedTill` to now + `siegeCooldown`", async () => {
        await risk.setSiege(0, 49, Faction.Blue);
        const block = await waffle.provider.getBlock("latest");
        await waffle.provider.send("evm_mine", [
          block.timestamp + 2 * DAY_IN_SEC,
        ]);
        await risk.resolveSiege(0);
        expect(await (await risk.regions(0)).cantGetAttackedTill).to.equal(
          block.timestamp + 1 + 6 * DAY_IN_SEC
        );
      });
      it("if the garrison is too low for the current regionTier the tier and totalworker will be reduced", async () => {
        await pleb.connect(owner).mint(player1.address, 4000);
        await risk.connect(player1).deployGarrison(0, 1, 1000);
        await risk.connect(player1).deployWorker(0, 2000);
        await risk.setSiege(0, 102, Faction.Blue);
        const block = await waffle.provider.getBlock("latest");
        await waffle.provider.send("evm_mine", [
          block.timestamp + 4 * DAY_IN_SEC,
        ]);
        await risk.resolveSiege(0);
        const region = await risk.regions(0);
        expect(region.garrison).to.equal(BigNumber.from("999"));
        expect(region.totalWorker).to.equal(BigNumber.from("1500"));
        expect(region.tier).to.equal(0);
      });
      it("after the siege pleb can be claimed as if the siege didnt happen", async () => {
        await risk.connect(player1).deployWorker(0, 1000);
        await risk.setSiege(0, 49, Faction.Blue);
        const block = await waffle.provider.getBlock("latest");
        await waffle.provider.send("evm_mine", [
          block.timestamp + 4 * DAY_IN_SEC,
        ]);
        await risk.resolveSiege(0);
        expect(await risk.getClaimablePleb(0, player1.address)).to.equal(
          BigNumber.from("345602000")
        );
      });
    });
    context("attacker win", function () {
      it("attacker overwhelm the defender if they have 3x more soldier", async () => {
        await risk.connect(player1).attack(3, 0, 150);
        const block = await waffle.provider.getBlock("latest");
        await waffle.provider.send("evm_mine", [
          block.timestamp + 9 * HOUR_IN_SEC,
        ]);
        expect(await risk.siegeOutcome(3)).to.deep.equal([
          true,
          false,
          BigNumber.from("125"),
        ]);
      });
      it("attacker win after `siegeTime` when they have more soldier than the defender", async () => {
        await risk.connect(player1).attack(3, 0, 51);
        const block = await waffle.provider.getBlock("latest");
        await waffle.provider.send("evm_mine", [
          block.timestamp + 3 * DAY_IN_SEC,
        ]);
        expect(await risk.siegeOutcome(3)).to.deep.equal([
          true,
          false,
          BigNumber.from("1"),
        ]);
      });
      it("the remaining garrison is `attacker.soldier` - (`garrison`/2) if its an overwhelming win", async () => {
        await risk.connect(player1).attack(3, 0, 150);
        const block = await waffle.provider.getBlock("latest");
        await waffle.provider.send("evm_mine", [
          block.timestamp + 9 * HOUR_IN_SEC,
        ]);
        await risk.resolveSiege(3);
        expect(await (await risk.regions(3)).garrison).to.equal(
          BigNumber.from("125")
        );
      });
      it("sets besieged to false", async () => {
        await conquerRegion();
        expect(await (await risk.regions(3)).besieged).to.equal(false);
      });
      it("deletes the siege, totalWorker and production", async () => {
        await risk.connect(player1).deployWorker(0, 1000);
        await risk.setSiege(0, 51, Faction.Blue);
        const block = await waffle.provider.getBlock("latest");
        await waffle.provider.send("evm_mine", [
          block.timestamp + 4 * DAY_IN_SEC,
        ]);
        await risk.resolveSiege(0);
        const region = await risk.regions(3);
        expect(region.siege).to.deep.equal([
          0,
          BigNumber.from("0"),
          BigNumber.from("0"),
        ]);
        expect(region.totalWorker).to.equal(BigNumber.from("0"));
        await expectRevert(
          risk.connect(player1).claimPleb(0, 0, player1.address),
          "not enough pleb to claim"
        );
      });
      it("changes `controlledBy` to the attacker faction", async () => {
        await conquerRegion();
        expect(await (await risk.regions(3)).controlledBy).to.equal(
          Faction.Red
        );
      });
      it("leaves `cantGetAttackedTill` as it was", async () => {
        await conquerRegion();
        expect(await (await risk.regions(3)).cantGetAttackedTill).to.equal(
          BigNumber.from("0")
        );
      });
      it("updates the controlled regions for attacker and defender", async () => {
        await conquerRegion();
        expect(await risk.regionsPerFaction(Faction.Red)).to.equal(
          BigNumber.from(4)
        );
        expect(await risk.regionsPerFaction(Faction.Blue)).to.equal(
          BigNumber.from(0)
        );
      });
      it("sets regionTier to 0", async () => {
        await conquerRegion();
        expect(await (await risk.regions(3)).tier).to.equal(0);
      });
      it("kills the defender if this was their last region", async () => {
        await conquerRegion();
        expect(await await risk.factionDead(Faction.Blue)).to.equal(true);
      });
    });
  });
  describe("claim fees", function () {
    context("happy case", () => {
      const totalSupply = BigNumber.from("994990");
      beforeEach(async () => {
        await createGame();
        await risk.connect(owner).setRegionTiers([
          { workerLimit: 5000, requiredGarrison: 100, plebPerSec: 1000 },
          { workerLimit: 6000, requiredGarrison: 1000, plebPerSec: 3000 },
          { workerLimit: 7000, requiredGarrison: 2000, plebPerSec: 4000 },
          { workerLimit: 10000, requiredGarrison: 3000, plebPerSec: 8000 },
          { workerLimit: 15000, requiredGarrison: 4000, plebPerSec: 16000 },
        ]);
        await risk.connect(player1).deployWorker(0, 1000);
        const deployBlock = await waffle.provider.getBlock("latest");
        await waffle.provider.send("evm_mine", [deployBlock.timestamp + 1000]);
        await risk.connect(player1).claimPleb(0, 5, player2.address);
      });
      it("adds to owner balance, increases token supply and sets claimable fees to 0", async () => {
        const expectedAmount = BigNumber.from("5005");
        await risk.connect(owner).claimFees();
        expect(await pleb.balanceOf(owner.address)).to.equal(expectedAmount);
        expect(await pleb.balanceOf(risk.address)).to.equal(0);
        expect(await pleb.totalSupply()).to.equal(
          totalSupply.add(expectedAmount)
        );
      });
      it("adds to frontend balance, increases token supply and sets claimable fees to 0", async () => {
        const expectedAmount = BigNumber.from("5005");
        await risk.connect(player2).claimFees();
        expect(await pleb.balanceOf(player2.address)).to.equal(
          expectedAmount.add(BigNumber.from("1000"))
        );
        expect(await pleb.balanceOf(risk.address)).to.equal(0);
        expect(await pleb.totalSupply()).to.equal(
          totalSupply.add(expectedAmount)
        );
      });
    });
    context("error case", () => {
      it("reverts when there are not fees to claim", async function () {
        await expect(risk.connect(player1).claimFees()).to.be.revertedWith(
          "no fees"
        );
      });
    });
  });
  describe("claim ticket revenue", function () {
    it("transfers ticket revenue to the owner", async () => {
      const oldBalance = await (await ethers.provider.getBalance(owner.address))
        .div(parseEther("1"))
        .mul(parseEther("1"));
      await risk.connect(player1).joinGame({ value: parseEther("10") });
      await risk.connect(owner).claimTicketRevenue();
      expect(
        await (await ethers.provider.getBalance(owner.address))
          .div(parseEther("1"))
          .mul(parseEther("1"))
      ).to.equal(oldBalance.add(parseEther("10")));
    });
    it("reverts when not called by the owner", async () => {
      await expectRevert(
        risk.connect(player1).claimTicketRevenue(),
        "Ownable: caller is not the owner"
      );
    });
  });
});
