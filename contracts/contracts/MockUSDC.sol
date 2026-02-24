// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockUSDC - Test ERC20 stablecoin for local development
/// @notice Mints initial supply to deployer, exposes public mint for testing
contract MockUSDC is ERC20 {
    constructor(address initialHolder) ERC20("USD Coin", "USDC") {
        _mint(initialHolder, 1_000_000 * 10 ** decimals());
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice Public mint for testing — no access control
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
