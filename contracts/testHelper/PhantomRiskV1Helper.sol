pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "hardhat/console.sol";
import "../PhantomRiskV1.sol";
import "../Pleb.sol";

contract PhantomRiskV1Helper is PhantomRiskV1 {
    constructor(Pleb _pleb, address payable _owner)
        PhantomRiskV1(_pleb, _owner)
    {}

    function killFaction(Faction faction_) external {
        _killFaction(faction_);
    }

    function setGarrison(uint8 _region, uint256 _amount) external {
        regions[_region].garrison = _amount;
    }

    function setWorker(uint8 _region, uint256 _amount) external {
        regions[_region].totalWorker = _amount;
    }

    function setSiege(
        uint8 _region,
        uint256 _amount,
        Faction _attacker
    ) external {
        regions[_region].besieged = true;
        regions[_region].siege = Siege({
            attacker: _attacker,
            soldier: _amount,
            attackedAt: block.timestamp
        });
    }

    function setCantGetAttackedTill(uint8 _region, uint256 _time) external {
        regions[_region].cantGetAttackedTill = _time;
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
}
