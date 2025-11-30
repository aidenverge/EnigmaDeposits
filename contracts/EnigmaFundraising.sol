// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import {FHE, euint64, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {ConfidentialUSDT} from "./ConfidentialUSDT.sol";

/// @title EnigmaFundraising
/// @notice Confidential crowdfunding contract that accepts cUSDT contributions
///         while keeping individual amounts encrypted on-chain.
contract EnigmaFundraising is ZamaEthereumConfig {
    ConfidentialUSDT public immutable cusdt;
    address public immutable fundraiserOwner;

    string public fundraiserName;
    uint64 public targetAmount;
    uint64 public endTimestamp;
    bool public isConfigured;
    bool public isEnded;

    euint64 private _totalRaised;
    mapping(address contributor => euint64) private _contributions;

    event FundraiserConfigured(string name, uint64 targetAmount, uint64 endTimestamp);
    event ContributionReceived(address indexed contributor, euint64 encryptedAmount);
    event FundraiserEnded(address indexed beneficiary, euint64 totalRaised);

    error FundraiserAlreadyEnded();
    error FundraiserNotConfigured();
    error InvalidConfiguration();
    error NotAuthorized();

    modifier onlyFundraiserOwner() {
        if (msg.sender != fundraiserOwner) {
            revert NotAuthorized();
        }
        _;
    }

    modifier onlyActive() {
        if (!isConfigured) {
            revert FundraiserNotConfigured();
        }
        if (isEnded || block.timestamp > endTimestamp) {
            revert FundraiserAlreadyEnded();
        }
        _;
    }

    constructor(address cusdtAddress) {
        cusdt = ConfidentialUSDT(cusdtAddress);
        fundraiserOwner = msg.sender;
        _totalRaised = FHE.asEuint64(0);
        FHE.allowThis(_totalRaised);
        FHE.allow(_totalRaised, fundraiserOwner);
    }

    /// @notice Configure the fundraiser details.
    /// @param name Human-readable name of the fundraiser.
    /// @param target Target amount to raise (plain amount).
    /// @param endTime Timestamp when contributions close.
    function configureFundraiser(string calldata name, uint64 target, uint64 endTime) external onlyFundraiserOwner {
        if (bytes(name).length == 0 || endTime <= block.timestamp) {
            revert InvalidConfiguration();
        }
        if (isEnded) {
            revert FundraiserAlreadyEnded();
        }

        fundraiserName = name;
        targetAmount = target;
        endTimestamp = endTime;
        isConfigured = true;

        emit FundraiserConfigured(name, target, endTime);
    }

    /// @notice Contribute encrypted cUSDT to the fundraiser.
    /// @param encryptedAmount Encrypted contribution amount.
    /// @param inputProof Zama input proof associated with the encrypted amount.
    /// @return transferred The encrypted amount transferred from the contributor.
    function contribute(
        externalEuint64 encryptedAmount,
        bytes calldata inputProof
    ) external onlyActive returns (euint64 transferred) {
        transferred = cusdt.confidentialTransferFrom(msg.sender, address(this), encryptedAmount, inputProof);

        euint64 currentContribution = _contributions[msg.sender];
        euint64 updatedContribution = FHE.add(currentContribution, transferred);
        FHE.allowThis(updatedContribution);
        FHE.allow(updatedContribution, msg.sender);
        FHE.allow(updatedContribution, fundraiserOwner);
        _contributions[msg.sender] = updatedContribution;

        euint64 updatedTotal = FHE.add(_totalRaised, transferred);
        FHE.allowThis(updatedTotal);
        FHE.allow(updatedTotal, fundraiserOwner);
        _totalRaised = updatedTotal;

        emit ContributionReceived(msg.sender, transferred);
    }

    /// @notice End the fundraiser and forward raised cUSDT to the fundraiser owner.
    function endFundraiser() external onlyFundraiserOwner {
        if (isEnded) {
            revert FundraiserAlreadyEnded();
        }

        isEnded = true;

        euint64 contractBalance = cusdt.confidentialBalanceOf(address(this));
        if (!FHE.isInitialized(contractBalance)) {
            emit FundraiserEnded(fundraiserOwner, _totalRaised);
            return;
        }
        FHE.allowThis(contractBalance);
        FHE.allow(contractBalance, fundraiserOwner);

        cusdt.confidentialTransfer(fundraiserOwner, contractBalance);

        emit FundraiserEnded(fundraiserOwner, _totalRaised);
    }

    /// @notice Returns current fundraiser metadata.
    function getFundraiserDetails()
        external
        view
        returns (string memory name, uint64 target, uint64 endTime, bool ended, address owner)
    {
        return (fundraiserName, targetAmount, endTimestamp, isEnded, fundraiserOwner);
    }

    /// @notice Indicates whether contributions are currently accepted.
    function isActive() external view returns (bool) {
        return isConfigured && !isEnded && block.timestamp <= endTimestamp;
    }

    /// @notice Returns the encrypted amount contributed by a specific address.
    /// @param contributor Address of the contributor.
    function contributionOf(address contributor) external view returns (euint64) {
        return _contributions[contributor];
    }

    /// @notice Returns the encrypted total raised amount.
    function confidentialTotalRaised() external view returns (euint64) {
        return _totalRaised;
    }
}
