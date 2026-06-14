import hre from "hardhat";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  console.log("Starting deployment of Decentralized Media Copyright Engine...");

  // 1. Deploy MediaCopyrightRegistry
  const MediaCopyrightRegistry = await hre.ethers.getContractFactory("MediaCopyrightRegistry");
  const registry = await MediaCopyrightRegistry.deploy();
  await registry.waitForDeployment();
  const registryAddress = await registry.getAddress();
  console.log(`MediaCopyrightRegistry deployed to: ${registryAddress}`);

  // 2. Deploy LicensingMarketplace
  const LicensingMarketplace = await hre.ethers.getContractFactory("LicensingMarketplace");
  const marketplace = await LicensingMarketplace.deploy(registryAddress);
  await marketplace.waitForDeployment();
  const marketplaceAddress = await marketplace.getAddress();
  console.log(`LicensingMarketplace deployed to: ${marketplaceAddress}`);

  // Save deployed addresses to JSON file
  const addresses = {
    registry: registryAddress,
    marketplace: marketplaceAddress,
  };
  
  const addressesPath = path.join(path.dirname(__dirname), "deployed_addresses.json");
  fs.writeFileSync(addressesPath, JSON.stringify(addresses, null, 2), "utf-8");
  console.log(`Addresses saved to: ${addressesPath}`);

  console.log("\nDeployment completed successfully!");
  console.log("Addresses:");
  console.log(`MediaCopyrightRegistry: ${registryAddress}`);
  console.log(`LicensingMarketplace: ${marketplaceAddress}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
