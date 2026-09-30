# Aegis Copyright Engine

A decentralized media rights ecosystem utilizing on-chain ERC-721 tokenization, perceptual visual hashing (pHash) similarity lookups, and a commercial leasing marketplace.

---

## 🌟 Key Features

1. **ERC-721 Tokenization**: Bind media assets to non-fungible tokens on the Ethereum blockchain using unique content identifiers.
2. **On-Chain Visual Duplicate Check**: Prevents identical media registration using exact pHash lookups.
3. **On-Chain Similarity Search**: Utilizes custom Solidity Hamming distance logic to scan all registered assets and detect close visual matches within a user-configurable bit threshold.
4. **Commercial Leasing Marketplace**: Enables creators to list their assets for lease (specifying price in Wei and duration in blocks). Licenses expire automatically based on the block height tracker.
5. **Hybrid Web3 Frontend**: React/Vite dashboard styled with Tailwind CSS v4 that connects to MetaMask for transaction signing, or falls back to a local RPC provider for view-only database interaction.

---

## 📂 Project Directory Structure

```text
/project 3
  ├── README.md                     # This file
  ├── blockchain/                   # Hardhat Solidity environment
  │    ├── contracts/               # Smart Contracts (Registry & Marketplace)
  │    ├── scripts/                 # Deployment & frontend sync scripts
  │    ├── test/                    # Hardhat contract unit tests
  │    ├── hardhat.config.js        # Hardhat ESM configuration
  │    └── package.json             # NPM dependencies
  ├── media_processor/              # Python FastAPI media processor
  │    ├── mock_ipfs/               # Local static image storage
  │    ├── main.py                  # API endpoints (hashing, web3 minting)
  │    └── requirements.txt         # Python package dependencies
  └── frontend/                     # React + Vite + Tailwind CSS v4 Client
       ├── public/                  # Static assets & favicon
       ├── src/                     # React application source code
       │    ├── contractsConfig.js  # Synced smart contract ABIs & addresses
       │    ├── App.jsx             # Main dashboard UI
       │    └── main.jsx            # Application entrypoint
       ├── vite.config.js           # Vite build config
       └── package.json             # Frontend NPM packages
```

---

## 🚀 Getting Started

### 📋 Prerequisites
* **Node.js** (v24+) & **npm** (v11+)
* **Python** (3.14+)
* **MetaMask** wallet extension (optional, for active minting/leasing)

---

### 1. Setup the Local Blockchain (`/blockchain`)

Open a terminal window and navigate to the `blockchain` directory.

```bash
cd blockchain
# Install Node dependencies
npm install

# Start local Hardhat blockchain node (keep this running)
npx hardhat node
```

In a new terminal window, deploy the smart contracts and sync the ABIs:

```bash
cd blockchain
# Deploy smart contracts to localhost network
npx hardhat run scripts/deploy.js --network localhost

# Sync deployed addresses and contract ABIs to the frontend
node scripts/syncFrontend.js
```

---

### 2. Setup the Media Processor Backend (`/media_processor`)

Open a terminal window and navigate to the `media_processor` directory.

```bash
cd media_processor
# Create virtual environment
python -m venv .venv

# Activate virtual environment (Windows Powershell)
.venv\Scripts\Activate.ps1

# Install Python packages
pip install -r requirements.txt

# Set the private key for a funded local Hardhat account (PowerShell)
$env:BACKEND_MINT_KEY = "<local Hardhat account private key>"

# Start the FastAPI backend server
python main.py
```
*The backend server will run on `http://localhost:8000`.*
The backend no longer includes a default signing key. Use only a disposable local Hardhat account for local development; configure production signing keys through a secret manager and never commit them.

---

### 3. Setup the Frontend Client (`/frontend`)

Open a terminal window and navigate to the `frontend` directory.

```bash
cd frontend
# Install Node dependencies
npm install

# Start the Vite development server
npm run dev
```
*The frontend client will serve on `http://localhost:5173`.*

---

## 🛡️ Usage Instructions

### **Creator Studio Tab**
1. Connect your MetaMask wallet.
2. Select/drag an image into the upload box.
3. Click **Register Copyright & Mint NFT**. The progress bar will reflect visual pHash calculation, static storage backup, and Solidity transaction minting.
4. View your minted asset under the database gallery.
5. In the right sidebar, list your token for commercial lease by supplying its Token ID, price (in ETH), and duration (in blocks).

### **Infringement Checker Tab**
1. Select/drag any suspected image file.
2. Adjust the **Hamming Bit Distance Threshold** slider (0 represents an exact match, 10 is the recommended visual similarity threshold).
3. Click **Audit Suspected Infringement**.
4. If a visual match is found on-chain within the threshold, Aegis displays a warning: **"Copyright Conflict Detected - Registered by Entity X"** with original token parameters and owner profile details.
5. Otherwise, a green **"No Visual Match Found"** notice is displayed.
