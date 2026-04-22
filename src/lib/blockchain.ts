import { BrowserProvider, Contract } from 'ethers';

export const VOTING_CONTRACT_ABI = [
  {
    inputs: [{ internalType: 'uint256', name: '_candidateId', type: 'uint256' }],
    name: 'vote',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    name: 'candidates',
    outputs: [
      { internalType: 'uint256', name: 'id', type: 'uint256' },
      { internalType: 'string', name: 'name', type: 'string' },
      { internalType: 'uint256', name: 'voteCount', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'candidatesCount',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: '', type: 'address' }],
    name: 'voters',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
];

const SEPOLIA_CHAIN_ID = '0xaa36a7'; // 11155111

export async function connectWallet(): Promise<BrowserProvider> {
  if (!(window as any).ethereum) {
    throw new Error('MetaMask is not installed. Please install MetaMask to vote.');
  }
  const provider = new BrowserProvider((window as any).ethereum);
  
  // Ensure Sepolia network
  try {
    await (window as any).ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: SEPOLIA_CHAIN_ID }],
    });
  } catch (switchError: any) {
    if (switchError.code === 4902) {
      await (window as any).ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: SEPOLIA_CHAIN_ID,
          chainName: 'Sepolia Testnet',
          nativeCurrency: { name: 'SepoliaETH', symbol: 'ETH', decimals: 18 },
          rpcUrls: ['https://rpc.sepolia.org'],
          blockExplorerUrls: ['https://sepolia.etherscan.io'],
        }],
      });
    } else {
      throw switchError;
    }
  }

  await provider.send('eth_requestAccounts', []);
  return provider;
}

export async function castVoteOnChain(provider: BrowserProvider, candidateOnchainId: number, contractAddress: string) {
  const signer = await provider.getSigner();
  const contract = new Contract(contractAddress, VOTING_CONTRACT_ABI, signer);
  
  const tx = await contract.vote(candidateOnchainId);
  const receipt = await tx.wait();
  
  return {
    txHash: receipt.hash,
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed.toString(),
  };
}

export async function hasVotedOnChain(provider: BrowserProvider, address: string, contractAddress: string): Promise<boolean> {
  const contract = new Contract(contractAddress, VOTING_CONTRACT_ABI, provider);
  return await contract.voters(address);
}
