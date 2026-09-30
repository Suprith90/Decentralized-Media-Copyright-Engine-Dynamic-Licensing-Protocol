import { useState, useEffect, useEffectEvent } from "react";
import { ethers } from "ethers";
import axios from "axios";
import { 
  Shield, 
  Upload, 
  Search, 
  Coins, 
  Clock, 
  CheckCircle, 
  AlertTriangle, 
  FolderPlus, 
  FileCheck, 
  Link as LinkIcon, 
  Lock,
  Cpu
} from "lucide-react";
import { CONTRACT_ADDRESSES, REGISTRY_ABI, MARKETPLACE_ABI } from "./contractsConfig";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";
const LOCAL_PROVIDER_URL = import.meta.env.VITE_PROVIDER_URL || "http://127.0.0.1:8545";

export default function App() {
  // Navigation
  const [activeTab, setActiveTab] = useState("creator"); // "creator" or "checker"

  // Web3 State
  const [signer, setSigner] = useState(null);
  const [account, setAccount] = useState("");
  const [registryContract, setRegistryContract] = useState(null);
  const [marketplaceContract, setMarketplaceContract] = useState(null);
  const [networkError, setNetworkError] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);

  // Creator Studio State
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [mintStatus, setMintStatus] = useState(""); // "", "hashing", "minting", "completed", "error"
  const [mintProgressPercent, setMintProgressPercent] = useState(0);
  const [mintDetails, setMintDetails] = useState(null);
  const [creatorAddressInput, setCreatorAddressInput] = useState("");

  // Marketplace Listing State
  const [listingTokenId, setListingTokenId] = useState("");
  const [leasePrice, setLeasePrice] = useState("");
  const [leaseDuration, setLeaseDuration] = useState("");
  const [marketplaceActionStatus, setMarketplaceActionStatus] = useState("");

  // Registered Tokens State
  const [tokens, setTokens] = useState([]);
  const [isLoadingTokens, setIsLoadingTokens] = useState(false);

  // Infringement Checker State
  const [checkerFile, setCheckerFile] = useState(null);
  const [checkerPreviewUrl, setCheckerPreviewUrl] = useState(null);
  const [checkerStatus, setCheckerStatus] = useState(""); // "", "checking", "checked", "error"
  const [matchThreshold, setMatchThreshold] = useState(10);
  const [checkerResult, setCheckerResult] = useState(null); // { matchFound: bool, conflictOwner: str, tokenId: num, distance: num, pHash: str, originalImage: str }

  // Fallback Read-Only Provider to show assets without MetaMask
  const initWeb3ReadOnly = async () => {
    try {
      const readOnlyProvider = new ethers.JsonRpcProvider(LOCAL_PROVIDER_URL);
      const regContract = new ethers.Contract(CONTRACT_ADDRESSES.registry, REGISTRY_ABI, readOnlyProvider);
      const marketContract = new ethers.Contract(CONTRACT_ADDRESSES.marketplace, MARKETPLACE_ABI, readOnlyProvider);
      
      setRegistryContract(regContract);
      setMarketplaceContract(marketContract);
      
      // Load tokens initially
      await loadTokensFromContracts(regContract, marketContract, "");
    } catch (err) {
      console.error("Local Hardhat node not detected:", err);
      setNetworkError("Could not connect to local Hardhat node. Please verify it is running on http://127.0.0.1:8545");
    }
  };

  // Connect MetaMask
  const connectWallet = async () => {
    if (!window.ethereum) {
      alert("MetaMask not detected. Please install the MetaMask extension.");
      return;
    }

    setIsConnecting(true);
    try {
      const browserProvider = new ethers.BrowserProvider(window.ethereum);
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      const browserSigner = await browserProvider.getSigner();
      
      const regContract = new ethers.Contract(CONTRACT_ADDRESSES.registry, REGISTRY_ABI, browserSigner);
      const marketContract = new ethers.Contract(CONTRACT_ADDRESSES.marketplace, MARKETPLACE_ABI, browserSigner);

      setSigner(browserSigner);
      setAccount(accounts[0]);
      setCreatorAddressInput(accounts[0]);
      setRegistryContract(regContract);
      setMarketplaceContract(marketContract);
      setNetworkError("");
      
      // Reload tokens with current account active for license checking
      await loadTokensFromContracts(regContract, marketContract, accounts[0]);
    } catch (err) {
      console.error("Wallet connection failed:", err);
      alert("Failed to connect wallet.");
    } finally {
      setIsConnecting(false);
    }
  };

  // Load registered tokens
  const loadRegisteredTokens = () => {
    if (registryContract && marketplaceContract) {
      loadTokensFromContracts(registryContract, marketplaceContract, account);
    }
  };

  const loadTokensFromContracts = async (regContract, marketContract, currentUserAddress) => {
    setIsLoadingTokens(true);
    try {
      // Get all token IDs
      const rawTokens = await regContract.getAllTokens();
      const loadedTokens = [];

      // Fetch details for each token
      for (const rawId of rawTokens) {
        const tokenId = Number(rawId);
        const owner = await regContract.ownerOf(tokenId);
        const pHash = await regContract.getPerceptualHash(tokenId);
        const metadataURI = await regContract.tokenURI(tokenId);
        
        // Fetch listing
        const listing = await marketContract.listings(tokenId);
        const isListed = listing.active;
        const price = isListed ? ethers.formatEther(listing.leasePrice) : "0";
        const duration = isListed ? Number(listing.leaseDuration) : 0;
        
        // Check active license for current user
        let hasActiveLicense = false;
        let licensedUntilBlock = 0;
        if (currentUserAddress) {
          licensedUntilBlock = Number(await marketContract.isLicensedUntil(currentUserAddress, tokenId));
          const currentBlock = Number(await regContract.runner.provider.getBlockNumber());
          hasActiveLicense = licensedUntilBlock > currentBlock;
        }

        loadedTokens.push({
          tokenId,
          owner,
          pHash,
          metadataURI,
          isListed,
          price,
          duration,
          hasActiveLicense,
          licensedUntilBlock
        });
      }

      setTokens(loadedTokens.reverse()); // Newest first
    } catch (err) {
      console.error("Error loading tokens from contracts:", err);
    } finally {
      setIsLoadingTokens(false);
    }
  };

  const initializeReadOnlyContracts = useEffectEvent(() => {
    Promise.resolve().then(() => initWeb3ReadOnly());
  });

  const reloadTokensAfterAccountChange = useEffectEvent(() => {
    loadRegisteredTokens();
  });

  useEffect(() => {
    initializeReadOnlyContracts();
  }, []);

  useEffect(() => {
    if (account) {
      reloadTokensAfterAccountChange();
    }
  }, [account, registryContract, marketplaceContract]);

  // Creator Studio: Select Image File
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setMintStatus("");
      setMintDetails(null);
    }
  };

  // Creator Studio: Upload & Mint
  const handleRegisterCopyright = async (e) => {
    e.preventDefault();
    if (!selectedFile) return;

    setMintStatus("hashing");
    setMintProgressPercent(25);
    
    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("creator_address", creatorAddressInput || account || "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266");

    try {
      setMintProgressPercent(50);
      // Let the backend compute pHash, store to IPFS, and mint the ERC-721 token
      const response = await axios.post(`${BACKEND_URL}/register-asset`, formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      
      setMintProgressPercent(90);
      if (response.data.success) {
        setMintDetails(response.data);
        setMintStatus("completed");
        setMintProgressPercent(100);
        // Refresh token list
        loadRegisteredTokens();
      } else {
        throw new Error("Failed to register asset.");
      }
    } catch (err) {
      console.error(err);
      setMintStatus("error");
      const errorMsg = err.response?.data?.detail || err.message || "An unexpected error occurred.";
      setMintDetails({ error: errorMsg });
    }
  };

  // Creator Studio: List asset for lease
  const handleListAsset = async (e) => {
    e.preventDefault();
    if (!listingTokenId || !leasePrice || !leaseDuration) {
      alert("Please enter all listing parameters");
      return;
    }

    if (!signer) {
      alert("Please connect your wallet (MetaMask) first to sign this transaction.");
      return;
    }

    setMarketplaceActionStatus("listing");
    try {
      const priceInWei = ethers.parseEther(leasePrice);
      const durationInBlocks = Number(leaseDuration);

      // Call smart contract
      const tx = await marketplaceContract.listForLease(listingTokenId, priceInWei, durationInBlocks);
      setMarketplaceActionStatus("pending");
      await tx.wait();
      
      setMarketplaceActionStatus("success");
      alert("Media Token successfully listed for lease!");
      
      // Clean form and reload
      setListingTokenId("");
      setLeasePrice("");
      setLeaseDuration("");
      loadRegisteredTokens();
    } catch (err) {
      console.error(err);
      setMarketplaceActionStatus("error");
      alert(`Listing failed: ${err.reason || err.message}`);
    }
  };

  // Grid Action: Purchase Lease
  const purchaseLease = async (token) => {
    if (!signer) {
      alert("Please connect your wallet (MetaMask) to purchase a lease.");
      return;
    }

    try {
      const priceInWei = ethers.parseEther(token.price);
      
      const tx = await marketplaceContract.purchaseLease(token.tokenId, {
        value: priceInWei
      });
      
      await tx.wait();
      alert(`Successfully leased copyright token #${token.tokenId}!`);
      loadRegisteredTokens();
    } catch (err) {
      console.error(err);
      alert(`Failed to purchase lease: ${err.reason || err.message}`);
    }
  };

  // Infringement Checker: Select suspected file
  const handleCheckerFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setCheckerFile(file);
      setCheckerPreviewUrl(URL.createObjectURL(file));
      setCheckerStatus("");
      setCheckerResult(null);
    }
  };

  // Infringement Checker: Send to backend for comparison
  const checkInfringement = async (e) => {
    e.preventDefault();
    if (!checkerFile) return;

    setCheckerStatus("checking");
    const formData = new FormData();
    formData.append("file", checkerFile);

    try {
      // 1. Get pHash from Backend
      const response = await axios.post(`${BACKEND_URL}/compute-hash`, formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      const queryHash = response.data.phash;

      // 2. Query Smart Contract view function findMatch(pHash, threshold)
      const [matchedTokenId, owner, distance, uri] = await registryContract.findMatch(queryHash, matchThreshold);
      
      const matchedTokenIdNum = Number(matchedTokenId);
      if (matchedTokenIdNum !== 0) {
        setCheckerResult({
          matchFound: true,
          conflictOwner: owner,
          tokenId: matchedTokenIdNum,
          distance: Number(distance),
          pHash: queryHash,
          originalImage: uri
        });
      } else {
        setCheckerResult({
          matchFound: false,
          pHash: queryHash,
          distance: Number(distance)
        });
      }
      setCheckerStatus("checked");
    } catch (err) {
      console.error(err);
      setCheckerStatus("error");
      alert(`Checker failed: ${err.response?.data?.detail || err.message}`);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-slate-100 font-sans">
      
      {/* Dynamic Header */}
      <header className="sticky top-0 z-50 backdrop-blur-md bg-slate-950/70 border-b border-slate-800/80">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-tr from-indigo-500 to-violet-600 rounded-xl shadow-lg shadow-indigo-500/20">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-200 to-indigo-400 bg-clip-text text-transparent">
                Aegis Copyright Engine
              </h1>
              <p className="text-xs text-slate-400">Decentralized Perceptual Rights & Licensing Marketplace</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            {account ? (
              <div className="flex items-center gap-2 px-4 py-2 bg-slate-900/90 border border-slate-700/60 rounded-full shadow-inner">
                <span className="w-2 h-2 bg-green-400 rounded-full animate-ping"></span>
                <span className="text-xs font-mono text-slate-300">
                  {account.substring(0, 6)}...{account.substring(38)}
                </span>
              </div>
            ) : (
              <button 
                onClick={connectWallet}
                disabled={isConnecting}
                className="px-5 py-2 text-sm font-semibold bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 rounded-full shadow-md shadow-indigo-600/10 hover:shadow-indigo-500/30 active:scale-95 transition duration-150 flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isConnecting ? "Connecting..." : "Connect MetaMask"}
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {networkError && (
          <div className="mb-6 p-4 bg-red-950/30 border border-red-800/50 rounded-xl flex items-start gap-3 text-red-300 text-sm">
            <AlertTriangle className="w-5 h-5 shrink-0 text-red-400 mt-0.5" />
            <div>
              <span className="font-bold">Blockchain Node Error:</span> {networkError}
            </div>
          </div>
        )}

        {/* Tab Selection */}
        <div className="flex border-b border-slate-800 mb-8 gap-4">
          <button
            onClick={() => setActiveTab("creator")}
            className={`pb-4 px-2 font-semibold text-sm transition duration-150 flex items-center gap-2 relative ${
              activeTab === "creator" ? "text-indigo-400 font-bold" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <FolderPlus className="w-4 h-4" />
            Creator Studio & Marketplace
            {activeTab === "creator" && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500 rounded-full"></div>
            )}
          </button>
          
          <button
            onClick={() => setActiveTab("checker")}
            className={`pb-4 px-2 font-semibold text-sm transition duration-150 flex items-center gap-2 relative ${
              activeTab === "checker" ? "text-indigo-400 font-bold" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Search className="w-4 h-4" />
            Infringement Checker
            {activeTab === "checker" && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500 rounded-full"></div>
            )}
          </button>
        </div>

        {/* TAB 1: CREATOR STUDIO */}
        {activeTab === "creator" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* Mint Form Card */}
            <div className="lg:col-span-2 space-y-8">
              
              <div className="backdrop-blur-md bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 shadow-xl">
                <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2 mb-4">
                  <Cpu className="w-5 h-5 text-indigo-400" /> Register New Media Copyright
                </h2>
                <p className="text-sm text-slate-400 mb-6">
                  Upload your unique media file. The engine will extract a robust visual perceptual fingerprint (pHash), upload the asset to the storage network, and mint your ERC-721 ownership NFT.
                </p>

                <form onSubmit={handleRegisterCopyright} className="space-y-6">
                  {/* File Upload Zone */}
                  <div className="border-2 border-dashed border-slate-800 hover:border-slate-700 rounded-xl p-8 text-center bg-slate-950/40 cursor-pointer transition relative group">
                    <input 
                      type="file" 
                      accept="image/*" 
                      onChange={handleFileChange}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    {previewUrl ? (
                      <div className="space-y-4">
                        <img 
                          src={previewUrl} 
                          alt="Upload preview" 
                          className="max-h-60 mx-auto rounded-lg object-contain border border-slate-800 shadow"
                        />
                        <div className="text-xs text-indigo-400 font-medium">Click or drag another image to replace</div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="mx-auto w-12 h-12 bg-slate-900 border border-slate-800 rounded-full flex items-center justify-between justify-center p-3 text-slate-400 group-hover:text-indigo-400 group-hover:border-indigo-400/50 transition">
                          <Upload className="w-6 h-6 mx-auto" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-300">Choose file or drag here</p>
                          <p className="text-xs text-slate-500 mt-1">PNG, JPG, WEBP, or GIF up to 10MB</p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Creator Wallet override */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Creator Wallet Address</label>
                      <input 
                        type="text"
                        value={creatorAddressInput}
                        onChange={(e) => setCreatorAddressInput(e.target.value)}
                        placeholder="0x..."
                        className="w-full bg-slate-950/80 border border-slate-800 focus:border-indigo-500 focus:outline-none rounded-xl px-4 py-3 text-sm font-mono text-slate-300 transition"
                      />
                    </div>
                    <div className="flex items-end">
                      <div className="text-xs text-slate-500 mb-2.5">
                        * Mints ownership to this recipient. Defaults to your connected MetaMask account or local pre-funded deployer.
                      </div>
                    </div>
                  </div>

                  {/* Submit button / Progress */}
                  <div className="pt-2">
                    {mintStatus ? (
                      <div className="space-y-4">
                        <div className="flex justify-between text-xs font-semibold text-indigo-400">
                          <span>
                            {mintStatus === "hashing" && "⚙️ Extracting perceptual fingerprint..."}
                            {mintStatus === "minting" && "🔗 Broadcasting to Ethereum Blockchain..."}
                            {mintStatus === "completed" && "🎉 Copyright Registered Successfully!"}
                            {mintStatus === "error" && "❌ Registration Failed"}
                          </span>
                          <span>{mintProgressPercent}%</span>
                        </div>
                        <div className="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden">
                          <div 
                            className={`h-full transition-all duration-300 ${
                              mintStatus === "error" ? "bg-red-500" : "bg-gradient-to-r from-indigo-500 to-violet-500"
                            }`} 
                            style={{ width: `${mintProgressPercent}%` }}
                          ></div>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="submit"
                        disabled={!selectedFile}
                        className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold rounded-xl shadow-md hover:shadow-indigo-500/20 active:scale-[0.99] transition duration-150 cursor-pointer text-center"
                      >
                        Register Copyright & Mint NFT
                      </button>
                    )}
                  </div>
                </form>

                {/* Minting Results Output */}
                {mintDetails && mintStatus === "completed" && (
                  <div className="mt-8 p-5 bg-green-950/20 border border-green-800/40 rounded-xl space-y-4 text-sm">
                    <div className="flex items-center gap-2 text-green-400 font-bold text-base">
                      <CheckCircle className="w-5 h-5" /> Copyright NFT Minted!
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono mt-2">
                      <div className="space-y-2">
                        <div>
                          <div className="text-slate-400 font-semibold mb-0.5">Asset Token ID:</div>
                          <div className="text-green-300 font-bold">#{mintDetails.token_id}</div>
                        </div>
                        <div>
                          <div className="text-slate-400 font-semibold mb-0.5">Perceptual Hash:</div>
                          <div className="text-slate-200">{mintDetails.phash}</div>
                        </div>
                        <div>
                          <div className="text-slate-400 font-semibold mb-0.5">Owner Address:</div>
                          <div className="text-slate-200">{mintDetails.owner}</div>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div>
                          <div className="text-slate-400 font-semibold mb-0.5">Transaction Hash:</div>
                          <div className="text-indigo-400 text-ellipsis overflow-hidden select-all max-w-xs">{mintDetails.tx_hash}</div>
                        </div>
                        <div>
                          <div className="text-slate-400 font-semibold mb-0.5">Mock IPFS URI:</div>
                          <a 
                            href={mintDetails.ipfs_uri} 
                            target="_blank" 
                            rel="noreferrer"
                            className="text-indigo-400 hover:underline flex items-center gap-1 mt-0.5"
                          >
                            <LinkIcon className="w-3.5 h-3.5" /> View IPFS Storage
                          </a>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {mintStatus === "error" && (
                  <div className="mt-8 p-5 bg-red-950/20 border border-red-800/40 rounded-xl space-y-2 text-sm text-red-300">
                    <div className="flex items-center gap-2 font-bold text-red-400">
                      <AlertTriangle className="w-5 h-5" /> Registration Failed
                    </div>
                    <p>{mintDetails?.error}</p>
                  </div>
                )}
              </div>
            </div>

            {/* List for Leasing Marketplace Widget */}
            <div className="space-y-8">
              <div className="backdrop-blur-md bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 shadow-xl">
                <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2 mb-4">
                  <Coins className="w-5 h-5 text-indigo-400" /> List Copyright for Lease
                </h2>
                <p className="text-sm text-slate-400 mb-6">
                  List your registered copyright for commercial leasing. Define your price in Ether and lease duration in blocks.
                </p>

                <form onSubmit={handleListAsset} className="space-y-5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Token ID</label>
                    <input 
                      type="number"
                      required
                      value={listingTokenId}
                      onChange={(e) => setListingTokenId(e.target.value)}
                      placeholder="e.g. 1"
                      className="w-full bg-slate-950/80 border border-slate-800 focus:border-indigo-500 focus:outline-none rounded-xl px-4 py-3 text-sm text-slate-300 transition"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Lease Price (ETH)</label>
                    <input 
                      type="text"
                      required
                      value={leasePrice}
                      onChange={(e) => setLeasePrice(e.target.value)}
                      placeholder="e.g. 0.05"
                      className="w-full bg-slate-950/80 border border-slate-800 focus:border-indigo-500 focus:outline-none rounded-xl px-4 py-3 text-sm text-slate-300 transition"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Lease Duration (Blocks)</label>
                    <input 
                      type="number"
                      required
                      value={leaseDuration}
                      onChange={(e) => setLeaseDuration(e.target.value)}
                      placeholder="e.g. 1000 (approx. 4 hours)"
                      className="w-full bg-slate-950/80 border border-slate-800 focus:border-indigo-500 focus:outline-none rounded-xl px-4 py-3 text-sm text-slate-300 transition"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={marketplaceActionStatus === "listing" || marketplaceActionStatus === "pending"}
                    className="w-full py-3 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:opacity-50 text-white font-bold rounded-xl shadow-md transition duration-150 cursor-pointer flex items-center justify-center gap-2"
                  >
                    {marketplaceActionStatus === "listing" && "Confirming in Wallet..."}
                    {marketplaceActionStatus === "pending" && "Pending Blockchain Confirmation..."}
                    {!(marketplaceActionStatus === "listing" || marketplaceActionStatus === "pending") && "List Asset for Lease"}
                  </button>
                </form>
              </div>
            </div>

            {/* Registered Tokens Gallery */}
            <div className="lg:col-span-3 mt-8">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                    🛡️ Registered Intellectual Property Database
                  </h3>
                  <p className="text-sm text-slate-400">Verifiable visual assets stored on the blockchain.</p>
                </div>
                <button 
                  onClick={loadRegisteredTokens}
                  className="px-4 py-2 text-xs font-semibold border border-slate-800 hover:border-slate-700 bg-slate-900/60 rounded-lg hover:bg-slate-900 transition active:scale-95 cursor-pointer"
                >
                  Reload DB
                </button>
              </div>

              {isLoadingTokens ? (
                <div className="text-center py-12 bg-slate-900/20 border border-slate-850 rounded-2xl">
                  <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                  <p className="text-sm text-slate-400">Fetching copyright contracts state...</p>
                </div>
              ) : tokens.length === 0 ? (
                <div className="text-center py-16 bg-slate-900/20 border border-slate-850 rounded-2xl space-y-2">
                  <FileCheck className="w-10 h-10 text-slate-600 mx-auto" />
                  <h4 className="text-slate-300 font-bold">No Copyrights Registered Yet</h4>
                  <p className="text-sm text-slate-500 max-w-sm mx-auto">Use the panel above to upload and mint the first media copyright token on-chain!</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {tokens.map((token) => {
                    const isCurrentUserOwner = token.owner.toLowerCase() === account.toLowerCase();
                    return (
                      <div 
                        key={token.tokenId} 
                        className="backdrop-blur-md bg-slate-900/40 border border-slate-800/80 hover:border-indigo-500/45 rounded-2xl overflow-hidden shadow transition-all duration-300 flex flex-col group hover:shadow-indigo-500/5"
                      >
                        {/* Image Frame */}
                        <div className="h-48 bg-slate-950 flex items-center justify-between justify-center relative overflow-hidden">
                          <img 
                            src={token.metadataURI} 
                            alt={`Token ${token.tokenId}`}
                            className="h-full w-full object-cover group-hover:scale-[1.03] transition duration-300"
                            onError={(e) => {
                              // If server falls back / file doesn't load
                              e.target.src = "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500&auto=format&fit=crop";
                            }}
                          />
                          <div className="absolute top-3 left-3 px-3 py-1 bg-slate-950/80 backdrop-blur-md border border-slate-800 text-indigo-400 font-bold font-mono text-xs rounded-full shadow">
                            ID #{token.tokenId}
                          </div>

                          {token.isListed && (
                            <div className="absolute top-3 right-3 px-3 py-1 bg-gradient-to-r from-emerald-600 to-teal-600 border border-emerald-500 text-white font-semibold text-xs rounded-full shadow flex items-center gap-1.5">
                              <Coins className="w-3.5 h-3.5" /> For Lease
                            </div>
                          )}
                        </div>

                        {/* Details */}
                        <div className="p-5 flex-1 flex flex-col justify-between">
                          <div className="space-y-3">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-slate-400 font-medium">Owner</span>
                              <span className="text-slate-200 font-mono text-[10px] bg-slate-950 px-2 py-0.5 border border-slate-850 rounded">
                                {isCurrentUserOwner ? "You" : `${token.owner.substring(0, 6)}...${token.owner.substring(38)}`}
                              </span>
                            </div>

                            <div className="flex items-center justify-between text-xs">
                              <span className="text-slate-400 font-medium">pHash Fingerprint</span>
                              <span className="text-slate-300 font-mono text-[10px]">{token.pHash}</span>
                            </div>

                            {token.isListed && (
                              <div className="p-3 bg-slate-950/50 border border-slate-850 rounded-xl flex items-center justify-between text-xs">
                                <span className="text-slate-400">Lease Terms</span>
                                <span className="font-semibold text-indigo-400">
                                  {token.price} ETH <span className="text-slate-500 font-normal">/ {token.duration} blks</span>
                                </span>
                              </div>
                            )}

                            {/* Active license banner */}
                            {token.hasActiveLicense && (
                              <div className="p-2.5 bg-emerald-950/20 border border-emerald-800/40 rounded-xl flex items-center gap-2 text-xs text-emerald-400">
                                <Clock className="w-4 h-4 shrink-0" />
                                <span>Lease Active (Expires block #{token.licensedUntilBlock})</span>
                              </div>
                            )}
                          </div>

                          {/* Action Button */}
                          <div className="mt-5 pt-3 border-t border-slate-850/60">
                            {token.isListed ? (
                              isCurrentUserOwner ? (
                                <div className="text-center text-xs text-slate-500 py-2 bg-slate-950 border border-slate-850 rounded-xl">
                                  Your lease listing
                                </div>
                              ) : token.hasActiveLicense ? (
                                <div className="text-center text-xs font-semibold text-emerald-400 py-2 bg-emerald-950/10 border border-emerald-800/30 rounded-xl">
                                  Lease Purchased
                                </div>
                              ) : (
                                <button
                                  onClick={() => purchaseLease(token)}
                                  className="w-full py-2 bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white font-bold text-xs rounded-xl border border-indigo-500/40 transition duration-150 cursor-pointer flex items-center justify-center gap-1.5"
                                >
                                  <Coins className="w-3.5 h-3.5" /> Purchase Lease ({token.price} ETH)
                                </button>
                              )
                            ) : (
                              <div className="text-center text-xs text-slate-500 py-2 bg-slate-950/30 border border-slate-900 rounded-xl flex items-center justify-center gap-1">
                                <Lock className="w-3 h-3 text-slate-600" /> Private Intellectual Property
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        )}

        {/* TAB 2: INFRINGEMENT CHECKER */}
        {activeTab === "checker" && (
          <div className="max-w-3xl mx-auto space-y-8">
            <div className="backdrop-blur-md bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 shadow-xl">
              <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2 mb-4">
                <Search className="w-5 h-5 text-indigo-400" /> Advanced Visual Infringement Audit
              </h2>
              <p className="text-sm text-slate-400 mb-6">
                Upload a suspected copyright infringing media asset. Aegis will compute its perceptual hash (pHash) and cross-reference the on-chain registry database using custom Hamming bit distance calculations.
              </p>

              <form onSubmit={checkInfringement} className="space-y-6">
                
                {/* File Drop zone */}
                <div className="border-2 border-dashed border-slate-800 hover:border-slate-700 rounded-xl p-8 text-center bg-slate-950/40 cursor-pointer transition relative group">
                  <input 
                    type="file" 
                    accept="image/*" 
                    onChange={handleCheckerFileChange}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  {checkerPreviewUrl ? (
                    <div className="space-y-4">
                      <img 
                        src={checkerPreviewUrl} 
                        alt="Checker preview" 
                        className="max-h-60 mx-auto rounded-lg object-contain border border-slate-800 shadow"
                      />
                      <div className="text-xs text-indigo-400 font-medium">Click or drag another image to replace</div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="mx-auto w-12 h-12 bg-slate-900 border border-slate-800 rounded-full flex items-center justify-center p-3 text-slate-400 group-hover:text-indigo-400 group-hover:border-indigo-400/50 transition">
                        <Upload className="w-6 h-6 mx-auto" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-300">Choose file or drag here</p>
                        <p className="text-xs text-slate-500 mt-1">Upload suspected image</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Threshold Slider (Hamming Distance) */}
                <div className="p-4 bg-slate-950/60 border border-slate-850 rounded-xl space-y-3">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400 font-bold uppercase tracking-wider">Hamming Bit Distance Threshold</span>
                    <span className="text-indigo-400 font-bold font-mono text-sm">{matchThreshold} bits</span>
                  </div>
                  <input 
                    type="range" 
                    min="0" 
                    max="20"
                    value={matchThreshold}
                    onChange={(e) => setMatchThreshold(Number(e.target.value))}
                    className="w-full accent-indigo-500 h-1.5 bg-slate-900 rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                    <span>0 (Exact Match)</span>
                    <span>10 (Recommended)</span>
                    <span>20 (Very Loose)</span>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={!checkerFile || checkerStatus === "checking"}
                  className="w-full py-3.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:opacity-50 text-white font-bold rounded-xl shadow-md transition duration-150 cursor-pointer flex items-center justify-center gap-2"
                >
                  {checkerStatus === "checking" ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Running Audit...
                    </>
                  ) : (
                    <>
                      <Search className="w-4 h-4" /> Audit Suspected Infringement
                    </>
                  )}
                </button>

              </form>

              {/* Checker Results */}
              {checkerStatus === "checked" && checkerResult && (
                <div className="mt-8 space-y-6">
                  <div className="p-4 bg-slate-950 border border-slate-850 rounded-xl text-xs space-y-2 font-mono">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Suspect File Fingerprint (pHash):</span>
                      <span className="text-slate-200 font-bold">{checkerResult.pHash}</span>
                    </div>
                  </div>

                  {checkerResult.matchFound ? (
                    <div className="p-6 bg-red-950/20 border border-red-800/50 rounded-2xl space-y-4">
                      <div className="flex items-center gap-3 text-red-400 font-bold text-lg">
                        <AlertTriangle className="w-6 h-6 animate-pulse" /> 
                        <span>Copyright Conflict Detected - Registered by Entity {checkerResult.conflictOwner.substring(0, 6)}...{checkerResult.conflictOwner.substring(38)}</span>
                      </div>
                      
                      <p className="text-sm text-red-300/80">
                        This file is visually similar to a previously registered copyright token on-chain. The computed Hamming distance of <span className="font-bold text-white">{checkerResult.distance} bits</span> is within your threshold of {matchThreshold} bits.
                      </p>

                      <div className="pt-4 border-t border-red-900/30 flex flex-col md:flex-row gap-4 items-center">
                        {/* Original image preview */}
                        {checkerResult.originalImage && (
                          <div className="w-32 h-24 rounded-lg bg-slate-950 overflow-hidden shrink-0 border border-red-950">
                            <img 
                              src={checkerResult.originalImage} 
                              alt="Original asset"
                              className="h-full w-full object-cover"
                              onError={(e) => {
                                e.target.src = "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500&auto=format&fit=crop";
                              }}
                            />
                          </div>
                        )}
                        <div className="space-y-1.5 text-xs text-red-300 font-mono w-full">
                          <div className="flex justify-between">
                            <span>Conflict Token:</span>
                            <span className="text-white font-bold"># {checkerResult.tokenId}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Hamming Distance:</span>
                            <span className="text-white font-bold">{checkerResult.distance} bits diff</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Owner Profile:</span>
                            <span className="text-indigo-400 select-all font-bold">{checkerResult.conflictOwner}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-6 bg-green-950/20 border border-green-800/50 rounded-2xl space-y-3">
                      <div className="flex items-center gap-3 text-green-400 font-bold text-lg">
                        <CheckCircle className="w-6 h-6" /> 
                        <span>No Visual Match Found</span>
                      </div>
                      <p className="text-sm text-green-300/80">
                        A check of the smart contract registry shows no visually conflicting assets matching this file within a {matchThreshold}-bit Hamming distance. The media is safe to register.
                      </p>
                    </div>
                  )}

                </div>
              )}

            </div>
          </div>
        )}

      </main>

      <footer className="mt-20 py-8 bg-slate-950/80 border-t border-slate-900 text-center text-xs text-slate-500">
        <p>© 2026 Aegis Copyright Engine. Built on Ethereum & Perceptual Visual Hashing.</p>
      </footer>
    </div>
  );
}
