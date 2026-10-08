// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ReportBond} from "../src/ReportBond.sol";

/// Drives random sequences of every money-moving action and tracks the accounts it touches.
contract Handler is Test {
    ReportBond public immutable bond;
    uint256 public immutable signerKey;
    address public immutable signer;

    address[] public actors;
    uint256[] public poolIds;
    uint256[] public reportIds;

    constructor(ReportBond bond_, uint256 signerKey_) {
        bond = bond_;
        signerKey = signerKey_;
        signer = vm.addr(signerKey_);
        for (uint256 i; i < 4; i++) {
            actors.push(makeAddr(string(abi.encodePacked("actor", vm.toString(i)))));
        }
    }

    function actorCount() external view returns (uint256) {
        return actors.length;
    }

    function poolCount() external view returns (uint256) {
        return poolIds.length;
    }

    function reportCount() external view returns (uint256) {
        return reportIds.length;
    }

    function _actor(uint256 seed) internal view returns (address) {
        return actors[seed % actors.length];
    }

    function createPool(uint256 actorSeed, uint256 deposit, uint256 funding, uint256 maxPayout, uint64 timeout)
        external
    {
        address a = _actor(actorSeed);
        deposit = bound(deposit, 1, 100 ether);
        funding = bound(funding, 0, 100 ether);
        maxPayout = bound(maxPayout, 1, 100 ether);
        timeout = uint64(bound(timeout, 1, 30 days));
        vm.deal(a, funding);
        vm.prank(a);
        poolIds.push(bond.createPool{value: funding}(keccak256("repo"), signer, deposit, timeout, maxPayout));
    }

    function fundPool(uint256 poolSeed, uint256 amount) external {
        if (poolIds.length == 0) return;
        uint256 id = poolIds[poolSeed % poolIds.length];
        (, address creator,,,,,,,) = bond.pools(id);
        amount = bound(amount, 1, 100 ether);
        vm.deal(creator, amount);
        vm.prank(creator);
        bond.fundPool{value: amount}(id);
    }

    function submitReport(uint256 actorSeed, uint256 poolSeed) external {
        if (poolIds.length == 0) return;
        uint256 id = poolIds[poolSeed % poolIds.length];
        (,,, uint256 deposit,,,,,) = bond.pools(id);
        address a = _actor(actorSeed);
        vm.deal(a, deposit);
        vm.prank(a);
        reportIds.push(bond.submitReport{value: deposit}(id, keccak256("advisory")));
    }

    function verdict(uint256 reportSeed, uint8 v, uint256 bounty) external {
        if (reportIds.length == 0) return;
        uint256 rid = reportIds[reportSeed % reportIds.length];
        v = uint8(bound(v, 3, 5));
        if (v == 3) {
            (uint256 poolId,,,,,) = bond.reports(rid);
            (,,,,, uint256 maxPayout,,,) = bond.pools(poolId);
            bounty = bound(bounty, 0, maxPayout);
        } else {
            bounty = 0;
        }
        uint256 deadline = block.timestamp + 1;
        bytes32 structHash = keccak256(abi.encode(bond.VERDICT_TYPEHASH(), rid, v, bounty, deadline));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", bond.domainSeparator(), structHash));
        (uint8 sv, bytes32 r, bytes32 s) = vm.sign(signerKey, digest);
        try bond.submitVerdict(rid, v, bounty, deadline, abi.encodePacked(r, s, sv)) {} catch {}
    }

    function refund(uint256 reportSeed) external {
        if (reportIds.length == 0) return;
        try bond.refundExpired(reportIds[reportSeed % reportIds.length]) {} catch {}
    }

    function withdraw(uint256 actorSeed) external {
        address a = _actor(actorSeed);
        vm.prank(a);
        try bond.withdraw() {} catch {}
    }

    function withdrawPoolFunds(uint256 poolSeed, uint256 amount) external {
        if (poolIds.length == 0) return;
        uint256 id = poolIds[poolSeed % poolIds.length];
        (, address creator,,,,, uint256 funded,,) = bond.pools(id);
        if (funded == 0) return;
        amount = bound(amount, 1, funded);
        vm.prank(creator);
        try bond.withdrawPoolFunds(id, amount) {} catch {}
    }

    function warp(uint256 secs) external {
        vm.warp(block.timestamp + bound(secs, 0, 7 days));
    }
}

contract ReportBondInvariantTest is Test {
    ReportBond bond;
    Handler handler;

    function setUp() public {
        bond = new ReportBond();
        handler = new Handler(bond, 0xA11CE);
        targetContract(address(handler));
    }

    /// contract balance == credits + funded + slashed + open report deposits
    function invariant_BalanceMatchesAccounting() public view {
        uint256 total;
        for (uint256 i; i < handler.actorCount(); i++) {
            total += bond.credits(handler.actors(i));
        }
        for (uint256 i; i < handler.poolCount(); i++) {
            (,,,,,, uint256 funded, uint256 slashed,) = bond.pools(handler.poolIds(i));
            total += funded + slashed;
        }
        for (uint256 i; i < handler.reportCount(); i++) {
            (,, uint256 deposit,, ReportBond.Status s,) = bond.reports(handler.reportIds(i));
            if (s == ReportBond.Status.Submitted || s == ReportBond.Status.Acknowledged) total += deposit;
        }
        assertEq(address(bond).balance, total);
    }

    /// openReports always equals the number of open reports in the pool.
    function invariant_OpenReportsCounter() public view {
        for (uint256 i; i < handler.poolCount(); i++) {
            uint256 pid = handler.poolIds(i);
            (,,,,,,,, uint32 open) = bond.pools(pid);
            uint256 counted;
            for (uint256 j; j < handler.reportCount(); j++) {
                (uint256 rp,,,, ReportBond.Status s,) = bond.reports(handler.reportIds(j));
                if (rp == pid && (s == ReportBond.Status.Submitted || s == ReportBond.Status.Acknowledged)) counted++;
            }
            assertEq(open, counted);
        }
    }
}
