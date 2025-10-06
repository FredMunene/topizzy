// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import "forge-std/Script.sol";
import "../src/Airtime.sol";

contract DeployScript is Script {
    function setUp() public {}

    function run() public returns (Airtime) {
        // Start broadcasting to the specified chain
        vm.startBroadcast();

        // Deploy the Airtime contract
        Airtime airtime = new Airtime();

        // Stop broadcasting
        vm.stopBroadcast();

        return airtime;
    }
}