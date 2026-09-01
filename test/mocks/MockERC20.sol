// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Stands in for tUSDC. Defaults to 6 decimals to mirror testnet collateral,
///         so decimal-scale mistakes surface here rather than on-chain.
contract MockERC20 is ERC20 {
    uint8 private immutable _DECIMALS;

    constructor(string memory n, string memory s, uint8 d) ERC20(n, s) {
        _DECIMALS = d;
    }

    function decimals() public view override returns (uint8) {
        return _DECIMALS;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    /// @notice Mirrors the real tUSDC faucet: credits msg.sender, capped per call.
    function faucet(uint256 amount) external {
        require(amount <= 10_000 * 10 ** _DECIMALS, "FaucetCapExceeded");
        _mint(msg.sender, amount);
    }
}

/// @notice Collateral that skims a fee on transfer. Ballast will not deploy against one,
///         but the vault must never over-credit if it did — that is invariant I3.
contract FeeOnTransferERC20 is ERC20 {
    uint256 public immutable FEE_BPS;

    constructor(uint256 feeBps_) ERC20("Fee", "FEE") {
        FEE_BPS = feeBps_;
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function _update(address from, address to, uint256 value) internal override {
        if (from == address(0) || to == address(0)) {
            super._update(from, to, value);
            return;
        }
        uint256 fee = (value * FEE_BPS) / 10_000;
        super._update(from, to, value - fee);
        if (fee > 0) super._update(from, address(0xFEE), fee);
    }
}
