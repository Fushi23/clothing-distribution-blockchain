import { expect } from "chai";
import { network } from "hardhat";

const { ethers, networkHelpers } = await network.create();

// Enum mirrors (must match the contract ordering)
const ApplicantType = { None: 0, Supplier: 1, NGO: 2 };
const Category = { Shirts: 0, Pants: 1, Shoes: 2, Jackets: 3, Accessories: 4, Other: 5 };
const Condition = { New: 0, Good: 1, Fair: 2 };
const BundleStatus = { Available: 0, Claimed: 1, Delivered: 2, Cancelled: 3 };
const AppStatus = { None: 0, Pending: 1, Approved: 2, Rejected: 3 };

// Predicate matcher for an unindexed positive-uint event arg (e.g. a timestamp).
const anyUint = (value: bigint) => typeof value === "bigint" && value > 0n;

describe("Blockchain Clothing Distribution System (BCDS)", function () {
  async function deployFixture() {
    const [admin, supplier, ngo, outsider] = await ethers.getSigners();

    const bcds = await ethers.deployContract("ClothingDistribution", [admin.address]);
    await bcds.waitForDeployment();

    return { bcds, admin, supplier, ngo, outsider };
  }

  // Approves supplier + ngo and creates one available bundle (id 1).
  async function seededFixture() {
    const ctx = await deployFixture();
    const { bcds, admin, supplier, ngo } = ctx;

    await bcds.connect(admin).registerParticipant(supplier.address, ApplicantType.Supplier);
    await bcds.connect(admin).registerParticipant(ngo.address, ApplicantType.NGO);

    await bcds
      .connect(supplier)
      .createBundle(Category.Shirts, Condition.Good, 150, "Mixed cotton shirts", "Warehouse KL");

    return ctx;
  }

  // =========================================================
  // REGISTRATION / APPROVAL
  // =========================================================

  describe("Registration & approval", function () {
    it("lets an address apply and admin approve, granting the role", async function () {
      const { bcds, admin, supplier } = await networkHelpers.loadFixture(deployFixture);

      await expect(
        bcds.connect(supplier).applyForRole(ApplicantType.Supplier, "Acme Donations", "acme@x.com")
      )
        .to.emit(bcds, "ApplicationSubmitted")
        .withArgs(supplier.address, ApplicantType.Supplier, "Acme Donations");

      let app = await bcds.getApplicant(supplier.address);
      expect(app.status).to.equal(AppStatus.Pending);

      await expect(bcds.connect(admin).approveApplicant(supplier.address))
        .to.emit(bcds, "ApplicationApproved")
        .withArgs(supplier.address, ApplicantType.Supplier);

      const [, isSupplier] = await bcds.getRoles(supplier.address);
      expect(isSupplier).to.equal(true);

      app = await bcds.getApplicant(supplier.address);
      expect(app.status).to.equal(AppStatus.Approved);
    });

    it("rejects an application without granting a role", async function () {
      const { bcds, admin, ngo } = await networkHelpers.loadFixture(deployFixture);

      await bcds.connect(ngo).applyForRole(ApplicantType.NGO, "Fake NGO", "");
      await expect(bcds.connect(admin).rejectApplicant(ngo.address)).to.emit(
        bcds,
        "ApplicationRejected"
      );

      const [, , isNgo] = await bcds.getRoles(ngo.address);
      expect(isNgo).to.equal(false);
    });

    it("blocks a second pending application", async function () {
      const { bcds, supplier } = await networkHelpers.loadFixture(deployFixture);

      await bcds.connect(supplier).applyForRole(ApplicantType.Supplier, "Acme", "");
      await expect(
        bcds.connect(supplier).applyForRole(ApplicantType.Supplier, "Acme", "")
      ).to.be.revertedWithCustomError(bcds, "AlreadyApplied");
    });

    it("only admin can approve", async function () {
      const { bcds, supplier, outsider } = await networkHelpers.loadFixture(deployFixture);

      await bcds.connect(supplier).applyForRole(ApplicantType.Supplier, "Acme", "");
      await expect(bcds.connect(outsider).approveApplicant(supplier.address)).to.revert(ethers);
    });
  });

  // =========================================================
  // BUNDLE CREATION
  // =========================================================

  describe("Bundle creation", function () {
    it("lets an approved supplier create a categorized bundle with a QR hash", async function () {
      const { bcds, supplier } = await networkHelpers.loadFixture(seededFixture);

      const bundle = await bcds.getBundle(1);
      expect(bundle.supplier).to.equal(supplier.address);
      expect(bundle.category).to.equal(Category.Shirts);
      expect(bundle.itemCount).to.equal(150n);
      expect(bundle.status).to.equal(BundleStatus.Available);
      expect(bundle.qrHash).to.not.equal(ethers.ZeroHash);
    });

    it("rejects bundle creation from a non-supplier", async function () {
      const { bcds, outsider } = await networkHelpers.loadFixture(seededFixture);

      await expect(
        bcds
          .connect(outsider)
          .createBundle(Category.Shoes, Condition.Fair, 10, "stuff", "here")
      ).to.revert(ethers);
    });

    it("rejects an empty bundle (zero items)", async function () {
      const { bcds, supplier } = await networkHelpers.loadFixture(seededFixture);

      await expect(
        bcds.connect(supplier).createBundle(Category.Shoes, Condition.New, 0, "x", "y")
      ).to.be.revertedWithCustomError(bcds, "InvalidItemCount");
    });

    it("lets a supplier cancel their own available bundle", async function () {
      const { bcds, supplier } = await networkHelpers.loadFixture(seededFixture);

      await expect(bcds.connect(supplier).cancelBundle(1)).to.emit(bcds, "BundleCancelled");
      const bundle = await bcds.getBundle(1);
      expect(bundle.status).to.equal(BundleStatus.Cancelled);
    });
  });

  // =========================================================
  // CLAIM / RELEASE
  // =========================================================

  describe("Claiming", function () {
    it("lets an NGO claim an available bundle", async function () {
      const { bcds, ngo } = await networkHelpers.loadFixture(seededFixture);

      await expect(bcds.connect(ngo).claimBundle(1))
        .to.emit(bcds, "BundleClaimed")
        .withArgs(1, ngo.address);

      const bundle = await bcds.getBundle(1);
      expect(bundle.status).to.equal(BundleStatus.Claimed);
      expect(bundle.claimedBy).to.equal(ngo.address);
    });

    it("prevents double-claiming", async function () {
      const { bcds, ngo } = await networkHelpers.loadFixture(seededFixture);

      await bcds.connect(ngo).claimBundle(1);
      await expect(bcds.connect(ngo).claimBundle(1)).to.be.revertedWithCustomError(
        bcds,
        "BundleNotAvailable"
      );
    });

    it("rejects a claim from a non-NGO", async function () {
      const { bcds, supplier } = await networkHelpers.loadFixture(seededFixture);
      await expect(bcds.connect(supplier).claimBundle(1)).to.revert(ethers);
    });

    it("lets the NGO release a claim back to the pool", async function () {
      const { bcds, ngo } = await networkHelpers.loadFixture(seededFixture);

      await bcds.connect(ngo).claimBundle(1);
      await expect(bcds.connect(ngo).releaseClaim(1)).to.emit(bcds, "ClaimReleased");

      const bundle = await bcds.getBundle(1);
      expect(bundle.status).to.equal(BundleStatus.Available);
      expect(bundle.claimedBy).to.equal(ethers.ZeroAddress);
    });
  });

  // =========================================================
  // QR-VERIFIED RECEIPT (the core feature)
  // =========================================================

  describe("QR-verified delivery", function () {
    it("confirms delivery when the scanned QR hash matches", async function () {
      const { bcds, ngo } = await networkHelpers.loadFixture(seededFixture);

      await bcds.connect(ngo).claimBundle(1);
      const { qrHash } = await bcds.getBundle(1);

      await expect(bcds.connect(ngo).confirmReceipt(1, qrHash))
        .to.emit(bcds, "BundleDelivered")
        .withArgs(1, ngo.address, anyUint);

      const bundle = await bcds.getBundle(1);
      expect(bundle.status).to.equal(BundleStatus.Delivered);
      expect(bundle.deliveredAt).to.be.greaterThan(0n);
    });

    it("rejects a wrong/forged QR hash", async function () {
      const { bcds, ngo } = await networkHelpers.loadFixture(seededFixture);

      await bcds.connect(ngo).claimBundle(1);
      const forged = ethers.keccak256(ethers.toUtf8Bytes("not-the-real-bag"));

      await expect(bcds.connect(ngo).confirmReceipt(1, forged)).to.be.revertedWithCustomError(
        bcds,
        "QrMismatch"
      );
    });

    it("rejects receipt confirmation by an NGO that did not claim it", async function () {
      const { bcds, admin, ngo, outsider } = await networkHelpers.loadFixture(seededFixture);

      // Onboard a second NGO.
      await bcds.connect(admin).registerParticipant(outsider.address, ApplicantType.NGO);

      await bcds.connect(ngo).claimBundle(1);
      const { qrHash } = await bcds.getBundle(1);

      await expect(
        bcds.connect(outsider).confirmReceipt(1, qrHash)
      ).to.be.revertedWithCustomError(bcds, "NotClaimant");
    });

    it("cannot confirm receipt before claiming", async function () {
      const { bcds, ngo } = await networkHelpers.loadFixture(seededFixture);
      const { qrHash } = await bcds.getBundle(1);

      await expect(bcds.connect(ngo).confirmReceipt(1, qrHash)).to.be.revertedWithCustomError(
        bcds,
        "BundleNotClaimed"
      );
    });
  });

  // =========================================================
  // PAUSE
  // =========================================================

  describe("Pause", function () {
    it("blocks bundle creation while paused and resumes after unpause", async function () {
      const { bcds, admin, supplier } = await networkHelpers.loadFixture(seededFixture);

      await bcds.connect(admin).pause();
      await expect(
        bcds.connect(supplier).createBundle(Category.Pants, Condition.Good, 5, "x", "y")
      ).to.revert(ethers);

      await bcds.connect(admin).unpause();
      await expect(
        bcds.connect(supplier).createBundle(Category.Pants, Condition.Good, 5, "x", "y")
      ).to.emit(bcds, "BundleCreated");
    });

    it("only admin can pause", async function () {
      const { bcds, supplier } = await networkHelpers.loadFixture(seededFixture);
      await expect(bcds.connect(supplier).pause()).to.revert(ethers);
    });
  });

  // =========================================================
  // VIEW HELPERS
  // =========================================================

  describe("View helpers", function () {
    it("reports aggregate stats", async function () {
      const { bcds, ngo } = await networkHelpers.loadFixture(seededFixture);

      await bcds.connect(ngo).claimBundle(1);
      const [total, available, claimed, delivered] = await bcds.getStats();
      expect(total).to.equal(1n);
      expect(available).to.equal(0n);
      expect(claimed).to.equal(1n);
      expect(delivered).to.equal(0n);
    });

    it("returns all bundles in one call", async function () {
      const { bcds, supplier } = await networkHelpers.loadFixture(seededFixture);

      await bcds.connect(supplier).createBundle(Category.Shoes, Condition.New, 40, "boots", "depot");
      const all = await bcds.getAllBundles();
      expect(all.length).to.equal(2);
      expect(all[1].category).to.equal(Category.Shoes);
    });
  });
});
