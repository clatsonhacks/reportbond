// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {ReportBond} from "../src/ReportBond.sol";

/// forge script script/Deploy.s.sol --rpc-url $RPC_URL --private-key $DEPLOYER_PRIVATE_KEY --broadcast
contract Deploy is Script {
    function run() external returns (ReportBond bond) {
        vm.startBroadcast();
        bond = new ReportBond();
        vm.stopBroadcast();

        console.log("chainId        ", block.chainid);
        console.log("ReportBond     ", address(bond));
        console.log("deployBlock    ", block.number);
    }
}
