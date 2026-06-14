// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./MediaCopyrightRegistry.sol";

contract LicensingMarketplace {
    MediaCopyrightRegistry public immutable registry;

    struct LeaseListing {
        uint256 leasePrice;     // in Wei
        uint256 leaseDuration;  // in blocks
        bool active;
    }

    // Mapping from tokenId to its listing details
    mapping(uint256 => LeaseListing) public listings;

    // Mapping from buyer to (tokenId => blockNumberExpiry)
    mapping(address => mapping(uint256 => uint256)) public isLicensedUntil;

    event LeaseListed(
        uint256 indexed tokenId,
        address indexed owner,
        uint256 leasePrice,
        uint256 leaseDuration
    );

    event LeaseCancelled(
        uint256 indexed tokenId,
        address indexed owner
    );

    event LeasePurchased(
        uint256 indexed tokenId,
        address indexed buyer,
        address indexed owner,
        uint256 price,
        uint256 duration,
        uint256 expiresAt
    );

    constructor(address registryAddress) {
        require(registryAddress != address(0), "Invalid registry address");
        registry = MediaCopyrightRegistry(registryAddress);
    }

    /**
     * @dev List a registered Media Token ID for commercial lease.
     */
    function listForLease(
        uint256 tokenId,
        uint256 leasePrice,
        uint256 leaseDuration
    ) public {
        address owner = registry.ownerOf(tokenId);
        require(msg.sender == owner, "Only the copyright owner can list this asset");
        require(leasePrice > 0, "Price must be greater than zero");
        require(leaseDuration > 0, "Duration must be greater than zero");

        listings[tokenId] = LeaseListing({
            leasePrice: leasePrice,
            leaseDuration: leaseDuration,
            active: true
        });

        emit LeaseListed(tokenId, owner, leasePrice, leaseDuration);
    }

    /**
     * @dev Cancel an active lease listing.
     */
    function cancelListing(uint256 tokenId) public {
        address owner = registry.ownerOf(tokenId);
        require(msg.sender == owner, "Only the copyright owner can cancel this listing");
        require(listings[tokenId].active, "Listing is not active");

        listings[tokenId].active = false;

        emit LeaseCancelled(tokenId, owner);
    }

    /**
     * @dev Purchase a commercial lease for a registered Media Token ID.
     */
    function purchaseLease(uint256 tokenId) public payable {
        LeaseListing memory listing = listings[tokenId];
        require(listing.active, "Asset is not listed for lease");
        require(msg.value >= listing.leasePrice, "Insufficient payment amount");

        address owner = registry.ownerOf(tokenId);
        require(owner != address(0), "Token owner not found");
        require(owner != msg.sender, "Owner cannot lease their own token");

        // Set licensing expiration block
        uint256 expiresAt = block.number + listing.leaseDuration;
        isLicensedUntil[msg.sender][tokenId] = expiresAt;

        // Refund excess payment if any
        uint256 excess = msg.value - listing.leasePrice;
        if (excess > 0) {
            (bool refunded, ) = payable(msg.sender).call{value: excess}("");
            require(refunded, "Failed to refund excess Ether");
        }

        // Transfer payment to owner
        (bool paid, ) = payable(owner).call{value: listing.leasePrice}("");
        require(paid, "Failed to transfer funds to copyright owner");

        emit LeasePurchased(tokenId, msg.sender, owner, listing.leasePrice, listing.leaseDuration, expiresAt);
    }

    /**
     * @dev Helper to check if a specific address has an active license for a tokenId.
     */
    function hasActiveLicense(address licensee, uint256 tokenId) public view returns (bool) {
        return isLicensedUntil[licensee][tokenId] > block.number;
    }
}
