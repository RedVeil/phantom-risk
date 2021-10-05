//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "hardhat/console.sol";
import "./Pleb.sol";

contract PhantomRiskV1 is Ownable {
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
        mapping(address => uint256) productionByLord;
        Production[] production;
        Faction controlledBy;
        bool besieged;
        uint256 cantGetAttackedTill;
        Siege siege;
    }

    struct Production {
        address lord;
        uint256 worker;
        uint256 claimablePleb;
        uint256 lastClaimedAt;
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
        uint256 plebPerSec;
    }

    struct Settings {
        uint256 ticketPrice;
        uint256 rallyTime;
        uint256 siegeTime;
        uint256 siegeCooldown;
        uint256 overwhelming;
        uint256 overwhelmingPenalty;
        uint256 plebForSoldier;
    }

    /* ========== STATE VARIABLES ========== */

    mapping(address => Faction) public player;
    Pleb public pleb;
    address payable public ticketRevenueRecipient;

    Faction private nextPlayerFaction;
    bool[4] public factionDead;
    uint256[4] public regionsPerFaction;

    uint8[] public regionIds;
    mapping(uint8 => Region) public regions;
    RegionTier[5] public regionTiers;

    mapping(address => uint256) public claimableFees;

    Settings public settings;
    bool public deploymentDone;

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
    event SettingsChanged(Settings oldSettings, Settings newSettings);
    event FeesClaimed(address account, uint256 amount);

    /* ========== CONSTRUCTOR ========== */

    constructor(Pleb _pleb, address payable _ticketRevenueRecipient) {
        pleb = _pleb;
        ticketRevenueRecipient = _ticketRevenueRecipient;
        setSettings(10 ether, 8 hours, 24 hours, 4 days, 3, 2, 2);
    }

    /* ========== VIEW FUNCTIONS ========== */

    function isNeighbor(uint8 _regionTo, uint8 _regionFrom)
        public
        view
        returns (bool)
    {
        for (uint8 i; i < regions[_regionTo].neighbors.length; i++) {
            if (regions[_regionTo].neighbors[i] == _regionFrom) {
                return true;
            }
        }
        return false;
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
        if (
            region.garrison.div(settings.overwhelming) >= region.siege.soldier
        ) {
            return (
                true,
                true,
                region.garrison.sub(
                    region.siege.soldier.div(settings.overwhelmingPenalty)
                )
            );
        }
        if (
            region.siege.soldier.div(settings.overwhelming) >= region.garrison
        ) {
            return (
                true,
                false,
                region.siege.soldier.sub(
                    region.garrison.div(settings.overwhelmingPenalty)
                )
            );
        }
        if (region.siege.attackedAt.add(settings.siegeTime) < block.timestamp) {
            if (region.garrison >= region.siege.soldier) {
                return (true, true, region.garrison.sub(region.siege.soldier));
            }
            return (true, false, region.siege.soldier.sub(region.garrison));
        }
        return (false, false, 0);
    }

    function getClaimablePleb(uint8 _region, address _player)
        public
        view
        returns (uint256)
    {
        Region storage region = regions[_region];
        uint256 productionId = region.productionByLord[_player];
        if (
            region.production.length > 0 &&
            region.production[productionId].lord == _player &&
            region.production[productionId].worker > 0
        ) {
            return
                regionTiers[region.tier]
                    .plebPerSec
                    .mul(
                        block.timestamp.sub(
                            region.production[productionId].lastClaimedAt
                        )
                    )
                    .div(
                        region.totalWorker.div(
                            region.production[productionId].worker
                        )
                    )
                    .add(region.production[productionId].claimablePleb);
        }
        return 0;
    }

    function getProductionByLord(uint8 _region, address _player)
        external
        view
        returns (
            uint256,
            uint256,
            uint256
        )
    {
        Region storage region = regions[_region];
        uint256 productionId = region.productionByLord[_player];
        if (
            region.production.length > 0 &&
            region.production[productionId].lord == _player
        ) {
            return (
                region.production[productionId].worker,
                region.production[productionId].claimablePleb,
                region.production[productionId].lastClaimedAt
            );
        }
        return (0, 0, 0);
    }

    function getRegion(uint8 _region)
        external
        view
        returns (
            uint8 id_,
            uint8 x_,
            uint8 y_,
            uint8[] memory neighbors_,
            uint8 tier_,
            uint256 garrison_,
            uint256 totalWorker_,
            Faction controlledBy_,
            bool besieged_,
            uint256 cantGetAttackedTill_
        )
    {
        Region storage region = regions[_region];
        id_ = region.id;
        x_ = region.x;
        y_ = region.y;
        neighbors_ = region.neighbors;
        tier_ = region.tier;
        garrison_ = region.garrison;
        totalWorker_ = region.totalWorker;
        controlledBy_ = region.controlledBy;
        besieged_ = region.besieged;
        cantGetAttackedTill_ = region.cantGetAttackedTill;
    }

    function getSiege(uint8 _region)
        external
        view
        returns (
            Faction attacker_,
            uint256 attackedAt_,
            uint256 soldier_
        )
    {
        Region storage region = regions[_region];
        attacker_ = region.siege.attacker;
        attackedAt_ = region.siege.attackedAt;
        soldier_ = region.siege.soldier;
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    function joinGame() external payable {
        require(msg.value >= settings.ticketPrice, "you didnt pay enough");
        _joinGame();
        pleb.mint(msg.sender, 1000);
    }

    function deployWorker(uint8 regionTo, uint256 workerAmount)
        external
        resolveSiegeMod(regionTo)
        updateClaimable(regionTo, msg.sender)
    {
        Region storage region = regions[regionTo];
        require(
            region.controlledBy == player[msg.sender] && !region.besieged,
            "regions must be yours + peaceful"
        );
        require(pleb.balanceOf(msg.sender) >= workerAmount, "not enough pleb");
        pleb.burnFrom(msg.sender, workerAmount);

        region.totalWorker = region.totalWorker.add(workerAmount);

        if (
            region.production.length > 0 &&
            region.production[region.productionByLord[msg.sender]].lord ==
            msg.sender
        ) {
            Production storage production = region.production[
                region.productionByLord[msg.sender]
            ];
            production.worker = production.worker.add(workerAmount);
        } else {
            uint256 workerIndex = region.production.length;
            region.production.push(
                Production({
                    lord: msg.sender,
                    worker: workerAmount,
                    claimablePleb: 0,
                    lastClaimedAt: block.timestamp
                })
            );
            region.productionByLord[msg.sender] = workerIndex;
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
    )
        external
        resolveSiegeMod(neighborRegion)
        resolveSiegeMod(regionTo)
        updateClaimable(regionTo, msg.sender)
    {
        require(
            isNeighbor(regionTo, neighborRegion) &&
                _canMoveFromRegion(neighborRegion),
            "regions must allow movement"
        );
        uint256 plebRequired = soldierAmount.mul(settings.plebForSoldier);
        require(pleb.balanceOf(msg.sender) >= plebRequired, "not enough plebs");
        pleb.burnFrom(msg.sender, plebRequired);

        regions[regionTo].garrison = regions[regionTo].garrison.add(
            soldierAmount
        );
        _increaseRegionTier(regionTo);
        emit DeployedGarrison(msg.sender, regionTo, soldierAmount);
    }

    function claimPleb(
        uint8 _region,
        uint256 _frontendFee,
        address _frontendProvider
    ) external resolveSiegeMod(_region) {
        require(_frontendFee <= 10, "thats a little greedy");
        Region storage region = regions[_region];
        require(!region.besieged, "region must be at peace");
        uint256 claimable = getClaimablePleb(_region, msg.sender);
        require(claimable > 1, "not enough pleb to claim");
        uint256 fee = claimable.sub(claimable.mul(995).div(1000));
        uint256 frontendFee = claimable.sub(
            claimable.mul(1000 - _frontendFee).div(1000)
        );
        if (_frontendFee > 0 && frontendFee < 1) {
            frontendFee = 1;
        }
        if (fee < 1) {
            fee = 1;
        }
        claimableFees[owner()] = fee;
        claimableFees[_frontendProvider] = frontendFee;
        claimable = claimable.sub(fee.add(frontendFee));
        pleb.mint(msg.sender, claimable);

        region
            .production[region.productionByLord[msg.sender]]
            .claimablePleb = 0;
        region
            .production[region.productionByLord[msg.sender]]
            .lastClaimedAt = block.timestamp;

        emit ClaimedPleb(msg.sender, claimable);
    }

    function attack(
        uint8 regionTo,
        uint8 regionFrom,
        uint256 soldierAmount
    )
        external
        resolveSiegeMod(regionFrom)
        updateClaimable(regionFrom, msg.sender)
    {
        Region storage region = regions[regionTo];
        require(
            regionAllowsAttack(regionTo, regionFrom),
            "regions must allow movement"
        );

        require(
            pleb.balanceOf(msg.sender) >=
                soldierAmount.mul(settings.plebForSoldier),
            "not enough pleb"
        );
        pleb.burnFrom(msg.sender, soldierAmount.mul(settings.plebForSoldier));

        if (region.siege.attackedAt == 0) {
            region.siege = Siege({
                attacker: player[msg.sender],
                soldier: soldierAmount,
                attackedAt: block.timestamp
            });
            region.besieged = true;
        } else {
            region.siege.soldier = region.siege.soldier.add(soldierAmount);
        }
        _resolveSiege(regionFrom);
        emit Attacked(msg.sender, player[msg.sender], regionTo, soldierAmount);
    }

    function resolveSiege(uint8 _region) external {
        _resolveSiege(_region);
    }

    function createRegions(
        uint8[] memory _regionId,
        uint8[] memory _x,
        uint8[] memory _y,
        uint8[][] memory _neighbors,
        uint8[] memory _tier,
        uint256[] memory _garrison,
        Faction[] memory _controlledBy,
        uint256[] memory _cantGetAttackedTill
    ) external onlyOwner {
        require(!deploymentDone, "deployment already done");
        for (uint8 i; i < _regionId.length; i++) {
            regionIds.push(_regionId[i]);
            Region storage region = regions[_regionId[i]];
            region.id = _regionId[i];
            region.x = _x[i];
            region.y = _y[i];
            region.neighbors = _neighbors[i];
            region.tier = _tier[i];
            region.garrison = _garrison[i];
            region.controlledBy = _controlledBy[i];
            region.cantGetAttackedTill = _cantGetAttackedTill[i];
            regionsPerFaction[uint8(_controlledBy[i])]++;
        }
    }

    function claimFees() external {
        require(claimableFees[msg.sender] > 0, "no fees");
        pleb.mint(msg.sender, claimableFees[msg.sender]);
        emit FeesClaimed(msg.sender, claimableFees[msg.sender]);
    }

    function claimTicketRevenue() external onlyOwner {
        ticketRevenueRecipient.transfer(address(this).balance);
    }

    /* ========== PRIVATE FUNCTIONS ========== */

    function _joinGame() internal {
        if (!factionDead[uint8(nextPlayerFaction)]) {
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
        if (region.siege.attackedAt.add(settings.rallyTime) < block.timestamp) {
            (
                bool siegeIsOver,
                bool defenderWon,
                uint256 newGarrison
            ) = siegeOutcome(_region);
            if (siegeIsOver) {
                emit ResolvedSiege(
                    _region,
                    region.controlledBy,
                    region.garrison,
                    region.siege.attacker,
                    region.siege.soldier,
                    defenderWon
                );
                if (defenderWon) {
                    region.garrison = newGarrison;
                    region.besieged = false;
                    region.cantGetAttackedTill = block.timestamp.add(
                        settings.siegeCooldown
                    );
                    (
                        region.tier,
                        region.totalWorker
                    ) = _calculateNewRegionTierAndTotalWorker(
                        region.tier,
                        newGarrison,
                        region.totalWorker
                    );
                    delete region.siege;
                } else {
                    region.garrison = newGarrison;
                    region.besieged = false;
                    region.tier = 0;
                    regionsPerFaction[uint8(region.siege.attacker)]++;
                    regionsPerFaction[uint8(region.controlledBy)]--;
                    if (regionsPerFaction[uint8(region.controlledBy)] == 0) {
                        _killFaction(region.controlledBy);
                    }
                    region.controlledBy = region.siege.attacker;

                    delete region.siege;
                    delete region.totalWorker;
                    delete region.production;
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

    function _killFaction(Faction faction) internal {
        factionDead[uint8(faction)] = true;
        emit FactionLost(faction);
    }

    function _updateClaimable(uint8 _region, address _player) internal {
        Region storage region = regions[_region];
        if (
            region.production.length > 0 &&
            region.production[region.productionByLord[msg.sender]].lord ==
            msg.sender &&
            region.production[region.productionByLord[msg.sender]].worker > 0
        ) {
            uint256 claimable = getClaimablePleb(_region, _player);
            region
                .production[region.productionByLord[msg.sender]]
                .claimablePleb = claimable;
            region
                .production[region.productionByLord[msg.sender]]
                .lastClaimedAt = block.timestamp;
        }
    }

    function _calculateNewRegionTierAndTotalWorker(
        uint8 tier,
        uint256 newGarrison,
        uint256 totalWorker
    ) internal view returns (uint8, uint256) {
        uint8 newTier;
        uint256 newWorker = totalWorker;
        for (uint8 i; i < tier; i++) {
            if (newGarrison > regionTiers[i].requiredGarrison) {
                newTier = i;
            }
        }
        if (regionTiers[newTier].workerLimit < totalWorker) {
            newWorker = regionTiers[newTier].workerLimit;
        }
        return (newTier, newWorker);
    }

    /* ========== SETTER ========== */

    function setSettings(
        uint256 _ticketPrice,
        uint256 _rallyTime,
        uint256 _siegeTime,
        uint256 _siegeCooldown,
        uint256 _overwhelming,
        uint256 _overwhelmingPenalty,
        uint256 _plebForSoldier
    ) public onlyOwner {
        Settings memory newSettings = Settings({
            ticketPrice: _ticketPrice,
            rallyTime: _rallyTime,
            siegeTime: _siegeTime,
            siegeCooldown: _siegeCooldown,
            overwhelming: _overwhelming,
            overwhelmingPenalty: _overwhelmingPenalty,
            plebForSoldier: _plebForSoldier
        });
        emit SettingsChanged(settings, newSettings);
        settings = newSettings;
    }

    function setRegionTiers(RegionTier[5] memory tiers) external onlyOwner {
        for (uint8 i; i < 5; i++) {
            regionTiers[i] = tiers[i];
        }
    }

    function setDeploymentDone() external onlyOwner {
        require(!deploymentDone, "deployment already done");
        deploymentDone = true;
    }

    /* ========== MODIFIER ========== */

    modifier resolveSiegeMod(uint8 region) {
        if (
            regions[region].besieged &&
            regions[region].siege.attackedAt.add(settings.rallyTime) <=
            block.timestamp
        ) {
            _resolveSiege(region);
        }
        _;
    }

    modifier updateClaimable(uint8 _region, address _player) {
        _updateClaimable(_region, _player);
        _;
    }
}
