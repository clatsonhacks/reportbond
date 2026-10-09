// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title ReportBond with Protocol Fees
/// @notice Refundable native-USDC deposits for private security reports with sustainable protocol fees.
/// @dev Protocol fees fund relayer gas costs, infrastructure, and development.
///      Fees are stored in the contract and withdrawn by the protocol owner.
contract ReportBondWithFees is EIP712, ReentrancyGuard {
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
        bytes32 repoId;
        address creator;
        address verdictSigner;
        uint256 depositAmount;
        uint64 timeout;
        uint256 maxPayout;
        uint256 fundedBalance;
        uint256 slashedBalance;
        uint32 openReports;
    }

    struct Report {
        uint256 poolId;
        address reporter;
        uint256 deposit;
        uint64 createdAt;
        Status status;
        bytes32 advisoryHash;
    }

    // ==================== PROTOCOL FEES ====================

    /// @notice Protocol owner who can withdraw accumulated fees
    address public immutable protocolOwner;

    /// @notice Protocol fees accumulated from all operations
    uint256 public protocolFees;

    /// @notice Fee on each report submission (basis points, e.g., 100 = 1%)
    uint256 public constant REPORT_FEE_BPS = 100; // 1% of deposit

    /// @notice Fee on pool creation (flat amount in native USDC)
    uint256 public constant POOL_CREATION_FEE = 1e18; // 1 USDC

    /// @notice Fee on bounty payouts for Valid reports (basis points)
    uint256 public constant BOUNTY_FEE_BPS = 200; // 2% of bounty

    uint256 private constant BASIS_POINTS = 10_000;

    // ========================================================

    bytes32 public constant ACKNOWLEDGE_TYPEHASH = keccak256("Acknowledge(uint256 reportId,uint256 deadline)");
    bytes32 public constant VERDICT_TYPEHASH =
        keccak256("Verdict(uint256 reportId,uint8 verdict,uint256 bounty,uint256 deadline)");

    mapping(uint256 => Pool) public pools;
    mapping(uint256 => Report) public reports;
    mapping(address => uint256) public credits;

    uint256 public poolCount;
    uint256 public reportCount;

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
    event ProtocolFeeCollected(string source, uint256 amount);
    event ProtocolFeesWithdrawn(address indexed to, uint256 amount);

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
    error OnlyProtocolOwner();

    constructor(address _protocolOwner) EIP712("ReportBond", "1") {
        if (_protocolOwner == address(0)) revert ZeroValue();
        protocolOwner = _protocolOwner;
    }

    // ---------------------------------------------------------------- pools

    /// @notice Create a new bug bounty pool
    /// @dev Charges POOL_CREATION_FEE as protocol fee
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
        if (msg.value < POOL_CREATION_FEE) revert ZeroValue();

        // Collect pool creation fee
        protocolFees += POOL_CREATION_FEE;
        emit ProtocolFeeCollected("pool_creation", POOL_CREATION_FEE);

        poolId = ++poolCount;
        Pool storage p = pools[poolId];
        p.repoId = repoId;
        p.creator = msg.sender;
        p.verdictSigner = verdictSigner;
        p.depositAmount = depositAmount;
        p.timeout = timeout;
        p.maxPayout = maxPayout;

        // Remaining value after fee goes to funded balance
        uint256 initialFunding = msg.value - POOL_CREATION_FEE;
        p.fundedBalance = initialFunding;

        emit PoolCreated(poolId, repoId, msg.sender, verdictSigner, depositAmount, timeout, maxPayout, initialFunding);
    }

    function fundPool(uint256 poolId) external payable {
        Pool storage p = _pool(poolId);
        if (msg.sender != p.creator) revert NotPoolCreator();
        if (msg.value == 0) revert ZeroValue();

        p.fundedBalance += msg.value;
        emit PoolFunded(poolId, msg.sender, msg.value);
    }

    // -------------------------------------------------------------- reports

    /// @notice Submit a security report with deposit
    /// @dev Charges REPORT_FEE_BPS% fee on the deposit amount
    function submitReport(uint256 poolId, bytes32 advisoryHash) external payable returns (uint256 reportId) {
        Pool storage p = _pool(poolId);
        if (advisoryHash == bytes32(0)) revert ZeroValue();

        // Calculate total amount needed: deposit + fee
        uint256 fee = (p.depositAmount * REPORT_FEE_BPS) / BASIS_POINTS;
        uint256 totalRequired = p.depositAmount + fee;

        if (msg.value != totalRequired) revert WrongDeposit();

        // Collect report submission fee
        protocolFees += fee;
        emit ProtocolFeeCollected("report_submission", fee);

        reportId = ++reportCount;
        reports[reportId] = Report({
            poolId: poolId,
            reporter: msg.sender,
            deposit: p.depositAmount, // Store actual deposit (without fee)
            createdAt: uint64(block.timestamp),
            status: Status.Submitted,
            advisoryHash: advisoryHash
        });
        p.openReports++;

        emit ReportSubmitted(reportId, poolId, msg.sender, p.depositAmount, advisoryHash, uint64(block.timestamp) + p.timeout);
    }

    function acknowledge(uint256 reportId, uint256 deadline, bytes calldata sig) external {
        Report storage r = reports[reportId];
        if (r.status != Status.Submitted) revert ReportNotOpen();
        if (block.timestamp > deadline) revert SignatureExpired();

        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(ACKNOWLEDGE_TYPEHASH, reportId, deadline)));
        _checkSigner(pools[r.poolId].verdictSigner, digest, sig);

        r.status = Status.Acknowledged;
        emit ReportAcknowledged(reportId, r.poolId);
    }

    /// @notice Submit verdict with optional bounty
    /// @dev Charges BOUNTY_FEE_BPS% fee on Valid verdicts with bounties
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
            // Calculate bounty fee
            uint256 bountyFee = (bounty * BOUNTY_FEE_BPS) / BASIS_POINTS;
            uint256 totalNeeded = bounty + bountyFee;

            if (totalNeeded > p.slashedBalance + p.fundedBalance) revert InsufficientPoolFunds();

            // Collect bounty fee
            protocolFees += bountyFee;
            emit ProtocolFeeCollected("bounty_payout", bountyFee);

            // Pay from slashed funds first, then funded balance
            uint256 fromSlashed = totalNeeded < p.slashedBalance ? totalNeeded : p.slashedBalance;
            p.slashedBalance -= fromSlashed;
            p.fundedBalance -= totalNeeded - fromSlashed;

            // Credit reporter: deposit + bounty (fee already deducted from pool)
            credits[r.reporter] += r.deposit + bounty;

        } else if (v == Status.Mistake) {
            credits[r.reporter] += r.deposit;
        } else {
            // Slop: deposit goes to slashed balance
            p.slashedBalance += r.deposit;
        }

        emit VerdictGiven(reportId, v, bounty);
    }

    function refundExpired(uint256 reportId) external {
        Report storage r = reports[reportId];
        if (!_isOpen(r.status)) revert ReportNotOpen();
        if (block.timestamp < r.createdAt + pools[r.poolId].timeout) revert NotExpired();

        r.status = Status.Refunded;
        pools[r.poolId].openReports--;
        credits[r.reporter] += r.deposit;

        emit ReportRefunded(reportId, r.poolId, r.reporter, r.deposit);
    }

    // ------------------------------------------------------------- balances

    function withdraw() external nonReentrant {
        uint256 amount = credits[msg.sender];
        if (amount == 0) revert NothingToWithdraw();

        credits[msg.sender] = 0;
        (bool ok,) = msg.sender.call{value: amount}("");
        if (!ok) revert TransferFailed();

        emit Withdrawn(msg.sender, amount);
    }

    function withdrawPoolFunds(uint256 poolId, uint256 amount) external nonReentrant {
        Pool storage p = _pool(poolId);
        if (msg.sender != p.creator) revert NotPoolCreator();
        if (p.openReports > 0) revert ReportsOpen();
        if (amount == 0 || amount > p.fundedBalance) revert NothingToWithdraw();

        p.fundedBalance -= amount;
        (bool ok,) = msg.sender.call{value: amount}("");
        if (!ok) revert TransferFailed();

        emit PoolFundsWithdrawn(poolId, msg.sender, amount);
    }

    // ==================== PROTOCOL FEE MANAGEMENT ====================

    /// @notice Withdraw accumulated protocol fees
    /// @dev Only callable by protocol owner
    function withdrawProtocolFees() external nonReentrant {
        if (msg.sender != protocolOwner) revert OnlyProtocolOwner();

        uint256 amount = protocolFees;
        if (amount == 0) revert NothingToWithdraw();

        protocolFees = 0;
        (bool ok,) = msg.sender.call{value: amount}("");
        if (!ok) revert TransferFailed();

        emit ProtocolFeesWithdrawn(msg.sender, amount);
    }

    /// @notice View function to get fee breakdown for a report
    function calculateReportCost(uint256 poolId) external view returns (uint256 deposit, uint256 fee, uint256 total) {
        Pool storage p = pools[poolId];
        deposit = p.depositAmount;
        fee = (deposit * REPORT_FEE_BPS) / BASIS_POINTS;
        total = deposit + fee;
    }

    /// @notice View function to get fee breakdown for a bounty
    function calculateBountyFee(uint256 bounty) external pure returns (uint256 fee, uint256 reporterGets) {
        fee = (bounty * BOUNTY_FEE_BPS) / BASIS_POINTS;
        reporterGets = bounty;
    }

    // =================================================================

    function _pool(uint256 poolId) private view returns (Pool storage) {
        if (poolId == 0 || poolId > poolCount) revert PoolNotFound();
        return pools[poolId];
    }

    function _isOpen(Status s) private pure returns (bool) {
        return s == Status.Submitted || s == Status.Acknowledged;
    }

    function _checkSigner(address signer, bytes32 digest, bytes calldata sig) private view {
        if (!SignatureChecker.isValidSignatureNow(signer, digest, sig)) {
            revert InvalidSignature();
        }
    }
}
