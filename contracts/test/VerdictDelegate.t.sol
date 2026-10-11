// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReportBond} from "../src/ReportBond.sol";
import {VerdictDelegate, VerdictDelegateFactory} from "../src/VerdictDelegate.sol";
import {ReportBondTestBase} from "./ReportBond.t.sol";

/// A pool whose verdict signer is a VerdictDelegate: the maintainer signs anything, the automatic
/// reviewer signs Slop and nothing else.
contract VerdictDelegateTest is ReportBondTestBase {
    VerdictDelegateFactory factory;
    VerdictDelegate delegate;
    uint256 autoKey = 0xB07;
    address autoSigner;
    uint256 delegatedPool;

    function setUp() public override {
        super.setUp();
        autoSigner = vm.addr(autoKey);
        factory = new VerdictDelegateFactory(autoSigner, address(bond));
        // `signer` (key signerKey) is the maintainer here.
        delegate = VerdictDelegate(factory.create(signer));
        vm.prank(creator);
        delegatedPool = bond.createPool{value: FUNDING}(REPO, address(delegate), DEPOSIT, TIMEOUT, MAX_PAYOUT);
    }

    function _report() internal returns (uint256) {
        vm.prank(reporter);
        return bond.submitReport{value: DEPOSIT}(delegatedPool, ADVISORY);
    }

    function _autoSig(uint256 key, uint256 reportId, uint8 verdict, uint256 bounty, uint256 deadline)
        internal
        view
        returns (bytes memory)
    {
        return abi.encode(reportId, deadline, _signVerdict(key, reportId, verdict, bounty, deadline));
    }

    // ---------------------------------------------------------------- factory

    function test_Factory_OneDelegatePerOwner() public {
        assertEq(factory.delegateOf(signer), address(delegate));
        assertEq(factory.create(signer), address(delegate), "second create returns the same delegate");
        assertEq(delegate.owner(), signer);
        assertEq(delegate.autoSigner(), autoSigner);
        assertEq(delegate.bond(), address(bond));
        assertTrue(factory.create(stranger) != address(delegate), "another owner gets their own");
    }

    function test_SlopDigest_MatchesReportBond() public view {
        assertEq(delegate.slopDigest(7, 1234), _verdictDigest(bond, 7, SLOP, 0, 1234));
    }

    // ------------------------------------------------------------------ owner

    function test_Owner_SignsAnyVerdict() public {
        uint256 id = _report();
        uint256 deadline = block.timestamp + 1 hours;
        bond.submitVerdict(id, VALID, 2 ether, deadline, _signVerdict(signerKey, id, VALID, 2 ether, deadline));
        assertEq(uint8(_status(id)), VALID);
        assertEq(bond.credits(reporter), DEPOSIT + 2 ether);
    }

    function test_Owner_CanAcknowledge() public {
        uint256 id = _report();
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 structHash = keccak256(abi.encode(bond.ACKNOWLEDGE_TYPEHASH(), id, deadline));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", bond.domainSeparator(), structHash));
        bond.acknowledge(id, deadline, _sign(signerKey, digest));
        assertEq(uint8(_status(id)), uint8(ReportBond.Status.Acknowledged));
    }

    function test_Stranger_CannotSign() public {
        uint256 id = _report();
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signVerdict(0xBAD, id, SLOP, 0, deadline);
        vm.expectRevert(ReportBond.InvalidSignature.selector);
        bond.submitVerdict(id, SLOP, 0, deadline, sig);
    }

    // ------------------------------------------------------- automatic reviewer

    function test_Auto_CanRejectSlop() public {
        uint256 id = _report();
        uint256 deadline = block.timestamp + 1 hours;
        vm.prank(stranger); // anyone may relay
        bond.submitVerdict(id, SLOP, 0, deadline, _autoSig(autoKey, id, SLOP, 0, deadline));
        assertEq(uint8(_status(id)), SLOP);
        (, uint256 slashed,) = _balances(delegatedPool);
        assertEq(slashed, DEPOSIT, "the deposit moved into the pool");
        assertEq(bond.credits(reporter), 0);
    }

    /// The whole point: the automatic key can never pay out.
    function test_Auto_CannotMarkValid() public {
        uint256 id = _report();
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _autoSig(autoKey, id, VALID, 3 ether, deadline);
        vm.expectRevert(ReportBond.InvalidSignature.selector);
        bond.submitVerdict(id, VALID, 3 ether, deadline, sig);

        bytes memory zeroBounty = _autoSig(autoKey, id, VALID, 0, deadline);
        vm.expectRevert(ReportBond.InvalidSignature.selector);
        bond.submitVerdict(id, VALID, 0, deadline, zeroBounty);
    }

    function test_Auto_CannotMarkMistake() public {
        uint256 id = _report();
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _autoSig(autoKey, id, MISTAKE, 0, deadline);
        vm.expectRevert(ReportBond.InvalidSignature.selector);
        bond.submitVerdict(id, MISTAKE, 0, deadline, sig);
    }

    /// A Slop signature can't be relabelled: the verdict submitted must be the one that was signed.
    function test_Auto_SlopSignatureCannotBeSubmittedAsValid() public {
        uint256 id = _report();
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory slopSig = _autoSig(autoKey, id, SLOP, 0, deadline);
        vm.expectRevert(ReportBond.InvalidSignature.selector);
        bond.submitVerdict(id, VALID, 1 ether, deadline, slopSig);
    }

    function test_Auto_CannotUseThePlainSignaturePath() public {
        uint256 id = _report();
        uint256 deadline = block.timestamp + 1 hours;
        // A bare 65-byte signature is only accepted from the owner, whatever it signs.
        bytes memory sig = _signVerdict(autoKey, id, SLOP, 0, deadline);
        vm.expectRevert(ReportBond.InvalidSignature.selector);
        bond.submitVerdict(id, SLOP, 0, deadline, sig);
    }

    function test_Auto_WrongKeyOrOtherReport_Reverts() public {
        uint256 id = _report();
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory wrongKey = _autoSig(0xBAD, id, SLOP, 0, deadline);
        vm.expectRevert(ReportBond.InvalidSignature.selector);
        bond.submitVerdict(id, SLOP, 0, deadline, wrongKey);

        // Signed for another report ID.
        bytes memory other = _autoSig(autoKey, id + 1, SLOP, 0, deadline);
        vm.expectRevert(ReportBond.InvalidSignature.selector);
        bond.submitVerdict(id, SLOP, 0, deadline, other);
    }

    function test_Auto_CannotAcknowledge() public {
        uint256 id = _report();
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 structHash = keccak256(abi.encode(bond.ACKNOWLEDGE_TYPEHASH(), id, deadline));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", bond.domainSeparator(), structHash));
        bytes memory sig = abi.encode(id, deadline, _sign(autoKey, digest));
        vm.expectRevert(ReportBond.InvalidSignature.selector);
        bond.acknowledge(id, deadline, sig);
    }

    function test_MalformedSignatures_Revert() public {
        uint256 id = _report();
        uint256 deadline = block.timestamp + 1 hours;
        vm.expectRevert(ReportBond.InvalidSignature.selector);
        bond.submitVerdict(id, SLOP, 0, deadline, hex"");
        vm.expectRevert(ReportBond.InvalidSignature.selector);
        bond.submitVerdict(id, SLOP, 0, deadline, new bytes(224));
        vm.expectRevert(ReportBond.InvalidSignature.selector);
        bond.submitVerdict(id, SLOP, 0, deadline, new bytes(100));
    }

    /// Pools that use a plain wallet as signer are untouched by any of this.
    function test_Auto_HasNoPowerOverOrdinaryPools() public {
        uint256 id = _submit(); // the base pool, signed by `signer` directly
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _autoSig(autoKey, id, SLOP, 0, deadline);
        vm.expectRevert(ReportBond.InvalidSignature.selector);
        bond.submitVerdict(id, SLOP, 0, deadline, sig);
    }

    function testFuzz_Auto_OnlyEverSlopWithNoBounty(uint8 verdict, uint256 bounty) public {
        verdict = uint8(bound(verdict, VALID, SLOP));
        bounty = bound(bounty, 0, MAX_PAYOUT);
        vm.assume(!(verdict == SLOP && bounty == 0));
        uint256 id = _report();
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _autoSig(autoKey, id, verdict, bounty, deadline);
        vm.expectRevert();
        bond.submitVerdict(id, verdict, bounty, deadline, sig);
    }
}
