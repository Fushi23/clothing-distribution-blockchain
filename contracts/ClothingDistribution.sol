// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * ------------------------------------------------------------------------
 * Blockchain Clothing Distribution System (BCDS)
 * ------------------------------------------------------------------------
 */

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract ClothingDistribution is
    AccessControl,
    Pausable,
    ReentrancyGuard
{
    // =============================================================
    //                           ROLES
    // =============================================================

    bytes32 public constant SUPPLIER_ROLE =
        keccak256("SUPPLIER_ROLE");

    bytes32 public constant NGO_ROLE =
        keccak256("NGO_ROLE");

    bytes32 public constant MATCHER_ROLE =
        keccak256("MATCHER_ROLE");

    // =============================================================
    //                           ENUMS
    // =============================================================

    enum ConditionTier {
        Mint,
        Good,
        Fair
    }

    enum RequestStatus {
        Pending,
        Matched,
        Delivered,
        Cancelled
    }

    // =============================================================
    //                          STRUCTS
    // =============================================================

    struct ClothingItem {
        uint256 id;
        address supplier;
        string garmentProfile;
        ConditionTier condition;
        string gpsProvenance;
        bool isAllocated;
        uint256 createdAt;
    }

    struct ReliefRequest {
        uint256 id;
        address ngo;
        string itemTypeNeeded;
        uint256 quantityNeeded;
        string sectorLocation;
        RequestStatus status;
        uint256 matchedItemId;
        uint256 createdAt;
        uint256 deliveredAt;
    }

    // =============================================================
    //                         STORAGE
    // =============================================================

    uint256 public itemCount;
    uint256 public requestCount;

    mapping(uint256 => ClothingItem) public clothingRegistry;
    mapping(uint256 => ReliefRequest) public reliefRequests;

    // =============================================================
    //                       CUSTOM ERRORS
    // =============================================================

    error InvalidRequest();
    error InvalidItem();
    error AlreadyAllocated();
    error InvalidStatus();
    error Unauthorized();
    error EmptyField();
    error InvalidQuantity();

    // =============================================================
    //                           EVENTS
    // =============================================================

    event ClothingTokenized(
        uint256 indexed itemId,
        address indexed supplier,
        string garmentProfile
    );

    event ReliefRequestCreated(
        uint256 indexed requestId,
        address indexed ngo,
        string itemType,
        uint256 quantity
    );

    event SupplyMatched(
        uint256 indexed requestId,
        uint256 indexed itemId,
        address indexed matchedBy
    );

    event DeliveryVerified(
        uint256 indexed requestId,
        uint256 indexed itemId,
        address indexed ngo
    );

    event RequestCancelled(
        uint256 indexed requestId
    );

    // =============================================================
    //                         CONSTRUCTOR
    // =============================================================

    constructor(address admin) {
        require(admin != address(0), "Invalid admin");

        _grantRole(DEFAULT_ADMIN_ROLE, admin);

        _grantRole(MATCHER_ROLE, admin);
    }

    // =============================================================
    //                    CLOTHING TOKENIZATION
    // =============================================================

    /**
     * @notice Registers clothing inventory on-chain.
     */
    function tokenizeClothing(
        string calldata garmentProfile,
        ConditionTier condition,
        string calldata gpsProvenance
    )
        external
        whenNotPaused
        onlyRole(SUPPLIER_ROLE)
    {
        if (bytes(garmentProfile).length == 0)
            revert EmptyField();

        if (bytes(gpsProvenance).length == 0)
            revert EmptyField();

        unchecked {
            ++itemCount;
        }

        clothingRegistry[itemCount] = ClothingItem({
            id: itemCount,
            supplier: msg.sender,
            garmentProfile: garmentProfile,
            condition: condition,
            gpsProvenance: gpsProvenance,
            isAllocated: false,
            createdAt: block.timestamp
        });

        emit ClothingTokenized(
            itemCount,
            msg.sender,
            garmentProfile
        );
    }

    // =============================================================
    //                    RELIEF REQUEST CREATION
    // =============================================================

    /**
     * @notice NGOs submit requests for relief inventory.
     */
    function createReliefRequest(
        string calldata itemTypeNeeded,
        uint256 quantityNeeded,
        string calldata sectorLocation
    )
        external
        whenNotPaused
        onlyRole(NGO_ROLE)
    {
        if (bytes(itemTypeNeeded).length == 0)
            revert EmptyField();

        if (bytes(sectorLocation).length == 0)
            revert EmptyField();

        if (quantityNeeded == 0)
            revert InvalidQuantity();

        unchecked {
            ++requestCount;
        }

        reliefRequests[requestCount] = ReliefRequest({
            id: requestCount,
            ngo: msg.sender,
            itemTypeNeeded: itemTypeNeeded,
            quantityNeeded: quantityNeeded,
            sectorLocation: sectorLocation,
            status: RequestStatus.Pending,
            matchedItemId: 0,
            createdAt: block.timestamp,
            deliveredAt: 0
        });

        emit ReliefRequestCreated(
            requestCount,
            msg.sender,
            itemTypeNeeded,
            quantityNeeded
        );
    }

    // =============================================================
    //                        MATCHING ENGINE
    // =============================================================

    /**
     * @notice Matches available clothing inventory to active NGO requests.
     */
    function matchSupplyToRequest(
        uint256 requestId,
        uint256 itemId
    )
        external
        whenNotPaused
        nonReentrant
        onlyRole(MATCHER_ROLE)
    {
        ReliefRequest storage request =
            reliefRequests[requestId];

        ClothingItem storage item =
            clothingRegistry[itemId];

        if (request.id == 0)
            revert InvalidRequest();

        if (item.id == 0)
            revert InvalidItem();

        if (request.status != RequestStatus.Pending)
            revert InvalidStatus();

        if (item.isAllocated)
            revert AlreadyAllocated();

        item.isAllocated = true;

        request.status = RequestStatus.Matched;
        request.matchedItemId = itemId;

        emit SupplyMatched(
            requestId,
            itemId,
            msg.sender
        );
    }

    // =============================================================
    //                    PROOF OF DELIVERY
    // =============================================================

    /**
     * @notice NGO confirms successful distribution delivery.
     */
    function verifyDelivery(
        uint256 requestId
    )
        external
        whenNotPaused
        nonReentrant
        onlyRole(NGO_ROLE)
    {
        ReliefRequest storage request =
            reliefRequests[requestId];

        if (request.id == 0)
            revert InvalidRequest();

        if (request.ngo != msg.sender)
            revert Unauthorized();

        if (request.status != RequestStatus.Matched)
            revert InvalidStatus();

        request.status = RequestStatus.Delivered;
        request.deliveredAt = block.timestamp;

        emit DeliveryVerified(
            requestId,
            request.matchedItemId,
            msg.sender
        );
    }

    // =============================================================
    //                    REQUEST CANCELLATION
    // =============================================================

    /**
     * @notice NGO can cancel pending requests.
     */
    function cancelRequest(
        uint256 requestId
    )
        external
        whenNotPaused
        onlyRole(NGO_ROLE)
    {
        ReliefRequest storage request =
            reliefRequests[requestId];

        if (request.id == 0)
            revert InvalidRequest();

        if (request.ngo != msg.sender)
            revert Unauthorized();

        if (request.status != RequestStatus.Pending)
            revert InvalidStatus();

        request.status = RequestStatus.Cancelled;

        emit RequestCancelled(requestId);
    }

    // =============================================================
    //                    ADMIN FUNCTIONS
    // =============================================================

    /**
     * @notice Emergency pause.
     */
    function pause()
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        _pause();
    }

    /**
     * @notice Resume contract operations.
     */
    function unpause()
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        _unpause();
    }

    /**
     * @notice Grant supplier role.
     */
    function addSupplier(
        address supplier
    )
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        grantRole(SUPPLIER_ROLE, supplier);
    }

    /**
     * @notice Grant NGO role.
     */
    function addNGO(
        address ngo
    )
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        grantRole(NGO_ROLE, ngo);
    }

    /**
     * @notice Grant matcher role.
     */
    function addMatcher(
        address matcher
    )
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        grantRole(MATCHER_ROLE, matcher);
    }

    // =============================================================
    //                        VIEW FUNCTIONS
    // =============================================================

    /**
     * @notice Returns clothing item information.
     */
    function getClothingItem(
        uint256 itemId
    )
        external
        view
        returns (ClothingItem memory)
    {
        return clothingRegistry[itemId];
    }

    /**
     * @notice Returns relief request information.
     */
    function getReliefRequest(
        uint256 requestId
    )
        external
        view
        returns (ReliefRequest memory)
    {
        return reliefRequests[requestId];
    }
}