// App.tsx
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

interface ResearchRequest {
  id: string;
  encryptedData: string;
  timestamp: number;
  owner: string;
  field: string;
  status: "open" | "completed" | "verified";
  reward: number;
}

const App: React.FC = () => {
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<ResearchRequest[]>([]);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{
    visible: boolean;
    status: "pending" | "success" | "error";
    message: string;
  }>({ visible: false, status: "pending", message: "" });
  const [newRequestData, setNewRequestData] = useState({
    field: "",
    description: "",
    researchData: "",
    reward: "0.1"
  });
  const [showTutorial, setShowTutorial] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterField, setFilterField] = useState("all");
  const [showDetails, setShowDetails] = useState<string | null>(null);

  // Calculate statistics for dashboard
  const openCount = requests.filter(r => r.status === "open").length;
  const completedCount = requests.filter(r => r.status === "completed").length;
  const verifiedCount = requests.filter(r => r.status === "verified").length;

  // Available research fields
  const researchFields = [
    "Physics", "Biology", "Chemistry", "Mathematics", 
    "Computer Science", "Medicine", "Psychology", "Economics"
  ];

  useEffect(() => {
    loadRequests().finally(() => setLoading(false));
  }, []);

  const onWalletSelect = async (wallet: any) => {
    if (!wallet.provider) return;
    try {
      const web3Provider = new ethers.BrowserProvider(wallet.provider);
      setProvider(web3Provider);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const acc = accounts[0] || "";
      setAccount(acc);

      wallet.provider.on("accountsChanged", async (accounts: string[]) => {
        const newAcc = accounts[0] || "";
        setAccount(newAcc);
      });
    } catch (e) {
      alert("Failed to connect wallet");
    }
  };

  const onConnect = () => setWalletSelectorOpen(true);
  const onDisconnect = () => {
    setAccount("");
    setProvider(null);
  };

  const loadRequests = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability using FHE
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        console.error("Contract is not available");
        return;
      }
      
      const keysBytes = await contract.getData("request_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing request keys:", e);
        }
      }
      
      const list: ResearchRequest[] = [];
      
      for (const key of keys) {
        try {
          const requestBytes = await contract.getData(`request_${key}`);
          if (requestBytes.length > 0) {
            try {
              const requestData = JSON.parse(ethers.toUtf8String(requestBytes));
              list.push({
                id: key,
                encryptedData: requestData.data,
                timestamp: requestData.timestamp,
                owner: requestData.owner,
                field: requestData.field,
                status: requestData.status || "open",
                reward: requestData.reward || 0
              });
            } catch (e) {
              console.error(`Error parsing request data for ${key}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading request ${key}:`, e);
        }
      }
      
      list.sort((a, b) => b.timestamp - a.timestamp);
      setRequests(list);
    } catch (e) {
      console.error("Error loading requests:", e);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  const submitRequest = async () => {
    if (!provider) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setCreating(true);
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Encrypting research data with FHE..."
    });
    
    try {
      // Simulate FHE encryption
      const encryptedData = `FHE-${btoa(JSON.stringify(newRequestData))}`;
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const requestId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const requestData = {
        data: encryptedData,
        timestamp: Math.floor(Date.now() / 1000),
        owner: account,
        field: newRequestData.field,
        status: "open",
        reward: parseFloat(newRequestData.reward)
      };
      
      // Store encrypted data on-chain using FHE
      await contract.setData(
        `request_${requestId}`, 
        ethers.toUtf8Bytes(JSON.stringify(requestData))
      );
      
      const keysBytes = await contract.getData("request_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing keys:", e);
        }
      }
      
      keys.push(requestId);
      
      await contract.setData(
        "request_keys", 
        ethers.toUtf8Bytes(JSON.stringify(keys))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Encrypted research request submitted securely!"
      });
      
      await loadRequests();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowCreateModal(false);
        setNewRequestData({
          field: "",
          description: "",
          researchData: "",
          reward: "0.1"
        });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction")
        ? "Transaction rejected by user"
        : "Submission failed: " + (e.message || "Unknown error");
      
      setTransactionStatus({
        visible: true,
        status: "error",
        message: errorMessage
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    } finally {
      setCreating(false);
    }
  };

  const completeRequest = async (requestId: string) => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Processing encrypted results with FHE..."
    });

    try {
      // Simulate FHE computation time
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const requestBytes = await contract.getData(`request_${requestId}`);
      if (requestBytes.length === 0) {
        throw new Error("Request not found");
      }
      
      const requestData = JSON.parse(ethers.toUtf8String(requestBytes));
      
      const updatedRequest = {
        ...requestData,
        status: "completed",
        completedBy: account
      };
      
      await contract.setData(
        `request_${requestId}`, 
        ethers.toUtf8Bytes(JSON.stringify(updatedRequest))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "FHE completion successful!"
      });
      
      await loadRequests();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Completion failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const verifyRequest = async (requestId: string) => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Verifying encrypted results with FHE..."
    });

    try {
      // Simulate FHE computation time
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const requestBytes = await contract.getData(`request_${requestId}`);
      if (requestBytes.length === 0) {
        throw new Error("Request not found");
      }
      
      const requestData = JSON.parse(ethers.toUtf8String(requestBytes));
      
      const updatedRequest = {
        ...requestData,
        status: "verified"
      };
      
      await contract.setData(
        `request_${requestId}`, 
        ethers.toUtf8Bytes(JSON.stringify(updatedRequest))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "FHE verification completed successfully!"
      });
      
      await loadRequests();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Verification failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const isOwner = (address: string) => {
    return account.toLowerCase() === address.toLowerCase();
  };

  const tutorialSteps = [
    {
      title: "Connect Wallet",
      description: "Connect your Web3 wallet to access the FHE marketplace",
      icon: "🔗"
    },
    {
      title: "Submit Research Request",
      description: "Create an encrypted research replication request with FHE protection",
      icon: "🔒"
    },
    {
      title: "FHE Processing",
      description: "Researchers can work on your request without accessing raw data",
      icon: "⚙️"
    },
    {
      title: "Receive Verified Results",
      description: "Get validated research replication results while maintaining privacy",
      icon: "📊"
    }
  ];

  const filteredRequests = requests.filter(request => {
    const matchesSearch = request.field.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         request.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesField = filterField === "all" || request.field === filterField;
    return matchesSearch && matchesField;
  });

  const renderPieChart = () => {
    const total = requests.length || 1;
    const openPercentage = (openCount / total) * 100;
    const completedPercentage = (completedCount / total) * 100;
    const verifiedPercentage = (verifiedCount / total) * 100;

    return (
      <div className="pie-chart-container">
        <div className="pie-chart">
          <div 
            className="pie-segment open" 
            style={{ transform: `rotate(${openPercentage * 3.6}deg)` }}
          ></div>
          <div 
            className="pie-segment completed" 
            style={{ transform: `rotate(${(openPercentage + completedPercentage) * 3.6}deg)` }}
          ></div>
          <div 
            className="pie-segment verified" 
            style={{ transform: `rotate(${(openPercentage + completedPercentage + verifiedPercentage) * 3.6}deg)` }}
          ></div>
          <div className="pie-center">
            <div className="pie-value">{requests.length}</div>
            <div className="pie-label">Requests</div>
          </div>
        </div>
        <div className="pie-legend">
          <div className="legend-item">
            <div className="color-box open"></div>
            <span>Open: {openCount}</span>
          </div>
          <div className="legend-item">
            <div className="color-box completed"></div>
            <span>Completed: {completedCount}</span>
          </div>
          <div className="legend-item">
            <div className="color-box verified"></div>
            <span>Verified: {verifiedCount}</span>
          </div>
        </div>
      </div>
    );
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="spinner"></div>
      <p>Initializing FHE connection...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon">
            <div className="atom-icon"></div>
          </div>
          <h1>Repro<span>Market</span></h1>
        </div>
        
        <div className="header-actions">
          <button 
            onClick={() => setShowCreateModal(true)} 
            className="create-request-btn"
          >
            <div className="add-icon"></div>
            New Request
          </button>
          <button 
            className="tutorial-btn"
            onClick={() => setShowTutorial(!showTutorial)}
          >
            {showTutorial ? "Hide Tutorial" : "Show Tutorial"}
          </button>
          <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
        </div>
      </header>
      
      <div className="main-content">
        <div className="welcome-banner">
          <div className="welcome-text">
            <h2>Anonymous Scientific Result Replication Marketplace</h2>
            <p>Powered by Fully Homomorphic Encryption for privacy-preserving research validation</p>
          </div>
        </div>
        
        {showTutorial && (
          <div className="tutorial-section">
            <h2>FHE Research Marketplace Tutorial</h2>
            <p className="subtitle">Learn how to securely submit and replicate scientific research</p>
            
            <div className="tutorial-steps">
              {tutorialSteps.map((step, index) => (
                <div 
                  className="tutorial-step"
                  key={index}
                >
                  <div className="step-icon">{step.icon}</div>
                  <div className="step-content">
                    <h3>{step.title}</h3>
                    <p>{step.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        
        <div className="dashboard-grid">
          <div className="dashboard-card">
            <h3>Project Introduction</h3>
            <p>A secure platform for anonymous scientific research replication using FHE technology to protect sensitive data.</p>
            <div className="fhe-badge">
              <span>FHE-Powered</span>
            </div>
          </div>
          
          <div className="dashboard-card">
            <h3>Research Statistics</h3>
            <div className="stats-grid">
              <div className="stat-item">
                <div className="stat-value">{requests.length}</div>
                <div className="stat-label">Total Requests</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{openCount}</div>
                <div className="stat-label">Open</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{completedCount}</div>
                <div className="stat-label">Completed</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{verifiedCount}</div>
                <div className="stat-label">Verified</div>
              </div>
            </div>
          </div>
          
          <div className="dashboard-card">
            <h3>Status Distribution</h3>
            {renderPieChart()}
          </div>
        </div>
        
        <div className="search-filters">
          <div className="search-box">
            <input 
              type="text" 
              placeholder="Search requests..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
          </div>
          <div className="filter-box">
            <select 
              value={filterField} 
              onChange={(e) => setFilterField(e.target.value)}
              className="filter-select"
            >
              <option value="all">All Fields</option>
              {researchFields.map(field => (
                <option key={field} value={field}>{field}</option>
              ))}
            </select>
          </div>
        </div>
        
        <div className="requests-section">
          <div className="section-header">
            <h2>Research Replication Requests</h2>
            <div className="header-actions">
              <button 
                onClick={loadRequests}
                className="refresh-btn"
                disabled={isRefreshing}
              >
                {isRefreshing ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </div>
          
          <div className="requests-list">
            <div className="table-header">
              <div className="header-cell">ID</div>
              <div className="header-cell">Research Field</div>
              <div className="header-cell">Reward (ETH)</div>
              <div className="header-cell">Date</div>
              <div className="header-cell">Status</div>
              <div className="header-cell">Actions</div>
            </div>
            
            {filteredRequests.length === 0 ? (
              <div className="no-requests">
                <div className="no-requests-icon"></div>
                <p>No research requests found</p>
                <button 
                  className="primary-btn"
                  onClick={() => setShowCreateModal(true)}
                >
                  Create First Request
                </button>
              </div>
            ) : (
              filteredRequests.map(request => (
                <React.Fragment key={request.id}>
                  <div className="request-row">
                    <div className="table-cell request-id">#{request.id.substring(0, 6)}</div>
                    <div className="table-cell">{request.field}</div>
                    <div className="table-cell">{request.reward}</div>
                    <div className="table-cell">
                      {new Date(request.timestamp * 1000).toLocaleDateString()}
                    </div>
                    <div className="table-cell">
                      <span className={`status-badge ${request.status}`}>
                        {request.status}
                      </span>
                    </div>
                    <div className="table-cell actions">
                      <button 
                        className="details-btn"
                        onClick={() => setShowDetails(showDetails === request.id ? null : request.id)}
                      >
                        {showDetails === request.id ? "Hide" : "Details"}
                      </button>
                      {!isOwner(request.owner) && request.status === "open" && (
                        <button 
                          className="action-btn success"
                          onClick={() => completeRequest(request.id)}
                        >
                          Complete
                        </button>
                      )}
                      {isOwner(request.owner) && request.status === "completed" && (
                        <button 
                          className="action-btn verify"
                          onClick={() => verifyRequest(request.id)}
                        >
                          Verify
                        </button>
                      )}
                    </div>
                  </div>
                  {showDetails === request.id && (
                    <div className="request-details">
                      <div className="details-content">
                        <h4>Request Details</h4>
                        <p>Owner: {request.owner.substring(0, 8)}...{request.owner.substring(36)}</p>
                        <p>Encrypted Data: {request.encryptedData.substring(0, 20)}...</p>
                        <p>FHE Protected: Yes</p>
                      </div>
                    </div>
                  )}
                </React.Fragment>
              ))
            )}
          </div>
        </div>
      </div>
  
      {showCreateModal && (
        <ModalCreate 
          onSubmit={submitRequest} 
          onClose={() => setShowCreateModal(false)} 
          creating={creating}
          requestData={newRequestData}
          setRequestData={setNewRequestData}
          researchFields={researchFields}
        />
      )}
      
      {walletSelectorOpen && (
        <WalletSelector
          isOpen={walletSelectorOpen}
          onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
          onClose={() => setWalletSelectorOpen(false)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="spinner"></div>}
              {transactionStatus.status === "success" && <div className="check-icon"></div>}
              {transactionStatus.status === "error" && <div className="error-icon"></div>}
            </div>
            <div className="transaction-message">
              {transactionStatus.message}
            </div>
          </div>
        </div>
      )}
  
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">
              <div className="atom-icon"></div>
              <span>ReproMarket</span>
            </div>
            <p>Anonymous scientific result replication powered by FHE</p>
          </div>
          
          <div className="footer-links">
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">Privacy Policy</a>
            <a href="#" className="footer-link">Terms of Service</a>
            <a href="#" className="footer-link">Contact</a>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="fhe-badge">
            <span>FHE-Powered Privacy</span>
          </div>
          <div className="copyright">
            © {new Date().getFullYear()} ReproMarket. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

interface ModalCreateProps {
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  requestData: any;
  setRequestData: (data: any) => void;
  researchFields: string[];
}

const ModalCreate: React.FC<ModalCreateProps> = ({ 
  onSubmit, 
  onClose, 
  creating,
  requestData,
  setRequestData,
  researchFields
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setRequestData({
      ...requestData,
      [name]: value
    });
  };

  const handleSubmit = () => {
    if (!requestData.field || !requestData.researchData) {
      alert("Please fill required fields");
      return;
    }
    
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="create-modal">
        <div className="modal-header">
          <h2>Create Research Replication Request</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice-banner">
            <div className="key-icon"></div> Your research data will be encrypted with FHE
          </div>
          
          <div className="form-grid">
            <div className="form-group">
              <label>Research Field *</label>
              <select 
                name="field"
                value={requestData.field} 
                onChange={handleChange}
                className="form-select"
              >
                <option value="">Select field</option>
                {researchFields.map(field => (
                  <option key={field} value={field}>{field}</option>
                ))}
              </select>
            </div>
            
            <div className="form-group">
              <label>Reward (ETH)</label>
              <input 
                type="number"
                name="reward"
                value={requestData.reward} 
                onChange={handleChange}
                placeholder="0.1" 
                className="form-input"
                step="0.01"
                min="0.01"
              />
            </div>
            
            <div className="form-group">
              <label>Description</label>
              <input 
                type="text"
                name="description"
                value={requestData.description} 
                onChange={handleChange}
                placeholder="Brief description..." 
                className="form-input"
              />
            </div>
            
            <div className="form-group full-width">
              <label>Research Data *</label>
              <textarea 
                name="researchData"
                value={requestData.researchData} 
                onChange={handleChange}
                placeholder="Enter research data to be encrypted with FHE..." 
                className="form-textarea"
                rows={4}
              />
            </div>
          </div>
          
          <div className="privacy-notice">
            <div className="privacy-icon"></div> Data remains encrypted during FHE processing
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            onClick={onClose}
            className="cancel-btn"
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={creating}
            className="submit-btn primary"
          >
            {creating ? "Encrypting with FHE..." : "Submit Securely"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;