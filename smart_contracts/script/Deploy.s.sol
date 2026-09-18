// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.13;

import "forge-std/Script.sol";
import "../src/Airtime.sol";

contract DeployScript is Script {
    // Base mainnet / Base Sepolia chain IDs.
    uint256 constant BASE_MAINNET_CHAIN_ID = 8453;
    uint256 constant BASE_SEPOLIA_CHAIN_ID = 84532;

    // Arc mainnet / Arc testnet chain IDs (https://docs.arc.io/arc/references/connect-to-arc).
    uint256 constant ARC_MAINNET_CHAIN_ID = 5042;
    uint256 constant ARC_TESTNET_CHAIN_ID = 5042002;

    // USDC is Arc's native gas token, deployed at this fixed address on both
    // Arc mainnet and testnet (https://docs.arc.io/arc/references/contract-addresses).
    address constant ARC_USDC_ADDRESS = 0x3600000000000000000000000000000000000000;

    function setUp() public {}

    function run() public returns (Airtime) {
        address usdcTokenAddress = usdcTokenAddressForChain(block.chainid);
        address treasuryAddress = vm.envAddress("TREASURER_ADDRESS");
        address operatorAddress = vm.envAddress("OPERATOR_ADDRESS");

        console.log("Deploying with parameters:");
        console.log("Chain ID:", block.chainid);
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

    // Base's USDC address varies per deployment/network, so it's read from
    // env; Arc's is fixed and identical on mainnet and testnet, so it's
    // hardcoded rather than requiring yet another env var per network.
    function usdcTokenAddressForChain(uint256 chainId) internal view returns (address) {
        if (chainId == ARC_MAINNET_CHAIN_ID || chainId == ARC_TESTNET_CHAIN_ID) {
            return ARC_USDC_ADDRESS;
        }
        if (chainId == BASE_SEPOLIA_CHAIN_ID) {
            return vm.envAddress("USDC_SEPOLIA_TOKEN_ADDRESS");
        }
        if (chainId == BASE_MAINNET_CHAIN_ID) {
            return vm.envAddress("USDC_MAINNET_TOKEN_ADDRESS");
        }
        revert(string.concat("Deploy: unsupported chain ID ", vm.toString(chainId)));
    }
}