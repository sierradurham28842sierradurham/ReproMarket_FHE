// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract ReproMarket_FHE is SepoliaConfig {
    struct EncryptedRequest {
        euint32[] originalResults;  // Encrypted original research results
        euint32[] methodology;     // Encrypted methodology parameters
        euint32 rewardAmount;        // Encrypted reward amount
    }
    
    struct ReplicationResult {
        uint256 requestId;
        string verificationStatus;
        bool isVerified;
        bool isRevealed;
    }

    uint256 public requestCount;
    uint256 public resultCount;
    mapping(uint256 => EncryptedRequest) public replicationRequests;
    mapping(uint256 => ReplicationResult) public verificationResults;
    
    event RequestSubmitted(uint256 indexed requestId);
    event ReplicationCompleted(uint256 indexed resultId);
    event VerificationResult(uint256 indexed requestId);
    
    modifier onlyRequester(uint256 requestId) {
        _;
    }
    
    function submitReplicationRequest(
        euint32[] memory originalResults,
        euint32[] memory methodology,
        euint32 rewardAmount
    ) public {
        require(originalResults.length == methodology.length, "Invalid input");
        
        requestCount += 1;
        uint256 newId = requestCount;
        
        replicationRequests[newId] = EncryptedRequest({
            originalResults: originalResults,
            methodology: methodology,
            rewardAmount: rewardAmount
        });
        
        emit RequestSubmitted(newId);
    }
    
    function submitEncryptedResult(
        uint256 requestId,
        euint32[] memory replicatedResults
    ) public {
        EncryptedRequest storage request = replicationRequests[requestId];
        require(request.methodology.length > 0, "Request not found");
        require(replicatedResults.length == request.originalResults.length, "Invalid result length");
        
        bytes32[] memory ciphertexts = new bytes32[](request.originalResults.length * 2);
        
        for (uint i = 0; i < request.originalResults.length; i++) {
            ciphertexts[i*2] = FHE.toBytes32(request.originalResults[i]);
            ciphertexts[i*2+1] = FHE.toBytes32(replicatedResults[i]);
        }
        
        uint256 reqId = FHE.requestDecryption(ciphertexts, this.verifyReplication.selector);
        
        resultCount += 1;
        verificationResults[resultCount] = ReplicationResult({
            requestId: requestId,
            verificationStatus: "",
            isVerified: false,
            isRevealed: false
        });
        
        emit ReplicationCompleted(resultCount);
    }
    
    function verifyReplication(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        FHE.checkSignatures(requestId, cleartexts, proof);
        
        (string memory status, bool verified) = abi.decode(cleartexts, (string, bool));
        
        verificationResults[requestId] = ReplicationResult({
            requestId: requestId,
            verificationStatus: status,
            isVerified: verified,
            isRevealed: true
        });
        
        emit VerificationResult(requestId);
    }
    
    function getVerificationResult(uint256 resultId) public view returns (
        uint256 requestId,
        string memory verificationStatus,
        bool isVerified,
        bool isRevealed
    ) {
        ReplicationResult storage result = verificationResults[resultId];
        return (
            result.requestId,
            result.verificationStatus,
            result.isVerified,
            result.isRevealed
        );
    }
    
    function calculateResultConsistency(
        euint32[] memory original,
        euint32[] memory replicated
    ) public pure returns (euint32) {
        require(original.length == replicated.length, "Length mismatch");
        
        euint32 matchCount = FHE.asEuint32(0);
        
        for (uint i = 0; i < original.length; i++) {
            matchCount = FHE.add(
                matchCount,
                FHE.select(
                    FHE.eq(original[i], replicated[i]),
                    FHE.asEuint32(1),
                    FHE.asEuint32(0)
                )
            );
        }
        
        return FHE.div(
            FHE.mul(matchCount, FHE.asEuint32(100)),
            FHE.asEuint32(original.length)
        );
    }
    
    function determineVerificationStatus(
        euint32 consistencyScore,
        euint32 threshold
    ) public pure returns (ebool) {
        return FHE.gte(consistencyScore, threshold);
    }
    
    function calculateStatisticalSignificance(
        euint32[] memory original,
        euint32[] memory replicated
    ) public pure returns (euint32) {
        euint32 meanDiff = FHE.asEuint32(0);
        euint32 variance = FHE.asEuint32(0);
        
        for (uint i = 0; i < original.length; i++) {
            euint32 diff = FHE.sub(original[i], replicated[i]);
            meanDiff = FHE.add(meanDiff, diff);
        }
        
        meanDiff = FHE.div(meanDiff, FHE.asEuint32(original.length));
        
        for (uint i = 0; i < original.length; i++) {
            euint32 diff = FHE.sub(original[i], replicated[i]);
            euint32 sqDiff = FHE.mul(
                FHE.sub(diff, meanDiff),
                FHE.sub(diff, meanDiff)
            );
            variance = FHE.add(variance, sqDiff);
        }
        
        variance = FHE.div(variance, FHE.asEuint32(original.length));
        
        return FHE.div(
            meanDiff,
            FHE.sqrt(variance)
        );
    }
    
    function releaseReward(uint256 requestId) public onlyRequester(requestId) {
        require(verificationResults[requestId].isVerified, "Not verified");
        // Reward distribution logic would be implemented here
    }
}