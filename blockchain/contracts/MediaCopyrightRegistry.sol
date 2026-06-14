// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";

contract MediaCopyrightRegistry is ERC721URIStorage {
    uint256 private _nextTokenId;

    // Mapping from perceptual hash string to token ID
    mapping(string => uint256) private _perceptualHashToTokenId;
    
    // Mapping from token ID to its perceptual hash string
    mapping(uint256 => string) private _tokenIdToPerceptualHash;

    // Array of all registered token IDs to allow easy iteration for close match checking
    uint256[] private _allTokens;

    event CopyrightMinted(
        uint256 indexed tokenId,
        address indexed creator,
        string perceptualHash,
        string ipfsMetadataURI
    );

    constructor() ERC721("MediaCopyrightNFT", "MCR") {
        _nextTokenId = 1;
    }

    /**
     * @dev Internal function to check if a perceptual hash has already been registered.
     * Reverts if it exists.
     */
    function checkPriorRegistration(string memory perceptualHash) internal view {
        require(
            _perceptualHashToTokenId[perceptualHash] == 0,
            "Perceptual hash already registered"
        );
    }

    /**
     * @dev Mint a new copyright NFT.
     */
    function mintCopyright(
        address creator,
        string memory perceptualHash,
        string memory ipfsMetadataURI
    ) public returns (uint256) {
        // Ensure the perceptual hash is not empty
        require(bytes(perceptualHash).length > 0, "Empty perceptual hash");
        
        // Check for prior registration
        checkPriorRegistration(perceptualHash);

        uint256 tokenId = _nextTokenId;
        _nextTokenId++;

        // Mint ERC721 token
        _safeMint(creator, tokenId);
        
        // Set token URI (IPFS metadata)
        _setTokenURI(tokenId, ipfsMetadataURI);

        // Record mappings
        _perceptualHashToTokenId[perceptualHash] = tokenId;
        _tokenIdToPerceptualHash[tokenId] = perceptualHash;
        _allTokens.push(tokenId);

        emit CopyrightMinted(tokenId, creator, perceptualHash, ipfsMetadataURI);

        return tokenId;
    }

    /**
     * @dev Get the token ID registered under a specific perceptual hash.
     * Returns 0 if not registered.
     */
    function getTokenByPerceptualHash(string memory perceptualHash) public view returns (uint256) {
        return _perceptualHashToTokenId[perceptualHash];
    }

    /**
     * @dev Get the perceptual hash of a token.
     */
    function getPerceptualHash(uint256 tokenId) public view returns (string memory) {
        _requireOwned(tokenId);
        return _tokenIdToPerceptualHash[tokenId];
    }

    /**
     * @dev Computes the Hamming distance between two hex string perceptual hashes.
     * Standard pHashes are 16 character hex strings representing 64-bit values.
     */
    function hammingDistance(string memory hashA, string memory hashB) public pure returns (uint256) {
        bytes memory a = bytes(hashA);
        bytes memory b = bytes(hashB);
        
        require(a.length == b.length, "Hashes must have the same length");

        uint256 distance = 0;
        for (uint256 i = 0; i < a.length; i++) {
            uint8 valA = _hexCharToVal(a[i]);
            uint8 valB = _hexCharToVal(b[i]);
            
            // Count differing bits in the 4-bit nibble
            uint8 diff = valA ^ valB;
            while (diff > 0) {
                distance += diff & 1;
                diff >>= 1;
            }
        }
        return distance;
    }

    /**
     * @dev Helper to convert hex character to its integer value (0-15).
     */
    function _hexCharToVal(bytes1 c) internal pure returns (uint8) {
        uint8 val = uint8(c);
        if (val >= 48 && val <= 57) {
            return val - 48; // '0'..'9'
        } else if (val >= 97 && val <= 102) {
            return val - 87; // 'a'..'f'
        } else if (val >= 65 && val <= 70) {
            return val - 55; // 'A'..'F'
        }
        revert("Invalid hex character");
    }

    /**
     * @dev Searches for a matching token ID within the given Hamming distance threshold.
     * Returns the closest matching token ID, owner, and distance.
     * If no match within threshold is found, returns (0, address(0), 999).
     */
    function findMatch(string memory queryHash, uint256 threshold)
        public
        view
        returns (
            uint256 matchingTokenId,
            address owner,
            uint256 minDistance,
            string memory metadataURI
        )
    {
        uint256 closestToken = 0;
        uint256 minDistanceFound = 999;
        
        for (uint256 i = 0; i < _allTokens.length; i++) {
            uint256 id = _allTokens[i];
            string memory tokenHash = _tokenIdToPerceptualHash[id];
            
            if (bytes(tokenHash).length == bytes(queryHash).length) {
                uint256 dist = hammingDistance(queryHash, tokenHash);
                if (dist < minDistanceFound) {
                    minDistanceFound = dist;
                    closestToken = id;
                }
            }
        }
        
        if (minDistanceFound <= threshold && closestToken != 0) {
            return (
                closestToken,
                ownerOf(closestToken),
                minDistanceFound,
                tokenURI(closestToken)
            );
        } else {
            return (0, address(0), minDistanceFound, "");
        }
    }
    
    /**
     * @dev Returns all registered tokens.
     */
    function getAllTokens() public view returns (uint256[] memory) {
        return _allTokens;
    }
}
