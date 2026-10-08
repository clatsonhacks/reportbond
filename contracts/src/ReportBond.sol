// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title ReportBond
/// @notice Refundable native-USDC deposits for private security reports.
///         The contract holds all money; there is no owner and no admin withdrawal.
/// @dev All amounts are 18-decimal native USDC units (Arc). Payments are pull-based:
///      verdicts and refunds only credit balances, and `withdraw` sends them.
contract ReportBond is EIP712, ReentrancyGuard {
    enum Status {
        None,
        Submitted,
        Acknowledged,
        Valid,
        Mistake,
        Slop,
        Refunded
    }

    struct Pool {
        bytes32 repoId; // keccak256("owner/repo")
        address creator;
        address verdictSigner; // EOA or smart wallet (ERC-1271)
        uint256 depositAmount; // exact deposit, 18-decimal native units
        uint64 timeout; // seconds from submission until refund unlocks
        uint256 maxPayout; // bounty cap per report
        uint256 fundedBalance; // creator-funded money (withdrawable when no open reports)
        uint256 slashedBalance; // slashed deposits (bounties only, never withdrawable)
        uint32 openReports;
    }

    struct Report {
        uint256 poolId;
        address reporter;
        uint256 deposit;
        uint64 createdAt;
        Status status;
        bytes32 advisoryHash; // keccak256 of the advisory link, never the link itself
    }

    // Must match app/lib/eip712.ts character for character.
    bytes32 public constant ACKNOWLEDGE_TYPEHASH = keccak256("Acknowledge(uint256 reportId,uint256 deadline)");
    bytes32 public constant VERDICT_TYPEHASH =
        keccak256("Verdict(uint256 reportId,uint8 verdict,uint256 bounty,uint256 deadline)");

    mapping(uint256 => Pool) public pools;
    mapping(uint256 => Report) public reports;
    mapping(address => uint256) public credits;

    uint256 public poolCount; // pool IDs start at 1
    uint256 public reportCount; // report IDs start at 1

    event PoolCreated(
        uint256 indexed poolId,
        bytes32 indexed repoId,
        address indexed creator,
        address verdictSigner,
        uint256 depositAmount,
        uint64 timeout,
        uint256 maxPayout,
        uint256 initialFunding
    );
    event PoolFunded(uint256 indexed poolId, address indexed from, uint256 amount);
    event ReportSubmitted(
        uint256 indexed reportId,
        uint256 indexed poolId,
        address indexed reporter,
        uint256 deposit,
        bytes32 advisoryHash,
        uint64 deadline
    );
    event ReportAcknowledged(uint256 indexed reportId, uint256 indexed poolId);
    event VerdictGiven(uint256 indexed reportId, Status verdict, uint256 bounty);
    event ReportRefunded(uint256 indexed reportId, uint256 indexed poolId, address indexed reporter, uint256 amount);
    event Withdrawn(address indexed account, uint256 amount);
    event PoolFundsWithdrawn(uint256 indexed poolId, address indexed creator, uint256 amount);

    error ZeroValue();
    error PoolNotFound();
    error NotPoolCreator();
    error WrongDeposit();
    error ReportNotOpen();
    error SignatureExpired();
    error InvalidSignature();
    error InvalidVerdict();
    error BountyTooHigh();
    error InsufficientPoolFunds();
    error NotExpired();
    error NothingToWithdraw();
    error ReportsOpen();
    error TransferFailed();

    constructor() EIP712("ReportBond", "1") {}

    // ---------------------------------------------------------------- pools

    function createPool(
        bytes32 repoId,
        address verdictSigner,
        uint256 depositAmount,
        uint64 timeout,
        uint256 maxPayout
    ) external payable returns (uint256 poolId) {
        if (repoId == bytes32(0) || verdictSigner == address(0) || depositAmount == 0 || timeout == 0 || maxPayout == 0)
        {
            revert ZeroValue();
        }

        poolId = ++poolCount;
        Pool storage p = pools[poolId];
        p.repoId = repoId;
        p.creator = msg.sender;
        p.verdictSigner = verdictSigner;
        p.depositAmount = depositAmount;
        p.timeout = timeout;
        p.maxPayout = maxPayout;
        p.fundedBalance = msg.value;

        emit PoolCreated(poolId, repoId, msg.sender, verdictSigner, depositAmount, timeout, maxPayout, msg.value);
    }

    function fundPool(uint256 poolId) external payable {
        Pool storage p = _pool(poolId);
        if (msg.sender != p.creator) revert NotPoolCreator();
        if (msg.value == 0) revert ZeroValue();

        p.fundedBalance += msg.value;
        emit PoolFunded(poolId, msg.sender, msg.value);
    }

    // -------------------------------------------------------------- reports

    function submitReport(uint256 poolId, bytes32 advisoryHash) external payable returns (uint256 reportId) {
        Pool storage p = _pool(poolId);
        if (advisoryHash == bytes32(0)) revert ZeroValue();
        if (msg.value != p.depositAmount) revert WrongDeposit();

        reportId = ++reportCount;
        reports[reportId] = Report({
            poolId: poolId,
            reporter: msg.sender,
            deposit: msg.value,
            createdAt: uint64(block.timestamp),
            status: Status.Submitted,
            advisoryHash: advisoryHash
        });
        p.openReports++;

        emit ReportSubmitted(reportId, poolId, msg.sender, msg.value, advisoryHash, uint64(block.timestamp) + p.timeout);
    }

    /// @notice Relay the verdict signer's acknowledgement. Callable by anyone.
    function acknowledge(uint256 reportId, uint256 deadline, bytes calldata sig) external {
        Report storage r = reports[reportId];
        if (r.status != Status.Submitted) revert ReportNotOpen();
        if (block.timestamp > deadline) revert SignatureExpired();

        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(ACKNOWLEDGE_TYPEHASH, reportId, deadline)));
        _checkSigner(pools[r.poolId].verdictSigner, digest, sig);

        r.status = Status.Acknowledged;
        emit ReportAcknowledged(reportId, r.poolId);
    }

    /// @notice Relay the verdict signer's final verdict. Callable by anyone.
    /// @param verdict One of Status.Valid (3), Status.Mistake (4), Status.Slop (5).
    /// @param bounty  Extra payout for a Valid report; must be 0 otherwise.
    function submitVerdict(uint256 reportId, uint8 verdict, uint256 bounty, uint256 deadline, bytes calldata sig)
        external
    {
        Report storage r = reports[reportId];
        if (!_isOpen(r.status)) revert ReportNotOpen();
        if (block.timestamp > deadline) revert SignatureExpired();
        if (verdict < uint8(Status.Valid) || verdict > uint8(Status.Slop)) revert InvalidVerdict();

        Pool storage p = pools[r.poolId];
        bytes32 digest =
            _hashTypedDataV4(keccak256(abi.encode(VERDICT_TYPEHASH, reportId, verdict, bounty, deadline)));
        _checkSigner(p.verdictSigner, digest, sig);

        Status v = Status(verdict);
        if (v != Status.Valid && bounty != 0) revert BountyTooHigh();
        if (bounty > p.maxPayout) revert BountyTooHigh();

        r.status = v;
        p.openReports--;

        if (v == Status.Valid) {
            if (bounty > p.slashedBalance + p.fundedBalance) revert InsufficientPoolFunds();
            // Slashed funds pay bounties first, then creator-funded money.
            uint256 fromSlashed = bounty < p.slashedBalance ? bounty : p.slashedBalance;
            p.slashedBalance -= fromSlashed;
            p.fundedBalance -= bounty - fromSlashed;
            credits[r.reporter] += r.deposit + bounty;
        } else if (v == Status.Mistake) {
            credits[r.reporter] += r.deposit;
        } else {
            p.slashedBalance += r.deposit;
        }

        emit VerdictGiven(reportId, v, bounty);
    }

    /// @notice Return the deposit of an unanswered report once its timeout has passed. Callable by anyone.
    function refundExpired(uint256 reportId) external {
        Report storage r = reports[reportId];
        if (!_isOpen(r.status)) revert ReportNotOpen();
        Pool storage p = pools[r.poolId];
        if (block.timestamp < uint256(r.createdAt) + p.timeout) revert NotExpired();

        r.status = Status.Refunded;
        p.openReports--;
        credits[r.reporter] += r.deposit;

        emit ReportRefunded(reportId, r.poolId, r.reporter, r.deposit);
    }

    // ---------------------------------------------------------- withdrawals

    function withdraw() external nonReentrant {
        uint256 amount = credits[msg.sender];
        if (amount == 0) revert NothingToWithdraw();

        credits[msg.sender] = 0;
        _send(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    function withdrawPoolFunds(uint256 poolId, uint256 amount) external nonReentrant {
        Pool storage p = _pool(poolId);
        if (msg.sender != p.creator) revert NotPoolCreator();
        if (p.openReports != 0) revert ReportsOpen();
        if (amount == 0) revert ZeroValue();
        if (amount > p.fundedBalance) revert InsufficientPoolFunds();

        p.fundedBalance -= amount;
        _send(msg.sender, amount);
        emit PoolFundsWithdrawn(poolId, msg.sender, amount);
    }

    // ---------------------------------------------------------------- views

    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    function deadlineOf(uint256 reportId) external view returns (uint256) {
        Report storage r = reports[reportId];
        return uint256(r.createdAt) + pools[r.poolId].timeout;
    }

    function availableBounty(uint256 poolId) external view returns (uint256) {
        Pool storage p = pools[poolId];
        return p.fundedBalance + p.slashedBalance;
    }

    // ------------------------------------------------------------- internal

    function _pool(uint256 poolId) private view returns (Pool storage p) {
        p = pools[poolId];
        if (p.creator == address(0)) revert PoolNotFound();
    }

    function _isOpen(Status s) private pure returns (bool) {
        return s == Status.Submitted || s == Status.Acknowledged;
    }

    function _checkSigner(address signer, bytes32 digest, bytes calldata sig) private view {
        if (!SignatureChecker.isValidSignatureNow(signer, digest, sig)) revert InvalidSignature();
    }

    function _send(address to, uint256 amount) private {
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }
}
