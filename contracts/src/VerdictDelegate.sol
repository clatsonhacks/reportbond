// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {IERC1271} from "@openzeppelin/contracts/interfaces/IERC1271.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/// @title VerdictDelegate
/// @notice A verdict signer for ReportBond pools that lets an automatic reviewer reject slop, and
///         nothing else. ReportBond accepts contract signers (ERC-1271), so a pool created with this
///         contract as its verdict signer needs no change to ReportBond itself.
///
///         Two keys can produce a valid signature:
///         - `owner` (the maintainer) can sign anything the pool's verdict signer may sign;
///         - `autoSigner` (the review service) can sign only a Slop verdict with no bounty.
///
///         A Slop verdict moves the reporter's deposit into the pool. So the worst a compromised
///         `autoSigner` can do is slash deposits on pools that opted in; it can never pay a bounty or
///         move pool funds out.
contract VerdictDelegate is IERC1271 {
    bytes4 private constant MAGIC = IERC1271.isValidSignature.selector;
    bytes4 private constant INVALID = 0xffffffff;

    // Must match ReportBond.
    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant VERDICT_TYPEHASH =
        keccak256("Verdict(uint256 reportId,uint8 verdict,uint256 bounty,uint256 deadline)");
    uint8 private constant SLOP = 5;

    address public immutable owner;
    address public immutable autoSigner;
    /// @notice The ReportBond contract whose verdicts this signs.
    address public immutable bond;

    constructor(address owner_, address autoSigner_, address bond_) {
        owner = owner_;
        autoSigner = autoSigner_;
        bond = bond_;
    }

    /// @param sig Either the owner's 65-byte signature over `hash`, or
    ///            `abi.encode(reportId, deadline, autoSignerSignature)` for an automatic Slop verdict.
    function isValidSignature(bytes32 hash, bytes calldata sig) external view returns (bytes4) {
        if (sig.length == 65) {
            (address signer, ECDSA.RecoverError err,) = ECDSA.tryRecover(hash, sig);
            return err == ECDSA.RecoverError.NoError && signer == owner ? MAGIC : INVALID;
        }
        // abi.encode(uint256, uint256, bytes) with a 65-byte signature is exactly 224 bytes.
        if (sig.length != 224) return INVALID;
        (uint256 reportId, uint256 deadline, bytes memory autoSig) = abi.decode(sig, (uint256, uint256, bytes));
        // The automatic reviewer's signature only counts if `hash` is a Slop verdict with no bounty.
        if (hash != slopDigest(reportId, deadline)) return INVALID;
        (address auto_, ECDSA.RecoverError autoErr,) = ECDSA.tryRecover(hash, autoSig);
        return autoErr == ECDSA.RecoverError.NoError && auto_ == autoSigner ? MAGIC : INVALID;
    }

    /// @notice The digest ReportBond checks for a Slop verdict on `reportId`.
    function slopDigest(uint256 reportId, uint256 deadline) public view returns (bytes32) {
        bytes32 domain = keccak256(
            abi.encode(DOMAIN_TYPEHASH, keccak256("ReportBond"), keccak256("1"), block.chainid, bond)
        );
        return MessageHashUtils.toTypedDataHash(
            domain, keccak256(abi.encode(VERDICT_TYPEHASH, reportId, SLOP, uint256(0), deadline))
        );
    }
}

/// @title VerdictDelegateFactory
/// @notice One delegate per maintainer, at a predictable address, reusable for all their pools.
contract VerdictDelegateFactory {
    address public immutable autoSigner;
    address public immutable bond;

    mapping(address owner => address delegate) public delegateOf;

    event DelegateCreated(address indexed owner, address delegate);

    constructor(address autoSigner_, address bond_) {
        autoSigner = autoSigner_;
        bond = bond_;
    }

    /// @notice Create `owner`'s delegate, or return the one they already have. Callable by anyone:
    ///         the delegate only ever obeys `owner` and the fixed `autoSigner`.
    function create(address owner) external returns (address delegate) {
        delegate = delegateOf[owner];
        if (delegate != address(0)) return delegate;
        delegate = address(new VerdictDelegate{salt: bytes32(uint256(uint160(owner)))}(owner, autoSigner, bond));
        delegateOf[owner] = delegate;
        emit DelegateCreated(owner, delegate);
    }
}
