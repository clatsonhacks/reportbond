// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ReportBond} from "../src/ReportBond.sol";
import {IERC1271} from "@openzeppelin/contracts/interfaces/IERC1271.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// Smart wallet that accepts signatures from its owner EOA.
contract MockSmartWallet is IERC1271 {
    address public immutable owner;

    constructor(address owner_) {
        owner = owner_;
    }

    function isValidSignature(bytes32 hash, bytes memory sig) external view returns (bytes4) {
        (address rec,,) = ECDSA.tryRecover(hash, sig);
        return rec == owner ? IERC1271.isValidSignature.selector : bytes4(0xffffffff);
    }
}

/// Receiver that tries to re-enter withdraw() when paid.
contract ReentrantReporter {
    ReportBond public immutable bond;
    uint256 public reentryAttempts;
    bool public reentrySucceeded;

    constructor(ReportBond bond_) {
        bond = bond_;
    }

    function submit(uint256 poolId, uint256 deposit) external returns (uint256) {
        return bond.submitReport{value: deposit}(poolId, keccak256("reentrant"));
    }

    function pull() external {
        bond.withdraw();
    }

    receive() external payable {
        if (reentryAttempts == 0) {
            reentryAttempts++;
            try bond.withdraw() {
                reentrySucceeded = true;
            } catch {}
        }
    }
}

contract ReportBondTestBase is Test {
    ReportBond bond;

    uint256 signerKey = 0xA11CE;
    address signer;
    address creator = makeAddr("creator");
    address reporter = makeAddr("reporter");
    address stranger = makeAddr("stranger");

    uint256 constant DEPOSIT = 5 ether; // 5 USDC, 18 decimals
    uint64 constant TIMEOUT = 14 days;
    uint256 constant MAX_PAYOUT = 3 ether;
    uint256 constant FUNDING = 10 ether;
    bytes32 constant REPO = keccak256("acme/parser");
    bytes32 constant ADVISORY = keccak256("https://github.com/acme/parser/security/advisories/GHSA-xxxx-xxxx-xxxx");

    uint8 constant VALID = 3;
    uint8 constant MISTAKE = 4;
    uint8 constant SLOP = 5;

    uint256 poolId;

    function setUp() public virtual {
        bond = new ReportBond();
        signer = vm.addr(signerKey);
        vm.deal(creator, 100 ether);
        vm.deal(reporter, 100 ether);
        vm.deal(stranger, 100 ether);

        vm.prank(creator);
        poolId = bond.createPool{value: FUNDING}(REPO, signer, DEPOSIT, TIMEOUT, MAX_PAYOUT);
    }

    function _submit() internal returns (uint256) {
        vm.prank(reporter);
        return bond.submitReport{value: DEPOSIT}(poolId, ADVISORY);
    }

    function _verdictDigest(ReportBond b, uint256 reportId, uint8 verdict, uint256 bounty, uint256 deadline)
        internal
        view
        returns (bytes32)
    {
        bytes32 structHash = keccak256(abi.encode(b.VERDICT_TYPEHASH(), reportId, verdict, bounty, deadline));
        return keccak256(abi.encodePacked("\x19\x01", b.domainSeparator(), structHash));
    }

    function _signVerdict(uint256 key, uint256 reportId, uint8 verdict, uint256 bounty, uint256 deadline)
        internal
        view
        returns (bytes memory)
    {
        return _sign(key, _verdictDigest(bond, reportId, verdict, bounty, deadline));
    }

    function _sign(uint256 key, bytes32 digest) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    function _verdict(uint256 reportId, uint8 verdict, uint256 bounty) internal {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signVerdict(signerKey, reportId, verdict, bounty, deadline);
        vm.prank(stranger);
        bond.submitVerdict(reportId, verdict, bounty, deadline, sig);
    }

    function _status(uint256 reportId) internal view returns (ReportBond.Status s) {
        (,,,, s,) = bond.reports(reportId);
    }

    function _balances(uint256 id) internal view returns (uint256 funded, uint256 slashed, uint32 open) {
        (,,,,,, funded, slashed, open) = bond.pools(id);
    }
}

contract ReportBondTest is ReportBondTestBase {
    // ------------------------------------------------------------ pools

    function test_CreatePool() public view {
        (bytes32 repoId, address c, address vs, uint256 dep, uint64 to, uint256 maxP, uint256 funded,,) =
            bond.pools(poolId);
        assertEq(repoId, REPO);
        assertEq(c, creator);
        assertEq(vs, signer);
        assertEq(dep, DEPOSIT);
        assertEq(to, TIMEOUT);
        assertEq(maxP, MAX_PAYOUT);
        assertEq(funded, FUNDING);
    }

    function test_CreatePool_RevertsOnZeroValues() public {
        vm.expectRevert(ReportBond.ZeroValue.selector);
        bond.createPool(bytes32(0), signer, DEPOSIT, TIMEOUT, MAX_PAYOUT);
        vm.expectRevert(ReportBond.ZeroValue.selector);
        bond.createPool(REPO, address(0), DEPOSIT, TIMEOUT, MAX_PAYOUT);
        vm.expectRevert(ReportBond.ZeroValue.selector);
        bond.createPool(REPO, signer, 0, TIMEOUT, MAX_PAYOUT);
        vm.expectRevert(ReportBond.ZeroValue.selector);
        bond.createPool(REPO, signer, DEPOSIT, 0, MAX_PAYOUT);
        vm.expectRevert(ReportBond.ZeroValue.selector);
        bond.createPool(REPO, signer, DEPOSIT, TIMEOUT, 0);
    }

    function test_FundPool() public {
        vm.prank(creator);
        bond.fundPool{value: 2 ether}(poolId);
        (uint256 funded,,) = _balances(poolId);
        assertEq(funded, FUNDING + 2 ether);
    }

    function test_FundPool_RevertsForNonCreator() public {
        vm.prank(stranger);
        vm.expectRevert(ReportBond.NotPoolCreator.selector);
        bond.fundPool{value: 1 ether}(poolId);
    }

    // --------------------------------------------------------- deposits

    function test_Submit_ExactDeposit() public {
        uint256 id = _submit();
        assertEq(uint8(_status(id)), uint8(ReportBond.Status.Submitted));
        (,, uint32 open) = _balances(poolId);
        assertEq(open, 1);
        assertEq(bond.deadlineOf(id), block.timestamp + TIMEOUT);
    }

    function test_Submit_RevertsOnWrongDeposit() public {
        vm.startPrank(reporter);
        vm.expectRevert(ReportBond.WrongDeposit.selector);
        bond.submitReport{value: DEPOSIT - 1}(poolId, ADVISORY);
        vm.expectRevert(ReportBond.WrongDeposit.selector);
        bond.submitReport{value: DEPOSIT + 1}(poolId, ADVISORY);
        vm.stopPrank();
    }

    function test_Submit_RevertsOnMissingPool() public {
        vm.prank(reporter);
        vm.expectRevert(ReportBond.PoolNotFound.selector);
        bond.submitReport{value: DEPOSIT}(999, ADVISORY);
    }

    // --------------------------------------------------- acknowledgement

    function test_Acknowledge() public {
        uint256 id = _submit();
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 structHash = keccak256(abi.encode(bond.ACKNOWLEDGE_TYPEHASH(), id, deadline));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", bond.domainSeparator(), structHash));
        bytes memory sig = _sign(signerKey, digest);

        vm.prank(stranger);
        bond.acknowledge(id, deadline, sig);
        assertEq(uint8(_status(id)), uint8(ReportBond.Status.Acknowledged));

        // A second acknowledgement reverts; a verdict is still allowed.
        vm.expectRevert(ReportBond.ReportNotOpen.selector);
        bond.acknowledge(id, deadline, sig);
        _verdict(id, MISTAKE, 0);
        assertEq(uint8(_status(id)), MISTAKE);
    }

    // ---------------------------------------------------------- verdicts

    function test_Valid_CreditsDepositPlusBounty_SlashedFirst() public {
        // Build up 5 USDC of slashed funds first.
        uint256 slopId = _submit();
        _verdict(slopId, SLOP, 0);

        uint256 id = _submit();
        _verdict(id, VALID, 3 ether);

        assertEq(bond.credits(reporter), DEPOSIT + 3 ether);
        (uint256 funded, uint256 slashed, uint32 open) = _balances(poolId);
        assertEq(slashed, DEPOSIT - 3 ether, "slashed used first");
        assertEq(funded, FUNDING, "funded untouched");
        assertEq(open, 0);
        assertEq(uint8(_status(id)), VALID);
    }

    function test_Valid_SpillsIntoFundedWhenSlashedShort() public {
        uint256 slopId = _submit();
        _verdict(slopId, SLOP, 0); // slashed = 5

        // Lower slashed to 2 by paying a 3 bounty.
        _verdict(_submit(), VALID, 3 ether);
        // Now bounty 3: 2 from slashed, 1 from funded.
        _verdict(_submit(), VALID, 3 ether);
        (uint256 funded, uint256 slashed,) = _balances(poolId);
        assertEq(slashed, 0);
        assertEq(funded, FUNDING - 1 ether);
    }

    function test_Mistake_CreditsDepositOnly() public {
        uint256 id = _submit();
        _verdict(id, MISTAKE, 0);
        assertEq(bond.credits(reporter), DEPOSIT);
        (uint256 funded, uint256 slashed,) = _balances(poolId);
        assertEq(funded, FUNDING);
        assertEq(slashed, 0);
    }

    function test_Slop_MovesDepositToSlashed() public {
        uint256 id = _submit();
        _verdict(id, SLOP, 0);
        assertEq(bond.credits(reporter), 0);
        (, uint256 slashed,) = _balances(poolId);
        assertEq(slashed, DEPOSIT);
    }

    function test_SecondVerdict_Reverts() public {
        uint256 id = _submit();
        _verdict(id, MISTAKE, 0);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signVerdict(signerKey, id, SLOP, 0, deadline);
        vm.expectRevert(ReportBond.ReportNotOpen.selector);
        bond.submitVerdict(id, SLOP, 0, deadline, sig);
    }

    function test_SameSignatureTwice_Reverts() public {
        uint256 id = _submit();
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signVerdict(signerKey, id, SLOP, 0, deadline);
        bond.submitVerdict(id, SLOP, 0, deadline, sig);
        vm.expectRevert(ReportBond.ReportNotOpen.selector);
        bond.submitVerdict(id, SLOP, 0, deadline, sig);
    }

    function test_WrongSigner_Reverts() public {
        uint256 id = _submit();
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signVerdict(0xBAD, id, VALID, 1 ether, deadline);
        vm.expectRevert(ReportBond.InvalidSignature.selector);
        bond.submitVerdict(id, VALID, 1 ether, deadline, sig);
    }

    function test_OtherChainId_Reverts() public {
        uint256 id = _submit();
        uint256 deadline = block.timestamp + 1 hours;
        uint256 realChain = block.chainid;
        vm.chainId(5042); // sign under the mainnet domain
        bytes memory sig = _signVerdict(signerKey, id, MISTAKE, 0, deadline);
        vm.chainId(realChain);
        vm.expectRevert(ReportBond.InvalidSignature.selector);
        bond.submitVerdict(id, MISTAKE, 0, deadline, sig);
    }

    function test_OtherContract_Reverts() public {
        // Second deployment with an identical pool and report.
        ReportBond other = new ReportBond();
        vm.prank(creator);
        other.createPool{value: FUNDING}(REPO, signer, DEPOSIT, TIMEOUT, MAX_PAYOUT);
        vm.prank(reporter);
        uint256 otherId = other.submitReport{value: DEPOSIT}(1, ADVISORY);
        uint256 id = _submit();
        assertEq(otherId, id);

        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signVerdict(signerKey, id, MISTAKE, 0, deadline); // signed for `bond`
        vm.expectRevert(ReportBond.InvalidSignature.selector);
        other.submitVerdict(id, MISTAKE, 0, deadline, sig);
    }

    function test_TamperedFields_Revert() public {
        uint256 id = _submit();
        _submit(); // second report so a different reportId exists
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signVerdict(signerKey, id, SLOP, 0, deadline);

        vm.expectRevert(ReportBond.InvalidSignature.selector);
        bond.submitVerdict(id, VALID, 0, deadline, sig); // verdict changed
        vm.expectRevert(ReportBond.InvalidSignature.selector);
        bond.submitVerdict(id, SLOP, 1, deadline, sig); // bounty changed (checked before bounty rule)
        vm.expectRevert(ReportBond.InvalidSignature.selector);
        bond.submitVerdict(id + 1, SLOP, 0, deadline, sig); // report changed
        vm.expectRevert(ReportBond.InvalidSignature.selector);
        bond.submitVerdict(id, SLOP, 0, deadline + 1, sig); // deadline changed
    }

    function test_ExpiredDeadline_Reverts() public {
        uint256 id = _submit();
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signVerdict(signerKey, id, MISTAKE, 0, deadline);
        vm.warp(deadline + 1);
        vm.expectRevert(ReportBond.SignatureExpired.selector);
        bond.submitVerdict(id, MISTAKE, 0, deadline, sig);
    }

    function test_BountyAboveCap_Reverts() public {
        uint256 id = _submit();
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signVerdict(signerKey, id, VALID, MAX_PAYOUT + 1, deadline);
        vm.expectRevert(ReportBond.BountyTooHigh.selector);
        bond.submitVerdict(id, VALID, MAX_PAYOUT + 1, deadline, sig);
    }

    function test_BountyOnNonValid_Reverts() public {
        uint256 id = _submit();
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signVerdict(signerKey, id, MISTAKE, 1 ether, deadline);
        vm.expectRevert(ReportBond.BountyTooHigh.selector);
        bond.submitVerdict(id, MISTAKE, 1 ether, deadline, sig);
    }

    function test_BountyAbovePoolFunds_Reverts() public {
        vm.prank(creator);
        uint256 thinPool = bond.createPool{value: 1 ether}(REPO, signer, DEPOSIT, TIMEOUT, MAX_PAYOUT);
        vm.prank(reporter);
        uint256 id = bond.submitReport{value: DEPOSIT}(thinPool, ADVISORY);

        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signVerdict(signerKey, id, VALID, 2 ether, deadline);
        vm.expectRevert(ReportBond.InsufficientPoolFunds.selector);
        bond.submitVerdict(id, VALID, 2 ether, deadline, sig);
    }

    function test_InvalidVerdictValue_Reverts() public {
        uint256 id = _submit();
        uint256 deadline = block.timestamp + 1 hours;
        for (uint8 v = 0; v < 8; v++) {
            if (v >= VALID && v <= SLOP) continue;
            bytes memory sig = _signVerdict(signerKey, id, v, 0, deadline);
            vm.expectRevert(ReportBond.InvalidVerdict.selector);
            bond.submitVerdict(id, v, 0, deadline, sig);
        }
    }

    function test_VerdictFromRandomRelayer_Succeeds() public {
        uint256 id = _submit();
        _verdict(id, VALID, 1 ether); // _verdict relays from `stranger`
        assertEq(uint8(_status(id)), VALID);
    }

    function test_SmartWalletSigner_Accepted() public {
        MockSmartWallet wallet = new MockSmartWallet(signer);
        vm.prank(creator);
        uint256 swPool = bond.createPool{value: FUNDING}(REPO, address(wallet), DEPOSIT, TIMEOUT, MAX_PAYOUT);
        vm.prank(reporter);
        uint256 id = bond.submitReport{value: DEPOSIT}(swPool, ADVISORY);

        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signVerdict(signerKey, id, VALID, 1 ether, deadline);
        bond.submitVerdict(id, VALID, 1 ether, deadline, sig);
        assertEq(uint8(_status(id)), VALID);

        // And a signature from someone else is rejected by the wallet.
        vm.prank(reporter);
        uint256 id2 = bond.submitReport{value: DEPOSIT}(swPool, ADVISORY);
        bytes memory bad = _signVerdict(0xBAD, id2, MISTAKE, 0, deadline);
        vm.expectRevert(ReportBond.InvalidSignature.selector);
        bond.submitVerdict(id2, MISTAKE, 0, deadline, bad);
    }

    // ---------------------------------------------------------- timeouts

    function test_RefundOneSecondEarly_Reverts() public {
        uint256 id = _submit();
        vm.warp(block.timestamp + TIMEOUT - 1);
        vm.expectRevert(ReportBond.NotExpired.selector);
        bond.refundExpired(id);
    }

    function test_RefundAtDeadline_ByStranger() public {
        uint256 id = _submit();
        vm.warp(block.timestamp + TIMEOUT);
        vm.prank(stranger);
        bond.refundExpired(id);
        assertEq(bond.credits(reporter), DEPOSIT);
        assertEq(bond.credits(stranger), 0);
        assertEq(uint8(_status(id)), uint8(ReportBond.Status.Refunded));
        (,, uint32 open) = _balances(poolId);
        assertEq(open, 0);
    }

    function test_RefundAfterVerdict_Reverts() public {
        uint256 id = _submit();
        _verdict(id, SLOP, 0);
        vm.warp(block.timestamp + TIMEOUT);
        vm.expectRevert(ReportBond.ReportNotOpen.selector);
        bond.refundExpired(id);
    }

    function test_VerdictAfterRefund_Reverts() public {
        uint256 id = _submit();
        vm.warp(block.timestamp + TIMEOUT);
        bond.refundExpired(id);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signVerdict(signerKey, id, SLOP, 0, deadline);
        vm.expectRevert(ReportBond.ReportNotOpen.selector);
        bond.submitVerdict(id, SLOP, 0, deadline, sig);
    }

    function test_RefundMissingReport_Reverts() public {
        vm.expectRevert(ReportBond.ReportNotOpen.selector);
        bond.refundExpired(42);
    }

    // ------------------------------------------------------- withdrawals

    function test_Withdraw_SendsExactCredit() public {
        uint256 id = _submit();
        _verdict(id, VALID, 2 ether);
        uint256 before = reporter.balance;
        vm.prank(reporter);
        bond.withdraw();
        assertEq(reporter.balance, before + DEPOSIT + 2 ether);
        assertEq(bond.credits(reporter), 0);
    }

    function test_Withdraw_NothingOwed_Reverts() public {
        uint256 id = _submit();
        _verdict(id, MISTAKE, 0);
        vm.startPrank(reporter);
        bond.withdraw();
        vm.expectRevert(ReportBond.NothingToWithdraw.selector);
        bond.withdraw();
        vm.stopPrank();
    }

    function test_Withdraw_ReentrancyBlocked() public {
        ReentrantReporter attacker = new ReentrantReporter(bond);
        vm.deal(address(attacker), DEPOSIT);
        uint256 id = attacker.submit(poolId, DEPOSIT);
        _verdict(id, MISTAKE, 0);

        // Another reporter's credit sits in the contract as bait.
        _verdict(_submit(), MISTAKE, 0);

        uint256 contractBefore = address(bond).balance;
        attacker.pull();
        assertEq(attacker.reentryAttempts(), 1);
        assertFalse(attacker.reentrySucceeded());
        assertEq(address(attacker).balance, DEPOSIT);
        assertEq(address(bond).balance, contractBefore - DEPOSIT);
        assertEq(bond.credits(reporter), DEPOSIT);
    }

    function test_PoolWithdraw_BlockedWhileReportsOpen() public {
        _submit();
        vm.prank(creator);
        vm.expectRevert(ReportBond.ReportsOpen.selector);
        bond.withdrawPoolFunds(poolId, 1 ether);
    }

    function test_PoolWithdraw_FundedOnly() public {
        _verdict(_submit(), SLOP, 0); // slashed = 5, funded = 10
        uint256 before = creator.balance;
        vm.startPrank(creator);
        vm.expectRevert(ReportBond.InsufficientPoolFunds.selector);
        bond.withdrawPoolFunds(poolId, FUNDING + 1);
        bond.withdrawPoolFunds(poolId, FUNDING);
        vm.expectRevert(ReportBond.InsufficientPoolFunds.selector);
        bond.withdrawPoolFunds(poolId, 1); // only slashed remains
        vm.stopPrank();
        assertEq(creator.balance, before + FUNDING);
        (uint256 funded, uint256 slashed,) = _balances(poolId);
        assertEq(funded, 0);
        assertEq(slashed, DEPOSIT);
    }

    function test_PoolWithdraw_NonCreator_Reverts() public {
        vm.prank(stranger);
        vm.expectRevert(ReportBond.NotPoolCreator.selector);
        bond.withdrawPoolFunds(poolId, 1 ether);
    }

    // -------------------------------------------------------------- fuzz

    /// Random deposits, bounties and timings never let credits exceed the money that came in.
    function testFuzz_CreditsNeverExceedInflow(
        uint256 deposit,
        uint256 funding,
        uint256 maxPayout,
        uint256[6] memory bounties,
        uint8[6] memory actions,
        uint32[6] memory waits
    ) public {
        deposit = bound(deposit, 1, 1_000 ether);
        funding = bound(funding, 0, 1_000 ether);
        maxPayout = bound(maxPayout, 1, 1_000 ether);
        uint64 timeout = 1 days;

        vm.deal(creator, funding);
        vm.prank(creator);
        uint256 id = bond.createPool{value: funding}(REPO, signer, deposit, timeout, maxPayout);
        uint256 inflow = address(bond).balance;

        for (uint256 i; i < 6; i++) {
            vm.deal(reporter, deposit);
            vm.prank(reporter);
            uint256 rid = bond.submitReport{value: deposit}(id, ADVISORY);
            inflow += deposit;
            vm.warp(block.timestamp + bound(waits[i], 0, 2 days));

            uint8 a = actions[i] % 4;
            if (a == 3) {
                if (block.timestamp >= bond.deadlineOf(rid)) bond.refundExpired(rid);
                continue;
            }
            uint8 v = VALID + a;
            uint256 bounty = v == VALID ? bound(bounties[i], 0, maxPayout) : 0;
            uint256 deadline = block.timestamp + 1;
            bytes memory sig = _signVerdict(signerKey, rid, v, bounty, deadline);
            try bond.submitVerdict(rid, v, bounty, deadline, sig) {} catch {}
        }

        assertLe(bond.credits(reporter), inflow);
        assertEq(address(bond).balance, inflow);
    }
}
