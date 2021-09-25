//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "hardhat/console.sol";
import "./Pleb.sol";

contract PhantomRisk is Ownable {
    using SafeMath for uint256;

    enum Faction {
        Red,
        Blue,
        Green,
        Yellow
    }

    struct Region {
        uint8 id;
        uint8 x;
        uint8 y;
        uint8[] neighbors;
        uint8 tier;
        uint256 garrison;
        uint256 totalWorker;
        mapping(address => uint256) workerByLord;
        WorkerGroup[] worker;
        Faction controlledBy;
        bool besieged;
        uint256 cantGetAttackedTill;
        Siege siege;
    }

    struct WorkerGroup {
        address lord;
        uint256 worker;
    }

    struct Army {
        address lord;
        uint256 soldier;
        uint256 movedAt;
    }

    struct Siege {
        Faction attacker;
        uint256 attackedAt;
        uint256 soldier;
    }

    struct RegionTier {
        uint256 workerLimit;
        uint256 requiredGarrison;
        uint256 plebPerHour;
    }

    /* ========== STATE VARIABLES ========== */

    mapping(address => Faction) public player;
    Pleb public pleb;

    Faction private nextPlayerFaction;
    bool[4] public factionAlive;
    uint256[4] public regionsPerFaction;

    uint8[] public regionIds;
    mapping(uint8 => Region) public regions;
    RegionTier[5] public regionTiers;

    mapping(address => uint256) public claimableFees;

    uint256 public ticketPrice = 10 ether;
    uint256 public rallyTime = 8 hours;
    uint256 public siegeTime = 24 hours;
    uint256 public siegeCooldown = 4 days;
    uint256 public overwhelming = 3;
    uint256 public plebForSoldier = 2;

    /* ========== EVENTS ========== */

    event JoinedGame(address player, Faction faction);
    event ClaimedPleb(address player, uint256 pleb);
    event DeployedWorker(address player, uint8 region, uint256 worker);
    event DeployedGarrison(address player, uint8 region, uint256 soldier);
    event Attacked(
        address player,
        Faction faction,
        uint8 region,
        uint256 soldier
    );
    event ResolvedSiege(
        uint8 region,
        Faction defender,
        uint256 defendingSoldier,
        Faction attacker,
        uint256 attackingSoldier,
        bool defenderWon
    );
    event RegionTierIncreased(uint8 region, uint8 tier);
    event FactionLost(Faction faction);
    event TicketPriceChanged(uint256 oldPrice, uint256 newPrice);
    event OverwhelmingChanged(uint256 oldValue, uint256 newValue);
    event RallyTimeChanged(uint256 oldTime, uint256 newTime);
    event SiegeTimeChanged(uint256 oldTime, uint256 newTime);
    event SiegeCooldownChanged(uint256 oldCooldown, uint256 newCooldown);

    /* ========== CONSTRUCTOR ========== */

    constructor(Pleb _pleb) {
        pleb = _pleb;
    }

    /* ========== VIEW FUNCTIONS ========== */

    function isNeighbor(uint8 _regionTo, uint8 _regionFrom)
        public
        view
        returns (bool)
    {
        uint8 xFrom = regions[_regionFrom].x;
        uint8 yFrom = regions[_regionFrom].y;
        uint8 xTo = regions[_regionTo].x;
        uint8 yTo = regions[_regionTo].y;
        if (
            xTo == xFrom ||
            xTo == xFrom - 1 ||
            (xTo == xFrom + 1 && yTo == yFrom) ||
            yTo == yFrom - 1 ||
            yTo == yFrom + 1
        ) {
            return true;
        }
        return false;
    }

    function isNeighbor2(uint8 _regionTo, uint8 _regionFrom)
        public
        view
        returns (bool)
    {
        uint8[] memory neighbors = regions[_regionFrom].neighbors;
        bool isNeighborBool;
        for (uint8 i; i < neighbors.length; i++) {
            if (_regionTo == neighbors[i]) {
                isNeighborBool = true;
            }
        }
        return isNeighborBool;
    }

    function movementAllowed(uint8 _regionTo, uint8 _regionFrom)
        public
        view
        returns (bool)
    {
        return
            isNeighbor(_regionTo, _regionFrom) &&
            _canMoveFromRegion(_regionFrom) &&
            regions[_regionTo].controlledBy == player[msg.sender];
    }

    function regionAllowsAttack(uint8 _regionTo, uint8 _regionFrom)
        public
        view
        returns (bool)
    {
        return
            isNeighbor(_regionTo, _regionFrom) &&
            _canMoveFromRegion(_regionFrom) &&
            regions[_regionTo].controlledBy != player[msg.sender] &&
            regions[_regionTo].cantGetAttackedTill < block.timestamp;
    }

    function siegeOutcome(uint8 _region)
        public
        view
        returns (
            bool,
            bool,
            uint256
        )
    {
        Region storage region = regions[_region];
        if (region.garrison.div(3) >= region.siege.soldier) {
            return (
                true,
                true,
                region.garrison.sub(region.siege.soldier.div(2))
            );
        }
        if (region.siege.soldier.div(3) >= region.garrison) {
            return (
                true,
                false,
                region.siege.soldier.sub(region.garrison.div(2))
            );
        }
        if (region.siege.attackedAt.add(siegeTime) < block.timestamp) {
            if (region.garrison >= region.siege.soldier) {
                return (true, true, region.garrison.sub(region.siege.soldier));
            }
            return (true, false, region.siege.soldier.sub(region.garrison));
        }
        return (false, false, 0);
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    function joinGame() external payable {
        require(msg.value >= ticketPrice, "you didnt pay enough");
        _joinGame();
        pleb.mint(msg.sender, 1000);
    }

    function claimPleb(uint8 _region, uint256 _frontendFee, address _frontendProvider)
        external
        resolveSiegeMod(_region)
    {
        require(_frontendFee <= 10, "thats a little greedy");
        Region storage region = regions[_region];
        uint256 claimable = region.workerByLord[msg.sender].mul(
            regionTiers[region.tier].plebPerHour.div(3600)
        );
        uint256 fee = claimable.mul(1000).div(995);
        uint256 frontendFee = claimable.mul(1000).div(_frontendFee);
        if (fee < 1) {
            fee = 1;
        }
        if (frontendFee < 1) {
            frontendFee = 1;
        }
        claimableFees[owner()] = fee;
        claimableFees[_frontendProvider] = frontendFee;
        pleb.mint(msg.sender, claimable.sub(fee.add(frontendFee)));

        emit ClaimedPleb(msg.sender, claimable);
    }

    function deployWorker(uint8 regionTo, uint256 workerAmount)
        external
        resolveSiegeMod(regionTo)
    {
        Region storage region = regions[regionTo];
        require(
            region.controlledBy == player[msg.sender] && !region.besieged,
            "regions must be yours and peaceful"
        );

        require(pleb.balanceOf(msg.sender) >= workerAmount, "not enough plebs");
        pleb.burnFrom(msg.sender, workerAmount);

        region.totalWorker = region.totalWorker.add(workerAmount);
        WorkerGroup storage workerGroup = region.worker[
            region.workerByLord[msg.sender]
        ];
        if (workerGroup.lord == msg.sender) {
            workerGroup.worker = workerGroup.worker.add(workerAmount);
        } else {
            uint256 workerIndex = region.worker.length;
            region.worker.push(
                WorkerGroup({lord: msg.sender, worker: workerAmount})
            );
            region.workerByLord[msg.sender] = workerIndex;
        }

        require(
            region.totalWorker <= regionTiers[region.tier].workerLimit,
            "increase region tier"
        );
        emit DeployedWorker(msg.sender, regionTo, workerAmount);
    }

    function deployGarrison(
        uint8 regionTo,
        uint8 neighborRegion,
        uint256 soldierAmount
    ) external resolveSiegeMod(regionTo) {
        require(
            isNeighbor(regionTo, neighborRegion) &&
                _canMoveFromRegion(neighborRegion),
            "regions must allow movement"
        );

        require(
            pleb.balanceOf(msg.sender) >= soldierAmount.mul(plebForSoldier),
            "not enough plebs"
        );
        pleb.burnFrom(msg.sender, soldierAmount.mul(plebForSoldier));

        regions[regionTo].garrison = regions[regionTo].garrison.add(
            soldierAmount
        );
        _increaseRegionTier(regionTo);
        emit DeployedGarrison(msg.sender, regionTo, soldierAmount);
    }

    function attack(
        uint8 regionTo,
        uint8 regionFrom,
        uint256 soldierAmount
    ) external resolveSiegeMod(regionFrom) {
        Region storage region = regions[regionTo];
        require(
            regionAllowsAttack(regionTo, regionFrom),
            "regions must allow movement"
        );

        require(
            pleb.balanceOf(msg.sender) >= soldierAmount.mul(plebForSoldier),
            "not enough plebs"
        );
        pleb.burnFrom(msg.sender, soldierAmount.mul(plebForSoldier));

        if (region.siege.attackedAt != 0) {
            region.siege = Siege({
                attacker: player[msg.sender],
                soldier: soldierAmount,
                attackedAt: block.timestamp
            });
        } else {
            region.siege.soldier = region.siege.soldier.add(soldierAmount);
        }
        _resolveSiege(regionFrom);
    }

    function resolveSiege(uint8 _region) external {
        _resolveSiege(_region);
    }


    function claimFees() external {
        require(claimableFees[msg.sender] > 0, "no fees");
        pleb.mint(msg.sender, claimableFees[msg.sender]);
    }

    // function deploySoldier(
    //     uint8 regionTo,
    //     uint8 neighborRegion,
    //     uint256 soldierAmount
    // ) external siegeOutcome(regionTo) {
    //     require(
    //         regionsAllowMovement(neighborRegion, regionTo),
    //         "regions must allow movement"
    //     );

    //     regions[regionTo].garrison = regions[regionTo].garrison.add(
    //         soldierAmount
    //     );
    // }

    // function moveArmy(
    //     uint8 regionTo,
    //     uint8 regionFrom,
    //     uint256 soldierAmount
    // ) external siegeOutcome(regionFrom) {
    //     require(
    //         regionsAllowMovement(regionFrom, regionTo),
    //         "regions must allow movement"
    //     );

    //     _reduceArmy(regionFrom, soldierAmount);
    //     regions[regionFrom].garrison = regions[regionFrom].garrison.sub(
    //         soldierAmount
    //     );

    //     _increaseArmy(regionTo, soldierAmount);
    //     //SHOULD garrison maybe not be tied to armies?
    //     //Armies = only movement + for attack
    //     //Garrison = stationary for defense
    //     //Army as garrison allows to temporarily boost region tier
    //     regions[regionTo].garrison = regions[regionTo].garrison.add(
    //         soldierAmount
    //     );
    // }

    // function deployGarrisonFromArmy(
    //     uint8 regionTo,
    //     uint8 regionFrom,
    //     uint256 soldierAmount
    // ) external {
    //     require(
    //         regionsAllowMovement(regionFrom, regionTo),
    //         "regions must allow movement"
    //     );

    //     _reduceArmy(regionFrom, soldierAmount);
    //     regions[regionFrom].garrison = regions[regionFrom].garrison.sub(
    //         soldierAmount
    //     );

    //     regions[regionTo].garrison = regions[regionTo].garrison.add(
    //         soldierAmount
    //     );
    //     _increaseRegionTier(regionTo);
    // }

    /* ========== PRIVATE FUNCTIONS ========== */

    function _joinGame() internal {
        if (factionAlive[uint8(nextPlayerFaction)]) {
            player[msg.sender] = nextPlayerFaction;
            emit JoinedGame(msg.sender, nextPlayerFaction);
            _incrementFactionCounter();
        } else {
            _incrementFactionCounter();
            _joinGame();
        }
    }

    function _incrementFactionCounter() internal {
        if (uint8(nextPlayerFaction) == 3) {
            nextPlayerFaction = Faction.Red;
        } else {
            nextPlayerFaction = Faction(uint8(nextPlayerFaction) + 1);
        }
    }

    function _resolveSiege(uint8 _region) internal {
        Region storage region = regions[_region];
        if (region.siege.attackedAt.add(rallyTime) < block.timestamp) {
            (
                bool siegeIsOver,
                bool defenderWon,
                uint256 newGarrison
            ) = siegeOutcome(_region);
            emit ResolvedSiege(
                _region,
                region.controlledBy,
                region.garrison,
                region.siege.attacker,
                region.siege.soldier,
                defenderWon
            );
            if (siegeIsOver) {
                if (defenderWon) {
                    region.garrison = newGarrison;
                    region.besieged = false;
                    region.cantGetAttackedTill = block.timestamp.add(
                        siegeCooldown
                    );
                    delete region.siege;
                } else {
                    region.garrison = newGarrison;
                    region.besieged = false;
                    regionsPerFaction[uint8(region.siege.attacker)]++;
                    regionsPerFaction[uint8(region.controlledBy)]--;
                    if (regionsPerFaction[uint8(region.controlledBy)] == 0) {
                        factionAlive[uint8(region.controlledBy)] = false;
                        emit FactionLost(region.controlledBy);
                    }
                    region.controlledBy = region.siege.attacker;

                    delete region.siege;
                    delete region.totalWorker;
                    delete region.worker;
                }
            }
        }
    }

    function _increaseRegionTier(uint8 _region) internal {
        Region storage region = regions[_region];
        if (
            region.garrison > regionTiers[region.tier].requiredGarrison &&
            region.tier < 5
        ) {
            region.tier++;
        }
        emit RegionTierIncreased(_region, region.tier);
    }

    function _canMoveFromRegion(uint8 _regionFrom)
        internal
        view
        returns (bool)
    {
        return
            regions[_regionFrom].controlledBy == player[msg.sender] &&
            !regions[_regionFrom].besieged;
    }

    // function _increaseArmy(uint8 regionTo, uint256 soldierAmount) internal {
    //     uint256 armyId = regions[regionTo].armyByLord[msg.sender];
    //     Army storage armyTo = regions[regionTo].armies[armyId];
    //     require(armyTo.lord == msg.sender, "not your army");
    //     armyTo.soldier = armyTo.soldier.add(soldierAmount);
    //     armyTo.movedAt = block.timestamp;
    // }

    // function _reduceArmy(uint8 regionFrom, uint256 soldierAmount) internal {
    //     Army storage armyFrom = regions[regionFrom].armies[msg.sender];
    //     require(
    //         armyFrom.movedAt.add(moveTime) < block.timestamp,
    //         "army already moved"
    //     );
    //     require(armyFrom.soldier >= soldierAmount, "not enough soldier");

    //     armyFrom.soldier = armyFrom.soldier.sub(soldierAmount);
    // }

    /* ========== SETTER ========== */

    function setTicketPrice(uint256 price) external onlyOwner {
        emit TicketPriceChanged(ticketPrice, price);
        ticketPrice = price;
    }

    function setOverwhelming(uint8 number) external onlyOwner {
        emit OverwhelmingChanged(overwhelming, number);
        overwhelming = number;
    }

    function setRallyTime(uint256 time) external onlyOwner {
        emit RallyTimeChanged(rallyTime, time);
        rallyTime = time;
    }

    function setSiegeTime(uint256 time) external onlyOwner {
        emit SiegeTimeChanged(siegeTime, time);
        siegeTime = time;
    }

    function setSiegeCooldown(uint256 time) external onlyOwner {
        emit SiegeCooldownChanged(siegeCooldown, time);
        siegeCooldown = time;
    }

    function setRegionTiers(RegionTier[5] memory tiers) external onlyOwner {
        for (uint8 i; i < 5; i++) {
            regionTiers[i] = tiers[i];
        }
    }

    /* ========== MODIFIER ========== */

    modifier resolveSiegeMod(uint8 region) {
        if (
            regions[region].besieged &&
            regions[region].siege.attackedAt.add(rallyTime) < block.timestamp
        ) {
            _resolveSiege(region);
        }
        _;
    }
}
