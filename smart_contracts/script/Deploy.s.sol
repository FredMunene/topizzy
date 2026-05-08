// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import "forge-std/Script.sol";
import "../src/Airtime.sol";

contract DeployScript is Script {
    function setUp() public {}

    function run() public returns (Airtime) {
        // USDC token addresses
        
        address usdcTokenAddress = vm.envAddress("USDC_MAINNET_TOKEN_ADDRESS");
        address treasuryAddress = vm.envAddress("TREASURY_ADDRESS");
        address operatorAddress = vm.envAddress("OPERATOR_ADDRESS");

        console.log("Deploying with parameters:");
        console.log("USDC Token:", usdcTokenAddress);
        console.log("Treasury:", treasuryAddress);
        console.log("Operator:", operatorAddress);

        // Start broadcasting to the specified chain
        vm.startBroadcast();

        Airtime airtime = new Airtime(usdcTokenAddress, treasuryAddress, operatorAddress);

        console.log("\nAirtime contract deployed at:", address(airtime));
        console.log("Treasury address:", airtime.treasury());
        console.log("Operator address:", airtime.operator());
        console.log("USDC Token address:", airtime.usdcToken());

        // Stop broadcasting
        vm.stopBroadcast();

        return airtime;
    }
}