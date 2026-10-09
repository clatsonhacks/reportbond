// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {ReportBondWithFees} from "../src/ReportBondWithFees.sol";

contract DeployWithFeesScript is Script {
    function run() external {
        // Get deployer from environment
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        // Protocol owner should be a multisig or DAO in production
        // For now, using deployer address
        address protocolOwner = deployer;

        console.log("Deploying ReportBondWithFees...");
        console.log("Deployer:", deployer);
        console.log("Protocol Owner:", protocolOwner);

        vm.startBroadcast(deployerPrivateKey);

        // Deploy contract
        ReportBondWithFees reportBond = new ReportBondWithFees(protocolOwner);

        console.log("ReportBondWithFees deployed at:", address(reportBond));
        console.log("Block number:", block.number);
        console.log("");
        console.log("Fee Structure:");
        console.log("- Report submission fee: 1%");
        console.log("- Pool creation fee: 1 USDC");
        console.log("- Bounty payout fee: 2%");
        console.log("");
        console.log("Update config with this address:", address(reportBond));
        console.log("And this block number:", block.number);

        vm.stopBroadcast();
    }
}
