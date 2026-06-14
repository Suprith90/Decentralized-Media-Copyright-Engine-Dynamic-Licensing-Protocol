import { expect } from "chai";
import hre from "hardhat";

describe("Decentralized Media Copyright Engine", function () {
  let registry;
  let marketplace;
  let owner;
  let creator;
  let buyer;

  beforeEach(async function () {
    [owner, creator, buyer] = await hre.ethers.getSigners();

    // Deploy Registry
    const MediaCopyrightRegistry = await hre.ethers.getContractFactory("MediaCopyrightRegistry");
    registry = await MediaCopyrightRegistry.deploy();
    await registry.waitForDeployment();

    // Deploy Marketplace
    const LicensingMarketplace = await hre.ethers.getContractFactory("LicensingMarketplace");
    marketplace = await LicensingMarketplace.deploy(await registry.getAddress());
    await marketplace.waitForDeployment();
  });

  describe("MediaCopyrightRegistry", function () {
    it("Should allow a creator to mint a unique copyright NFT", async function () {
      const pHash = "8f1c3d9a5b6e2f10";
      const metadataURI = "ipfs://QmSomeMetadataHash";

      await expect(registry.connect(creator).mintCopyright(creator.address, pHash, metadataURI))
        .to.emit(registry, "CopyrightMinted")
        .withArgs(1, creator.address, pHash, metadataURI);

      expect(await registry.ownerOf(1)).to.equal(creator.address);
      expect(await registry.getPerceptualHash(1)).to.equal(pHash);
      expect(await registry.tokenURI(1)).to.equal(metadataURI);
    });

    it("Should reject minting if the exact same pHash has already been registered", async function () {
      const pHash = "8f1c3d9a5b6e2f10";
      const metadataURI = "ipfs://QmSomeMetadataHash1";
      const metadataURI2 = "ipfs://QmSomeMetadataHash2";

      await registry.connect(creator).mintCopyright(creator.address, pHash, metadataURI);

      await expect(
        registry.connect(buyer).mintCopyright(buyer.address, pHash, metadataURI2)
      ).to.be.revertedWith("Perceptual hash already registered");
    });

    it("Should correctly compute Hamming distance between two hex hashes", async function () {
      const hashA = "8f1c3d9a5b6e2f10";
      // '0' vs '1' -> '0000' vs '0001' -> diff = 1 bit
      const hashB = "8f1c3d9a5b6e2f11"; 
      expect(await registry.hammingDistance(hashA, hashB)).to.equal(1);

      // '0' vs 'f' -> '0000' vs '1111' -> diff = 4 bits
      const hashC = "8f1c3d9a5b6e2f1f";
      expect(await registry.hammingDistance(hashA, hashC)).to.equal(4);
    });

    it("Should find exact matches on-chain using findMatch", async function () {
      const pHash = "8f1c3d9a5b6e2f10";
      const metadataURI = "ipfs://QmSomeMetadataHash";
      await registry.connect(creator).mintCopyright(creator.address, pHash, metadataURI);

      const [tokenId, matchedOwner, distance, uri] = await registry.findMatch(pHash, 0);
      expect(tokenId).to.equal(1);
      expect(matchedOwner).to.equal(creator.address);
      expect(distance).to.equal(0);
      expect(uri).to.equal(metadataURI);
    });

    it("Should find close matches within Hamming distance threshold", async function () {
      const pHash = "8f1c3d9a5b6e2f10";
      const queryHash = "8f1c3d9a5b6e2f1f"; // distance = 4
      const metadataURI = "ipfs://QmSomeMetadataHash";
      await registry.connect(creator).mintCopyright(creator.address, pHash, metadataURI);

      // Query with threshold 5 (should match)
      const [tokenId, matchedOwner, distance, uri] = await registry.findMatch(queryHash, 5);
      expect(tokenId).to.equal(1);
      expect(matchedOwner).to.equal(creator.address);
      expect(distance).to.equal(4);

      // Query with threshold 3 (should NOT match)
      const [noTokenId, noOwner, noDistance] = await registry.findMatch(queryHash, 3);
      expect(noTokenId).to.equal(0);
      expect(noOwner).to.equal(hre.ethers.ZeroAddress);
    });
  });

  describe("LicensingMarketplace", function () {
    const tokenId = 1;
    const pHash = "8f1c3d9a5b6e2f10";
    const metadataURI = "ipfs://QmSomeMetadataHash";

    beforeEach(async function () {
      await registry.connect(creator).mintCopyright(creator.address, pHash, metadataURI);
    });

    it("Should allow the copyright owner to list their token for lease", async function () {
      const price = hre.ethers.parseEther("0.1"); // in Wei
      const duration = 100; // in blocks

      await expect(marketplace.connect(creator).listForLease(tokenId, price, duration))
        .to.emit(marketplace, "LeaseListed")
        .withArgs(tokenId, creator.address, price, duration);

      const listing = await marketplace.listings(tokenId);
      expect(listing.leasePrice).to.equal(price);
      expect(listing.leaseDuration).to.equal(duration);
      expect(listing.active).to.be.true;
    });

    it("Should prevent non-owners from listing tokens", async function () {
      const price = hre.ethers.parseEther("0.1");
      const duration = 100;

      await expect(
        marketplace.connect(buyer).listForLease(tokenId, price, duration)
      ).to.be.revertedWith("Only the copyright owner can list this asset");
    });

    it("Should allow a buyer to lease a listed token and transfer funds to the owner", async function () {
      const price = hre.ethers.parseEther("0.1");
      const duration = 100;
      await marketplace.connect(creator).listForLease(tokenId, price, duration);

      const creatorBalanceBefore = await hre.ethers.provider.getBalance(creator.address);

      const tx = await marketplace.connect(buyer).purchaseLease(tokenId, { value: price });
      const receipt = await tx.wait();
      const currentBlock = receipt.blockNumber;

      expect(await marketplace.isLicensedUntil(buyer.address, tokenId)).to.equal(currentBlock + duration);
      expect(await marketplace.hasActiveLicense(buyer.address, tokenId)).to.be.true;

      const creatorBalanceAfter = await hre.ethers.provider.getBalance(creator.address);
      expect(creatorBalanceAfter - creatorBalanceBefore).to.equal(price);
    });

    it("Should fail if the lease listing is not active or payment is insufficient", async function () {
      const price = hre.ethers.parseEther("0.1");
      const duration = 100;

      await expect(
        marketplace.connect(buyer).purchaseLease(tokenId, { value: price })
      ).to.be.revertedWith("Asset is not listed for lease");

      await marketplace.connect(creator).listForLease(tokenId, price, duration);

      await expect(
        marketplace.connect(buyer).purchaseLease(tokenId, { value: hre.ethers.parseEther("0.05") })
      ).to.be.revertedWith("Insufficient payment amount");
    });
  });
});
