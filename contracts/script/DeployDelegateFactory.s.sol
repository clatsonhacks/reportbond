// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {VerdictDelegateFactory} from "../src/VerdictDelegate.sol";

/// Deploys the factory for automatic-slop delegates next to an existing ReportBond.
///   BOND=0x… AUTO_SIGNER=0x… forge script script/DeployDelegateFactory.s.sol \
///     --rpc-url $RPC_URL --private-key $DEPLOYER_PRIVATE_KEY --broadcast
/// AUTO_SIGNER is the address of the key the app signs automatic Slop verdicts with (its relayer).
contract DeployDelegateFactory is Script {
    function run() external returns (VerdictDelegateFactory factory) {
        address bond = vm.envAddress("BOND");
        address autoSigner = vm.envAddress("AUTO_SIGNER");
        vm.startBroadcast();
        factory = new VerdictDelegateFactory(autoSigner, bond);
        vm.stopBroadcast();

        console.log("chainId          ", block.chainid);
        console.log("ReportBond       ", bond);
        console.log("autoSigner       ", autoSigner);
        console.log("DelegateFactory  ", address(factory));
    }
}
