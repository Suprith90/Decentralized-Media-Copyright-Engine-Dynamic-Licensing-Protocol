import os
import json
import logging
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from PIL import Image
import imagehash
from cryptography.hazmat.primitives import hashes
from web3 import Web3

# Setup logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("media_processor")

app = FastAPI(title="Decentralized Media Copyright Engine Backend")

# Enable CORS for React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create Mock IPFS storage folder
MOCK_IPFS_DIR = os.path.join(os.path.dirname(__file__), "mock_ipfs")
os.makedirs(MOCK_IPFS_DIR, exist_ok=True)

# Mount Mock IPFS folder as static files so frontend can view original images
app.mount("/mock_ipfs", StaticFiles(directory=MOCK_IPFS_DIR), name="mock_ipfs")

# Web3 connection details
HARDHAT_PROVIDER_URL = os.getenv("HARDHAT_PROVIDER_URL", "http://127.0.0.1:8545")
w3 = Web3(Web3.HTTPProvider(HARDHAT_PROVIDER_URL))

BACKEND_MINT_KEY = os.getenv("BACKEND_MINT_KEY", "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80")

# Paths to Hardhat artifacts
BLOCKCHAIN_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "blockchain")
ADDRESSES_FILE = os.path.join(BLOCKCHAIN_DIR, "deployed_addresses.json")
REGISTRY_ARTIFACT_PATH = os.path.join(
    BLOCKCHAIN_DIR, "artifacts", "contracts", "MediaCopyrightRegistry.sol", "MediaCopyrightRegistry.json"
)

def get_registry_contract():
    if not os.path.exists(ADDRESSES_FILE):
        raise HTTPException(status_code=500, detail="Smart contracts not deployed yet. Please deploy to localhost first.")
    
    if not os.path.exists(REGISTRY_ARTIFACT_PATH):
        raise HTTPException(status_code=500, detail="Contract artifacts not compiled. Please compile contracts first.")
        
    with open(ADDRESSES_FILE, "r") as f:
        addresses = json.load(f)
    registry_address = addresses.get("registry")
    
    with open(REGISTRY_ARTIFACT_PATH, "r") as f:
        artifact = json.load(f)
    abi = artifact["abi"]
    
    return w3.eth.contract(address=registry_address, abi=abi)

@app.get("/health")
def health_check():
    connected = w3.is_connected()
    return {
        "status": "healthy",
        "web3_connected": connected,
        "provider": HARDHAT_PROVIDER_URL
    }

@app.post("/compute-hash")
async def compute_hash(file: UploadFile = File(...)):
    try:
        contents = await file.read()
        
        # 1. Compute Cryptographic SHA-256 Hash using cryptography library
        digest = hashes.Hash(hashes.SHA256())
        digest.update(contents)
        sha256_hash = digest.finalize().hex()
        
        # 2. Compute Perceptual Hash (pHash) using ImageHash
        from io import BytesIO
        image = Image.open(BytesIO(contents))
        phash_val = imagehash.phash(image)
        phash_str = str(phash_val)
        
        # Terminal Logging
        logger.info("========================================")
        logger.info(f"Fingerprint generated for uploaded file: {file.filename}")
        logger.info(f"  SHA-256 (IPFS): {sha256_hash}")
        logger.info(f"  Perceptual Hash (pHash): {phash_str}")
        logger.info("========================================")
        
        return {
            "filename": file.filename,
            "sha256": sha256_hash,
            "phash": phash_str
        }
    except Exception as e:
        logger.error(f"Error computing hash: {e}")
        raise HTTPException(status_code=400, detail=f"Failed to process image: {str(e)}")

@app.post("/register-asset")
async def register_asset(
    file: UploadFile = File(...),
    creator_address: str = Form("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266")
):
    try:
        if not w3.is_connected():
            raise HTTPException(status_code=503, detail="Local Hardhat node is not running. Please start it using 'npx hardhat node'.")

        if not BACKEND_MINT_KEY:
            raise HTTPException(status_code=503, detail="Backend mint signer is not configured. Set BACKEND_MINT_KEY.")

        try:
            mint_account = w3.eth.account.from_key(BACKEND_MINT_KEY).address
        except ValueError:
            raise HTTPException(status_code=500, detail="BACKEND_MINT_KEY is invalid.")
        
        contents = await file.read()
        
        # 1. Compute Cryptographic SHA-256 Hash
        digest = hashes.Hash(hashes.SHA256())
        digest.update(contents)
        sha256_hash = digest.finalize().hex()
        
        # 2. Compute Perceptual Hash
        from io import BytesIO
        image = Image.open(BytesIO(contents))
        phash_val = imagehash.phash(image)
        phash_str = str(phash_val)
        
        # 3. Save to mock IPFS storage folder
        _, ext = os.path.splitext(file.filename)
        if not ext:
            ext = ".png"
        saved_filename = f"{sha256_hash}{ext}"
        saved_path = os.path.join(MOCK_IPFS_DIR, saved_filename)
        
        with open(saved_path, "wb") as f:
            f.write(contents)
            
        ipfs_metadata_uri = f"http://localhost:8000/mock_ipfs/{saved_filename}"
        
        # 4. Connect to contract
        contract = get_registry_contract()
        
        # Check if already registered (exact check)
        existing_token = contract.functions.getTokenByPerceptualHash(phash_str).call()
        if existing_token != 0:
            owner = contract.functions.ownerOf(existing_token).call()
            raise HTTPException(
                status_code=409,
                detail=f"Copyright Conflict Detected - Registered by Entity {owner} (Token ID {existing_token})"
            )

        # 5. Build and send mint transaction
        try:
            creator_addr_checksum = w3.to_checksum_address(creator_address)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid Ethereum address format.")
            
        nonce = w3.eth.get_transaction_count(mint_account)
        
        # Estimate gas
        gas_estimate = contract.functions.mintCopyright(
            creator_addr_checksum, phash_str, ipfs_metadata_uri
        ).estimate_gas({"from": mint_account})
        
        tx = contract.functions.mintCopyright(
            creator_addr_checksum, phash_str, ipfs_metadata_uri
        ).build_transaction({
            "from": mint_account,
            "gas": int(gas_estimate * 1.2),
            "gasPrice": w3.eth.gas_price,
            "nonce": nonce,
        })
        
        # Sign transaction
        signed_tx = w3.eth.account.sign_transaction(tx, private_key=BACKEND_MINT_KEY)
        
        # Send transaction
        tx_hash = w3.eth.send_raw_transaction(signed_tx.raw_transaction)
        
        # Wait for receipt
        receipt = w3.eth.wait_for_transaction_receipt(tx_hash)
        
        token_id = contract.functions.getTokenByPerceptualHash(phash_str).call()
        
        # Logs display
        logger.info("=== COPYRIGHT REGISTRATION COMPLETE ===")
        logger.info(f"Asset Registered: {file.filename}")
        logger.info(f"  Owner Address:  {creator_addr_checksum}")
        logger.info(f"  pHash:          {phash_str}")
        logger.info(f"  Mock IPFS URI:  {ipfs_metadata_uri}")
        logger.info(f"  Token ID:       {token_id}")
        logger.info(f"  Tx Hash:        {receipt.transactionHash.hex()}")
        logger.info("========================================")
        
        return {
            "success": True,
            "filename": file.filename,
            "phash": phash_str,
            "ipfs_uri": ipfs_metadata_uri,
            "token_id": token_id,
            "tx_hash": receipt.transactionHash.hex(),
            "owner": creator_addr_checksum
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error registering asset: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to register asset: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
