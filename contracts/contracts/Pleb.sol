//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;


import "@openzeppelin/contracts/token/ERC20/presets/ERC20PresetMinterPauser.sol";
import "hardhat/console.sol";

contract Pleb is ERC20PresetMinterPauser {
  
  constructor() ERC20PresetMinterPauser("Pleb","PLEB"){}

  function decimals() public view virtual override returns (uint8) {
        return 1;
    }
}
