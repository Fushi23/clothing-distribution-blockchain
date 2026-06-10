import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.create();

describe("Blockchain Clothing Distribution System (BCDS)", function () {

  let bcdsContract: any;

  let admin: any;
  let supplier: any;
  let ngo: any;
  let matcher: any;

  beforeEach(async function () {

    // =========================================================
    // GET TEST SIGNERS
    // =========================================================

    [admin, supplier, ngo, matcher] =
      await ethers.getSigners();

    // =========================================================
    // DEPLOY CONTRACT
    // =========================================================

    const ClothingDistribution =
      await ethers.getContractFactory(
        "ClothingDistribution"
      );

    bcdsContract =
      await ClothingDistribution.deploy(admin.address);

    await bcdsContract.waitForDeployment();

    // =========================================================
    // ASSIGN ROLES
    // =========================================================

    await bcdsContract
      .connect(admin)
      .addSupplier(supplier.address);

    await bcdsContract
      .connect(admin)
      .addNGO(ngo.address);

    await bcdsContract
      .connect(admin)
      .addMatcher(matcher.address);
  });

  // =========================================================
  // TOKENIZATION TEST
  // =========================================================

  it("Should allow supplier to tokenize clothing", async function () {

    await expect(
      bcdsContract.connect(supplier)
        .tokenizeClothing(
          "Jacket, Size M, Waterproof",
          0,
          "KL_Hub_Centric_Coordinates"
        )
    ).to.emit(
      bcdsContract,
      "ClothingTokenized"
    );

    const item =
      await bcdsContract.getClothingItem(1);

    expect(item.supplier)
      .to.equal(supplier.address);

    expect(item.garmentProfile)
      .to.equal("Jacket, Size M, Waterproof");

    expect(item.isAllocated)
      .to.equal(false);
  });

  // =========================================================
  // RELIEF REQUEST TEST
  // =========================================================

  it("Should allow NGO to create relief request", async function () {

    await expect(
      bcdsContract.connect(ngo)
        .createReliefRequest(
          "Jacket, Size M, Waterproof",
          1,
          "Flood Sector B, Terengganu"
        )
    ).to.emit(
      bcdsContract,
      "ReliefRequestCreated"
    );

    const request =
      await bcdsContract.getReliefRequest(1);

    expect(request.ngo)
      .to.equal(ngo.address);

    expect(request.status)
      .to.equal(0); // Pending
  });

  // =========================================================
  // MATCHING ENGINE TEST
  // =========================================================

  it("Should match supply to request", async function () {

    // Create inventory
    await bcdsContract.connect(supplier)
      .tokenizeClothing(
        "Jacket, Size M, Waterproof",
        0,
        "KL_Hub"
      );

    // Create request
    await bcdsContract.connect(ngo)
      .createReliefRequest(
        "Jacket, Size M, Waterproof",
        1,
        "Flood Zone"
      );

    // Match request
    await expect(
      bcdsContract.connect(matcher)
        .matchSupplyToRequest(1, 1)
    ).to.emit(
      bcdsContract,
      "SupplyMatched"
    );

    const item =
      await bcdsContract.getClothingItem(1);

    const request =
      await bcdsContract.getReliefRequest(1);

    expect(item.isAllocated)
      .to.equal(true);

    expect(request.status)
      .to.equal(1); // Matched
  });

  // =========================================================
  // DELIVERY VERIFICATION TEST
  // =========================================================

  it("Should verify proof of delivery", async function () {

    // Setup workflow

    await bcdsContract.connect(supplier)
      .tokenizeClothing(
        "Emergency Jacket",
        0,
        "Warehouse A"
      );

    await bcdsContract.connect(ngo)
      .createReliefRequest(
        "Emergency Jacket",
        1,
        "Flood Relief Zone"
      );

    await bcdsContract.connect(matcher)
      .matchSupplyToRequest(1, 1);

    // Verify delivery

    await expect(
      bcdsContract.connect(ngo)
        .verifyDelivery(1)
    ).to.emit(
      bcdsContract,
      "DeliveryVerified"
    );

    const request =
      await bcdsContract.getReliefRequest(1);

    expect(request.status)
      .to.equal(2); // Delivered
  });

  // =========================================================
  // ACCESS CONTROL TEST
  // =========================================================

  it("Should reject unauthorized delivery verification", async function () {

    // Setup workflow

    await bcdsContract.connect(supplier)
      .tokenizeClothing(
        "Emergency Jacket",
        0,
        "Warehouse A"
      );

    await bcdsContract.connect(ngo)
      .createReliefRequest(
        "Emergency Jacket",
        1,
        "Flood Relief Zone"
      );

    await bcdsContract.connect(matcher)
      .matchSupplyToRequest(1, 1);

    // Unauthorized actor attempts verification

    await expect(
      bcdsContract.connect(supplier)
        .verifyDelivery(1)
    ).to.revert(ethers);
  });

  // =========================================================
  // ROLE SECURITY TEST
  // =========================================================

  it("Should reject non-supplier tokenization", async function () {

    await expect(
      bcdsContract.connect(ngo)
        .tokenizeClothing(
          "Fake Item",
          0,
          "Unknown"
        )
    ).to.revert(ethers);
  });

});