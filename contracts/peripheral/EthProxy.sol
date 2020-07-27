// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.6.10;

import "../interfaces/IController.sol";
import "../interfaces/IWeth.sol";


/// @dev EthProxy allows users to post and withdraw Eth to the Controller, which will be converted to and from Weth in the process.
contract EthProxy {

    bytes32 public constant WETH = "ETH-A";

    IWeth internal _weth;
    address internal _treasury;
    IController internal _controller;

    constructor (
        address payable weth_,
        address treasury_,
        address controller_
    ) public {
        _weth = IWeth(weth_);
        _controller = IController(controller_);
        _weth.approve(address(treasury_), uint(-1));
    }

    /// @dev The WETH9 contract will send ether to EthProxy on `_weth.withdraw` using this function.
    receive() external payable { }

    /// @dev Users use `post` in EthProxy to post ETH to the Controller, which will be converted to Weth here.
    /// Users must have called `controller.addDelegate(ethProxy.address)` to authorize EthProxy to act in their behalf.
<<<<<<< HEAD
    /// Use of EthProxy cannot be delegated further.
    /// @param from Wallet to take eth from.
    /// @param to Yield vault to put the collateral in.
    /// @param amount Amount of collateral to move.
    function post(address from, address to, uint256 amount)
        public payable onlyHolderOrDelegate(from, "EthProxy: Only Holder Or Delegate") {
=======
    function post(uint256 amount)
        public payable {
>>>>>>> master
        _weth.deposit{ value: amount }();
        _controller.post(WETH, address(this), msg.sender, amount);
    }

    /// @dev Users wishing to withdraw their Weth as ETH from the Controller should use this function.
    /// Users must have called `controller.addDelegate(ethProxy.address)` to authorize EthProxy to act in their behalf.
<<<<<<< HEAD
    /// Use of EthProxy cannot be delegated further.
    /// @param from Yield vault to take weth from.
    /// @param to Wallet to put the weth in.
    /// @param amount Amount of weth to move.
    function withdraw(address from, address payable to, uint256 amount)
        public onlyHolderOrDelegate(from, "EthProxy: Only Holder Or Delegate") {
        _controller.withdraw(WETH, from, address(this), amount);
=======
    function withdraw(uint256 amount)
        public  {
        _controller.withdraw(WETH, msg.sender, address(this), amount);
>>>>>>> master
        _weth.withdraw(amount);
        msg.sender.transfer(amount);
    }
}