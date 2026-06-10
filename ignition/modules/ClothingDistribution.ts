import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const ClothingDistributionModule = buildModule(
  "ClothingDistributionModule",
  (m) => {

    // Get deployer account
    const admin = m.getAccount(0);

    // Deploy contract with constructor parameter
    const clothingDistribution = m.contract(
      "ClothingDistribution",
      [admin]
    );

    return { clothingDistribution };
  }
);

export default ClothingDistributionModule;