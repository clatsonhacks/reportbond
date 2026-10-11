// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {ReportBond} from "../src/ReportBond.sol";
import {VerdictDelegateFactory} from "../src/VerdictDelegate.sol";

/// forge script script/Deploy.s.sol --rpc-url $RPC_URL --private-key $DEPLOYER_PRIVATE_KEY --broadcast
/// With AUTO_SIGNER=0x… (the app's relayer address) it also deploys the factory for automatic-slop
/// delegates. For an existing ReportBond, use DeployDelegateFactory.s.sol instead.
contract Deploy is Script {
    function run() external returns (ReportBond bond) {
        address autoSigner = vm.envOr("AUTO_SIGNER", address(0));
        vm.startBroadcast();
        bond = new ReportBond();
        VerdictDelegateFactory factory;
        if (autoSigner != address(0)) factory = new VerdictDelegateFactory(autoSigner, address(bond));
        vm.stopBroadcast();

        console.log("chainId        ", block.chainid);
        console.log("ReportBond     ", address(bond));
        console.log("deployBlock    ", block.number);
        if (autoSigner != address(0)) console.log("DelegateFactory", address(factory));
    }
}
