// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * ------------------------------------------------------------------------
 * Blockchain Clothing Distribution System (BCDS)
 * ------------------------------------------------------------------------
 *
 * A platform for distributing donated / reused clothing to people in need.
 *
 * Participants:
 *  - Admin    : the platform authority. Approves suppliers and NGOs.
 *  - Supplier : an authorized donor. Donates clothing in CATEGORIZED BUNDLES
 *               (one bag = one category, e.g. a sack of ~hundreds of shirts).
 *               Each bundle gets a unique QR hash printed on the physical bag.
 *  - NGO      : a certified relief organization. Browses available bundles,
 *               claims one, and on physical arrival SCANS THE QR CODE to
 *               confirm on-chain that the bag received is the one assigned.
 *
 * Lifecycle of a bundle:
 *   createBundle() -> Available -> claimBundle() -> Claimed
 *                  -> confirmReceipt(qr) -> Delivered
 *   (supplier may cancelBundle while Available; NGO may releaseClaim while Claimed)
 */

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract ClothingDistribution is AccessControl, Pausable, ReentrancyGuard {
    // =============================================================
    //                           ROLES
    // =============================================================

    bytes32 public constant SUPPLIER_ROLE = keccak256("SUPPLIER_ROLE");
    bytes32 public constant NGO_ROLE = keccak256("NGO_ROLE");

    // =============================================================
    //                           ENUMS
    // =============================================================

    enum Category {
        Shirts,
        Pants,
        Shoes,
        Jackets,
        Accessories,
        Other
    }

    enum Condition {
        New,
        Good,
        Fair
    }

    enum BundleStatus {
        Available,
        Claimed,
        Delivered,
        Cancelled
    }

    enum ApplicantType {
        None,
        Supplier,
        NGO
    }

    enum ApplicationStatus {
        None,
        Pending,
        Approved,
        Rejected
    }

    // =============================================================
    //                          STRUCTS
    // =============================================================

    struct Applicant {
        address account;
        ApplicantType kind;
        string orgName;
        string contactInfo;
        ApplicationStatus status;
        uint256 appliedAt;
    }

    struct Bundle {
        uint256 id;
        address supplier;
        Category category;
        Condition condition;
        uint256 itemCount;
        string description;
        string originLocation;
        bytes32 qrHash;
        BundleStatus status;
        address claimedBy;
        string deliveryLocation;
        uint256 createdAt;
        uint256 claimedAt;
        uint256 deliveredAt;
    }

    // =============================================================
    //                         STORAGE
    // =============================================================

    uint256 public bundleCount;

    mapping(uint256 => Bundle) public bundles;

    mapping(address => Applicant) public applicants;
    address[] private applicantList;

    // =============================================================
    //                       CUSTOM ERRORS
    // =============================================================

    error ZeroAddress();
    error EmptyField();
    error InvalidItemCount();
    error InvalidApplicantType();
    error AlreadyApplied();
    error AlreadyApproved();
    error NoPendingApplication();
    error BundleNotFound();
    error BundleNotAvailable();
    error BundleNotClaimed();
    error NotBundleOwner();
    error NotClaimant();
    error QrMismatch();

    // =============================================================
    //                           EVENTS
    // =============================================================

    event ApplicationSubmitted(
        address indexed account,
        ApplicantType kind,
        string orgName
    );

    event ApplicationApproved(address indexed account, ApplicantType kind);

    event ApplicationRejected(address indexed account);

    event BundleCreated(
        uint256 indexed bundleId,
        address indexed supplier,
        Category category,
        uint256 itemCount,
        bytes32 qrHash
    );

    event BundleClaimed(uint256 indexed bundleId, address indexed ngo);

    event ClaimReleased(uint256 indexed bundleId, address indexed ngo);

    event BundleDelivered(
        uint256 indexed bundleId,
        address indexed ngo,
        uint256 deliveredAt
    );

    event BundleCancelled(uint256 indexed bundleId);

    // =============================================================
    //                         CONSTRUCTOR
    // =============================================================

    constructor(address admin) {
        if (admin == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    // =============================================================
    //                    REGISTRATION / APPROVAL
    // =============================================================

    /**
     * @notice Apply to become an authorized Supplier or certified NGO.
     *         The admin reviews and approves the application off-platform
     *         (e.g. verifying NGO certification) before granting the role.
     */
    function applyForRole(
        ApplicantType kind,
        string calldata orgName,
        string calldata contactInfo
    ) external whenNotPaused {
        if (kind != ApplicantType.Supplier && kind != ApplicantType.NGO)
            revert InvalidApplicantType();

        if (bytes(orgName).length == 0) revert EmptyField();

        // Already holds a role -> no need to apply.
        if (hasRole(SUPPLIER_ROLE, msg.sender) || hasRole(NGO_ROLE, msg.sender))
            revert AlreadyApproved();

        Applicant storage existing = applicants[msg.sender];

        // Allow re-applying only if never applied or previously rejected.
        if (existing.status == ApplicationStatus.Pending) revert AlreadyApplied();

        if (existing.status == ApplicationStatus.None) {
            applicantList.push(msg.sender);
        }

        applicants[msg.sender] = Applicant({
            account: msg.sender,
            kind: kind,
            orgName: orgName,
            contactInfo: contactInfo,
            status: ApplicationStatus.Pending,
            appliedAt: block.timestamp
        });

        emit ApplicationSubmitted(msg.sender, kind, orgName);
    }

    /**
     * @notice Admin approves a pending application and grants the matching role.
     */
    function approveApplicant(address account)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        Applicant storage app = applicants[account];

        if (app.status != ApplicationStatus.Pending)
            revert NoPendingApplication();

        app.status = ApplicationStatus.Approved;

        if (app.kind == ApplicantType.Supplier) {
            _grantRole(SUPPLIER_ROLE, account);
        } else {
            _grantRole(NGO_ROLE, account);
        }

        emit ApplicationApproved(account, app.kind);
    }

    /**
     * @notice Admin rejects a pending application.
     */
    function rejectApplicant(address account)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        Applicant storage app = applicants[account];

        if (app.status != ApplicationStatus.Pending)
            revert NoPendingApplication();

        app.status = ApplicationStatus.Rejected;

        emit ApplicationRejected(account);
    }

    /**
     * @notice Admin can directly onboard a participant without an application
     *         (e.g. seeding the platform or off-chain vetted partners).
     */
    function registerParticipant(address account, ApplicantType kind)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        if (account == address(0)) revert ZeroAddress();
        if (kind != ApplicantType.Supplier && kind != ApplicantType.NGO)
            revert InvalidApplicantType();

        if (applicants[account].status == ApplicationStatus.None) {
            applicantList.push(account);
        }

        applicants[account] = Applicant({
            account: account,
            kind: kind,
            orgName: applicants[account].orgName,
            contactInfo: applicants[account].contactInfo,
            status: ApplicationStatus.Approved,
            appliedAt: block.timestamp
        });

        if (kind == ApplicantType.Supplier) {
            _grantRole(SUPPLIER_ROLE, account);
        } else {
            _grantRole(NGO_ROLE, account);
        }

        emit ApplicationApproved(account, kind);
    }

    // =============================================================
    //                      BUNDLE CREATION
    // =============================================================

    /**
     * @notice A supplier donates a categorized bundle (one bag, one category).
     *         A unique QR hash is derived and meant to be printed on the bag.
     * @return bundleId   the new bundle's id
     * @return qrHash     the unique code to encode in the printed QR
     */
    function createBundle(
        Category category,
        Condition condition,
        uint256 itemCount,
        string calldata description,
        string calldata originLocation
    )
        external
        whenNotPaused
        onlyRole(SUPPLIER_ROLE)
        returns (uint256 bundleId, bytes32 qrHash)
    {
        if (itemCount == 0) revert InvalidItemCount();
        if (bytes(description).length == 0) revert EmptyField();
        if (bytes(originLocation).length == 0) revert EmptyField();

        unchecked {
            ++bundleCount;
        }
        bundleId = bundleCount;

        // Unique, hard-to-guess tag for the physical bag.
        qrHash = keccak256(
            abi.encodePacked(
                bundleId,
                msg.sender,
                block.timestamp,
                block.prevrandao
            )
        );

        bundles[bundleId] = Bundle({
            id: bundleId,
            supplier: msg.sender,
            category: category,
            condition: condition,
            itemCount: itemCount,
            description: description,
            originLocation: originLocation,
            qrHash: qrHash,
            status: BundleStatus.Available,
            claimedBy: address(0),
            deliveryLocation: "",
            createdAt: block.timestamp,
            claimedAt: 0,
            deliveredAt: 0
        });

        emit BundleCreated(bundleId, msg.sender, category, itemCount, qrHash);
    }

    /**
     * @notice Supplier cancels their own bundle while it is still Available.
     */
    function cancelBundle(uint256 bundleId)
        external
        whenNotPaused
        onlyRole(SUPPLIER_ROLE)
    {
        Bundle storage b = bundles[bundleId];

        if (b.id == 0) revert BundleNotFound();
        if (b.supplier != msg.sender) revert NotBundleOwner();
        if (b.status != BundleStatus.Available) revert BundleNotAvailable();

        b.status = BundleStatus.Cancelled;

        emit BundleCancelled(bundleId);
    }

    // =============================================================
    //                      CLAIM / RECEIPT
    // =============================================================

    /**
     * @notice A certified NGO claims an available bundle from the dashboard.
     */
    function claimBundle(uint256 bundleId, string calldata deliveryLocation)
        external
        whenNotPaused
        nonReentrant
        onlyRole(NGO_ROLE)
    {
        Bundle storage b = bundles[bundleId];

        if (b.id == 0) revert BundleNotFound();
        if (b.status != BundleStatus.Available) revert BundleNotAvailable();
        if (bytes(deliveryLocation).length == 0) revert EmptyField();

        b.status = BundleStatus.Claimed;
        b.claimedBy = msg.sender;
        b.deliveryLocation = deliveryLocation;
        b.claimedAt = block.timestamp;

        emit BundleClaimed(bundleId, msg.sender);
    }

    /**
     * @notice NGO releases a claim it can no longer fulfil, returning the
     *         bundle to the Available pool.
     */
    function releaseClaim(uint256 bundleId)
        external
        whenNotPaused
        onlyRole(NGO_ROLE)
    {
        Bundle storage b = bundles[bundleId];

        if (b.id == 0) revert BundleNotFound();
        if (b.status != BundleStatus.Claimed) revert BundleNotClaimed();
        if (b.claimedBy != msg.sender) revert NotClaimant();

        b.status = BundleStatus.Available;
        b.claimedBy = address(0);
        b.deliveryLocation = "";
        b.claimedAt = 0;

        emit ClaimReleased(bundleId, msg.sender);
    }

    /**
     * @notice On physical arrival, the NGO scans the bag's QR code and submits
     *         the encoded hash. Delivery is only confirmed if the scanned hash
     *         matches the on-chain hash for the bundle assigned to this NGO.
     *         This is the cryptographic proof that the right bag arrived.
     */
    function confirmReceipt(uint256 bundleId, bytes32 scannedQrHash)
        external
        whenNotPaused
        nonReentrant
        onlyRole(NGO_ROLE)
    {
        Bundle storage b = bundles[bundleId];

        if (b.id == 0) revert BundleNotFound();
        if (b.status != BundleStatus.Claimed) revert BundleNotClaimed();
        if (b.claimedBy != msg.sender) revert NotClaimant();
        if (scannedQrHash != b.qrHash) revert QrMismatch();

        b.status = BundleStatus.Delivered;
        b.deliveredAt = block.timestamp;

        emit BundleDelivered(bundleId, msg.sender, block.timestamp);
    }

    // =============================================================
    //                        ADMIN FUNCTIONS
    // =============================================================

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    // =============================================================
    //                        VIEW FUNCTIONS
    // =============================================================

    function getBundle(uint256 bundleId)
        external
        view
        returns (Bundle memory)
    {
        return bundles[bundleId];
    }

    /// @notice Returns every bundle. Convenient for the dashboard at demo scale.
    function getAllBundles() external view returns (Bundle[] memory) {
        Bundle[] memory all = new Bundle[](bundleCount);
        for (uint256 i = 1; i <= bundleCount; i++) {
            all[i - 1] = bundles[i];
        }
        return all;
    }

    function getApplicant(address account)
        external
        view
        returns (Applicant memory)
    {
        return applicants[account];
    }

    /// @notice Returns every applicant record (admin dashboard filters these).
    function getAllApplicants() external view returns (Applicant[] memory) {
        Applicant[] memory all = new Applicant[](applicantList.length);
        for (uint256 i = 0; i < applicantList.length; i++) {
            all[i] = applicants[applicantList[i]];
        }
        return all;
    }

    function applicantCount() external view returns (uint256) {
        return applicantList.length;
    }

    /// @notice Single-call role lookup for the frontend.
    function getRoles(address account)
        external
        view
        returns (bool isAdmin, bool isSupplier, bool isNgo)
    {
        isAdmin = hasRole(DEFAULT_ADMIN_ROLE, account);
        isSupplier = hasRole(SUPPLIER_ROLE, account);
        isNgo = hasRole(NGO_ROLE, account);
    }

    /// @notice Aggregate counts for the stats dashboard.
    function getStats()
        external
        view
        returns (
            uint256 total,
            uint256 available,
            uint256 claimed,
            uint256 delivered
        )
    {
        total = bundleCount;
        for (uint256 i = 1; i <= bundleCount; i++) {
            BundleStatus s = bundles[i].status;
            if (s == BundleStatus.Available) {
                available++;
            } else if (s == BundleStatus.Claimed) {
                claimed++;
            } else if (s == BundleStatus.Delivered) {
                delivered++;
            }
        }
    }
}
