import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Vote, Loader2, User, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import DashboardLayout from '@/components/DashboardLayout';
import VoteConfirmationModal from '@/components/VoteConfirmationModal';
import { connectWallet, castVoteOnChain, hasVotedOnChain } from '@/lib/blockchain';
import type { BrowserProvider } from 'ethers';

interface Candidate {
  id: string;
  name: string;
  votes_count: number;
  onchain_id: number | null;
}

interface Election {
  id: string;
  title: string;
  contract_address: string | null;
}

function generateReceiptId() {
  return 'RCP-' + Array.from({ length: 8 }, () => Math.floor(Math.random() * 36).toString(36)).join('').toUpperCase();
}

export default function VotingPage() {
  const { electionId } = useParams();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [election, setElection] = useState<Election | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [hasVoted, setHasVoted] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [receiptData, setReceiptData] = useState<any>(null);
  const [walletConnected, setWalletConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string>('');
  const [provider, setProvider] = useState<BrowserProvider | null>(null);

  useEffect(() => {
    loadData();
  }, [electionId]);

  const loadData = async () => {
    if (!electionId || !profile) return;
    const { data: el } = await supabase.from('elections').select('*').eq('id', electionId).single();
    if (el) setElection(el as Election);

    const { data: cands } = await supabase.from('candidates').select('*').eq('election_id', electionId);
    if (cands) setCandidates(cands as Candidate[]);

    const { data: existingVote } = await supabase
      .from('votes')
      .select('id')
      .eq('voter_id', profile.id)
      .eq('election_id', electionId)
      .maybeSingle();
    if (existingVote) setHasVoted(true);

    setPageLoading(false);
  };

  const handleConnectWallet = async () => {
    try {
      const p = await connectWallet();
      const signer = await p.getSigner();
      const address = await signer.getAddress();
      setProvider(p);
      setWalletAddress(address);
      setWalletConnected(true);

      if (election?.contract_address) {
        try {
          const alreadyVoted = await hasVotedOnChain(p, address, election.contract_address);
          if (alreadyVoted) {
            setHasVoted(true);
            toast.info('This wallet has already voted on-chain.');
          }
        } catch (err) {
          console.warn('Could not check on-chain vote status:', err);
        }
      }

      toast.success(`Wallet connected: ${address.slice(0, 6)}...${address.slice(-4)}`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to connect wallet');
    }
  };

  const handleVote = async () => {
    if (!selected || !profile || !election || !provider) return;

    const candidate = candidates.find(c => c.id === selected);
    if (!candidate?.onchain_id) {
      toast.error('This candidate has no on-chain ID mapped. Please contact the administrator.');
      return;
    }

    setLoading(true);
    try {
      const { txHash, blockNumber, gasUsed } = await castVoteOnChain(provider, candidate.onchain_id, election.contract_address || '');
      const receiptId = generateReceiptId();

      const { error: voteErr } = await supabase
        .from('votes')
        .insert({
          voter_id: profile.id,
          election_id: election.id,
          candidate_id: selected,
          tx_hash: txHash,
        });

      if (voteErr) {
        if (voteErr.message.includes('duplicate') || voteErr.message.includes('unique')) {
          toast.error('You have already voted in this election');
        } else {
          throw voteErr;
        }
        return;
      }

      await supabase.from('candidates').update({ votes_count: candidate.votes_count + 1 }).eq('id', selected);

      const voteTimestamp = new Date().toISOString();
      setHasVoted(true);
      setReceiptData({
        txHash,
        blockNumber,
        gasUsed,
        receiptId,
        electionTitle: election.title,
        candidateName: candidate.name,
        timestamp: voteTimestamp,
      });
      setModalOpen(true);

      supabase.functions.invoke('send-vote-email', {
        body: {
          to: profile.email,
          voterName: profile.name,
          electionTitle: election.title,
          candidateName: candidate.name,
          txHash,
          receiptId,
          timestamp: voteTimestamp,
        },
      }).then(({ error }) => {
        if (error) console.error('Email send failed:', error);
      });

      if (profile.phone) {
        supabase.functions.invoke('send-vote-sms', {
          body: { phone: profile.phone },
        }).then(({ error }) => {
          if (error) console.error('SMS send failed:', error);
        });
      }
    } catch (err: any) {
      if (err.code === 'ACTION_REJECTED') {
        toast.error('Transaction rejected by user');
      } else {
        toast.error(err.reason || err.message || 'Vote failed on blockchain');
      }
    } finally {
      setLoading(false);
    }
  };

  if (pageLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="mb-8">
            <h1 className="text-2xl font-display font-bold">{election?.title}</h1>
            <p className="text-sm text-muted-foreground">
              {hasVoted ? 'You have already voted in this election' : 'Select your candidate and cast your vote on the blockchain'}
            </p>
          </div>

          {!walletConnected && !hasVoted && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-6">
              <Button
                onClick={handleConnectWallet}
                className="w-full py-6 text-base font-display bg-accent text-accent-foreground hover:bg-accent/90"
              >
                <Wallet className="w-5 h-5 mr-2" /> Connect MetaMask Wallet
              </Button>
              <p className="text-xs text-muted-foreground text-center mt-2">
                Connect your wallet on Sepolia testnet to cast your vote
              </p>
            </motion.div>
          )}

          {walletConnected && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-4 glass rounded-lg px-4 py-2 flex items-center gap-2 text-sm">
              <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
              <span className="text-muted-foreground">Connected:</span>
              <span className="font-mono text-foreground">{walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}</span>
            </motion.div>
          )}

          <div className="space-y-3 mb-8">
            {candidates.map((c, i) => (
              <motion.button
                key={c.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1 }}
                onClick={() => !hasVoted && walletConnected && setSelected(c.id)}
                disabled={hasVoted || !walletConnected}
                className={`w-full p-5 rounded-xl text-left transition-all flex items-center gap-4 disabled:opacity-60 disabled:cursor-not-allowed ${
                  selected === c.id
                    ? 'glass-strong glow-primary border-primary/50'
                    : 'glass hover:bg-card/80'
                } gradient-border`}
              >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                  selected === c.id ? 'bg-primary/20' : 'bg-muted'
                }`}>
                  <User className={`w-5 h-5 ${selected === c.id ? 'text-primary' : 'text-muted-foreground'}`} />
                </div>
                <div className="flex-1">
                  <span className="font-display font-semibold">{c.name}</span>
                </div>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                  selected === c.id ? 'border-primary bg-primary' : 'border-muted-foreground/30'
                }`}>
                  {selected === c.id && <div className="w-2 h-2 rounded-full bg-primary-foreground" />}
                </div>
              </motion.button>
            ))}
          </div>

          <Button
            onClick={handleVote}
            disabled={!selected || loading || hasVoted || !walletConnected}
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-display py-6 text-base glow-primary disabled:opacity-50"
          >
            {hasVoted ? (
              <>Vote Already Cast</>
            ) : loading ? (
              <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Confirming on Blockchain...</>
            ) : (
              <><Vote className="w-5 h-5 mr-2" /> Cast Vote on Blockchain</>
            )}
          </Button>
        </motion.div>
      </div>

      <VoteConfirmationModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          navigate('/voter/elections');
        }}
        data={receiptData}
      />
    </DashboardLayout>
  );
}
