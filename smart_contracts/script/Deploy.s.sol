// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import "forge-std/Script.sol";
import "../src/Airtime.sol";

contract DeployScript is Script {
    function setUp() public {}

    function run() public returns (Airtime) {
        address usdcTokenAddress = vm.envAddress("USDC_MAINNET_TOKEN_ADDRESS");
        address treasuryAddress = vm.envAddress("TREASURY_ADDRESS");
        address permit2Address = vm.envAddress("PERMIT2_ADDRESS");

        console.log("Deploying with parameters:");
        console.log("USDC Token:", usdcTokenAddress);
        console.log("Treasury:", treasuryAddress);
        console.log("Permit2:", permit2Address);

        vm.startBroadcast();

        Airtime airtime = new Airtime(usdcTokenAddress, treasuryAddress, permit2Address);

        console.log("\nAirtime contract deployed at:", address(airtime));
        console.log("Treasury address:", airtime.treasury());
        console.log("USDC Token address:", airtime.usdcToken());
        console.log("Permit2 address:", airtime.permit2());

        vm.stopBroadcast();

        return airtime;
    }
}
