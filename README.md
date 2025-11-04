#  Decentralized Emerald Auction – Solana Smart Contract

**A decentralized auction platform on Solana** that enables users to buy and sell digital assets (e.g., NFTs) and tokenized real-world assets (e.g., real estate, commodities) through secure, transparent, and fee-optimized auctions with full SPL Token compliance.

> ⚠️ **This repository contains a Proof of Concept (POC) only.**  
> The full implementation logic is proprietary and intentionally omitted.  
> This POC demonstrates architectural design and core concepts of the Emerald Auction platform.  
> **Unauthorized use, copying, or deployment of any derived logic is strictly prohibited.**
---

## 📌 Overview

The `Emerald` program is a smart contract built with **Anchor Framework v0.32.1** on **Solana**, providing a complete on-chain infrastructure for a decentralized auction marketplace.  
It serves as the **core backend logic** for a frontend dApp, with all state and business rules enforced on-chain.

This contract uses a unified **`Dealer`** entity—any user who initializes a `Dealer` account can **immediately act as both buyer and seller**, eliminating the need for separate registration steps or role flags like `is_seller`/`is_buyer`.

The contract also natively supports **two asset types**:
- `DigitalNFT`: Standard NFTs (e.g., art, collectibles)
- `TokenizedReal`: Tokenized real-world assets (e.g., real estate, carbon credits)

---

## ✨ Key Features

- ✅ **Dual Asset Support**: Auction both NFTs and tokenized real-world assets.
- ✅ **Unified `Dealer` Model**: No separate roles—every dealer can buy and sell from initialization.
- ✅ **Strict Ownership Verification**: Validates asset ownership before auction creation.
- ✅ **Asset Escrow**: Assets are locked in a dedicated vault (`auction_vault`) for the auction duration.
- ✅ **Auto Refunds**: Automatically queues or allows claiming of refunds for outbid participants.
- ✅ **Dynamic Fee System**:
  - **Creation Fee**: 0.13%–5% of starting price (based on auction duration).
  - **Bid Fee**: 0.3% of each bid amount.
  - **Final Sale Fee**: 1% of winning bid.
- ✅ **Secure Asset Delivery**: Delivers asset only to the verified Associated Token Account (ATA) of the winner.
- ✅ **Real-Asset Safeguards**: Enforces longer auction durations for real-world assets.
- ✅ **Admin-Controlled Platform Wallet**: Only authorized admin can withdraw accumulated fees.

---

## 🧱 Accounts

| Account | Description |
|--------|-------------|
| `Dealer` | Unified account representing a user capable of **both buying and selling** by default. |
| `Asset` | Stores metadata of the listed asset, including `asset_type` (`DigitalNFT` or `TokenizedReal`), owner, mint, and listing status. |
| `Auction` | Holds the full state of an auction: timing, bids, fees, status, and refund details. |
| `ParticipatedAuction` | Records a dealer’s participation in a specific auction. |
| `ActiveAuction` | Links a dealer (as seller) to their active auction to prevent duplicate listings. |
| `PlatformWallet` | A PDA that collects all platform fees (rent-exempt, initialized once). |

---

## 📡 Instructions

| Instruction | Description | Requirements |
|------------|-------------|--------------|
| `initialize_platform()` | Initializes the platform wallet (PDA). | One-time setup by deployer. |
| `initialize_dealer(description: String)` | Creates a new `Dealer` account. | — |
| `update_dealer_description(description: String)` | Updates the dealer’s public description. | — |
| `create_auction(..., asset_type: AssetType)` | Creates a new auction for an asset. | Dealer must own the asset; `TokenizedReal` requires 24h/48h duration. |
| `place_bid(amount: u64)` | Submits a bid on an active auction. | Bid must exceed current highest and starting price. |
| `claim_pending_refund()` | Claims refund after being outbid. | Must have a pending refund in the auction. |
| `end_auction()` | Finalizes the auction and distributes assets/funds. | Only the original seller; after `end_time`. |
| `withdraw_platform_fees(amount: u64)` | Withdraws fees from the platform wallet. | Only `ADMIN_PUBKEY`. |

> ⚠️ **Note**: There are **no** `register_seller()` or `register_buyer()` instructions. All dealers are **fully enabled by default**.

---

## 🔒 Security & Validation

### ✅ **Asset Ownership Check (`create_auction`)**

The contract enforces:
```rust
require!(ctx.accounts.asset_token_account.amount == 1, ...);
require!(ctx.accounts.asset_mint.decimals == 0, ...);
require!(ctx.accounts.asset_token_account.owner == seller_authority.key(), ...);
```
- Ensures the asset is a valid SPL token with 1 unit (NFT or tokenized asset).
- Confirms the signer is the true owner.
- Verifies exactly 1 unit is held.

The asset is then **transferred into `auction_vault`**, preventing the seller from withdrawing it prematurely.

---

### ✅ **Secure Delivery (`end_auction`)**
Before delivering the asset, the contract verifies:
- The auction has truly ended.
- The asset is still in the vault (`auction_vault.amount == 1`).
- The **winner’s ATA** matches the expected address:
  ```rust
  let expected_buyer_ata = get_associated_token_address(&highest_bidder, &asset_mint);
  require!(buyer_asset_account.key() == expected_buyer_ata, ...);
  ```
- The **seller’s wallet** is their own:
  ```rust
  require!(seller_wallet.key() == seller_authority.key(), ...);
  ```

This guarantees the asset is **only sent to the rightful winner**.

---

### ✅ **Real-Asset Duration Enforcement**

For `TokenizedReal` assets, the contract enforces:
```rust
if asset_type == AssetType::TokenizedReal {
    require!(
        matches!(duration_type, AuctionDuration::Hour24 | AuctionDuration::Hour48),
        AuctionError::InvalidAuctionDurationForRealAsset
    );
}
```
> ⚠️ Short-duration auctions (e.g., 1h, 2h) are **blocked** for real-world assets to ensure seriousness and regulatory readiness.

---

## 🔄 Workflow & Operational Flow

### 1. **Platform Initialization**
- **Admin** runs `initialize_platform()` → creates `PlatformWallet` PDA.

---

### 2. **Dealer Onboarding**
- **Any user** calls `initialize_dealer("optional description")` → creates a `Dealer` account.
- ✅ **No additional steps required**. The dealer can **immediately create auctions or place bids**.

---

### 3. **Auction Creation**
- **Dealer (as seller)**:
  - Owns an asset (NFT or tokenized real-world asset).
  - Calls `create_auction(...)` with:
    - Future `start_time`
    - Valid `duration_type` (`Hour1`–`Hour48` for NFTs; **only `Hour24`/`Hour48` for real assets**)
    - `starting_price > 0`
    - Descriptive metadata
    - `asset_type` (`DigitalNFT` or `TokenizedReal`)
  - **Validation**:
    - Asset is valid and owned.
    - Duration complies with asset type.
  - **Actions**:
    - Pays creation fee (sent to `platform_wallet`).
    - Asset is moved to `auction_vault`.

---

### 4. **Bidding**
- **Dealer (as buyer)**:
  - Calls `place_bid(amount)`.
  - **Validation**:
    - Auction is active.
    - Bid ≥ starting price and > current highest bid.
  - **Actions**:
    - Bid amount (SOL) is sent to the auction PDA.
    - 0.3% fee is tracked.
    - Previous bidder’s refund is queued.

---

### 5. **Refund Claiming**
- **Outbid participant**:
  - Can call `claim_pending_refund()` at any time after being outbid.
  - Or wait for automatic refund during auction settlement.

---

### 6. **Auction Settlement**
- **Original dealer (seller)** (after `end_time`):
  - Calls `end_auction()`.
  - **If no bids**: Asset is returned to seller.
  - **If bids exist**:
    - Asset is sent to winner’s ATA.
    - Winning bid (minus 1% fee) goes to seller.
    - All collected fees (bid + sale) go to `platform_wallet`.

---

### 7. **Fee Withdrawal**
- **Admin** (`Wallet Address`):
  - Calls `withdraw_platform_fees(amount)` to withdraw accumulated fees.

---

## 🔮 Future-Proofing

By storing `asset_type` on-chain, the contract enables tomorrow’s enhancements:
- **Legal compliance**: Link to off-chain KYC or legal documents.
- **Extended metadata**: Add fields like `jurisdiction`, `appraisal_value`, or `custodian` (via future upgrades).
- **Custom logic**: Apply different fee models, settlement rules, or oracle integrations per asset type.

All without redeploying the core contract.

---

## 📜 License

This project is fully owned by **[Emerald](https://www.linkedin.com/in/mdnabeelemerald/)**.  
**Unauthorized use, modification, or redistribution is strictly prohibited** without explicit written permission from the owner.

© 2025 Emerald. All rights reserved.
```
