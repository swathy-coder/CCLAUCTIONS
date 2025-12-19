import { useState, useEffect } from 'react';
import AuctionScreen from '../ui/AuctionScreen';
import AuctionSetup from '../ui/AuctionSetup';
import AudienceView from '../ui/AudienceView';
import RecoveryModal from '../ui/RecoveryModal';
import './App.css';

import type { Player, Team, BidLog, ResumeData } from '../ui/AuctionSetup';

interface SetupData {
  tournament: string;
  players: Player[];
  teams: Team[];
  bidLog: BidLog[];
  playerImages: Record<string, string>;
  teamLogos: Record<string, string>;
  defaultBalance: number;
  resumeData?: ResumeData;
  auctionId: string;
  minPlayersPerTeam?: number;
  maxPlayersPerTeam?: number;
  blueCapPercent?: number;
}

// Clean up old auction data on app startup to prevent localStorage quota errors
const cleanupOldAuctions = () => {
  try {
    const keys = Object.keys(localStorage);
    let cleaned = 0;
    for (const key of keys) {
      // Keep only the last 2 auctions, remove all others
      if (key.startsWith('auction_')) {
        localStorage.removeItem(key);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      console.log(`🧹 Cleaned up ${cleaned} old auction records from localStorage`);
    }
  } catch (e) {
    console.warn('Could not cleanup localStorage:', e);
  }
};

// Run cleanup on every app load
try {
  cleanupOldAuctions();
} catch (err) {
  console.warn('localStorage cleanup failed:', err);
}

function App() {
  console.log('App component rendering');
  const [setup, setSetup] = useState<SetupData | null>(null);
  const [showRecovery, setShowRecovery] = useState(false);
  const [checkingRecovery, setCheckingRecovery] = useState(true);
  
  // Check if this is an audience view window
  const urlParams = new URLSearchParams(window.location.search);
  const isAudienceView = urlParams.get('audienceView') === 'true';
  const auctionIdFromUrl = urlParams.get('auction');
  console.log('App params - isAudienceView:', isAudienceView, 'auctionId:', auctionIdFromUrl);
  
  // Check for recovery on mount
  useEffect(() => {
    const checkForRecovery = async () => {
      if (isAudienceView || auctionIdFromUrl) {
        setCheckingRecovery(false);
        return;
      }

      // Always show recovery modal on fresh load to allow cross-device resume
      // The modal will check Firebase for active auctions
      if (!setup) {
        console.log('📋 Showing recovery modal for cross-device auction resume');
        setShowRecovery(true);
      }
      
      setCheckingRecovery(false);
    };

    checkForRecovery();
  }, [setup, isAudienceView, auctionIdFromUrl]);

  // Set auction ID in URL whenever setup changes
  useEffect(() => {
    if (setup && setup.auctionId) {
      const url = new URL(window.location.href);
      url.searchParams.set('auction', setup.auctionId);
      window.history.replaceState({}, '', url.toString());
      console.log('✅ App: Updated URL with auction ID:', setup.auctionId);
    }
  }, [setup?.auctionId]);
  
  
  // For audience view, we don't need setup state, just render AudienceView
  // It will load data from localStorage with the auction ID
  if (isAudienceView && auctionIdFromUrl) {
    console.log('Rendering AudienceView for auction:', auctionIdFromUrl);
    try {
      return <AudienceView auctionId={auctionIdFromUrl} />;
    } catch (error) {
      console.error('Error in AudienceView:', error);
      return <div style={{ color: 'red', padding: '2rem' }}>Error in AudienceView: {String(error)}</div>;
    }
  }
  
  // Show recovery modal if checking and found auctions
  if (checkingRecovery) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0a0e27' }}>
        <div style={{ color: '#fff', fontSize: '1.2rem' }}>⏳ Loading...</div>
      </div>
    );
  }

  if (showRecovery) {
    return (
      <RecoveryModal
        onResume={(auctionData) => {
          console.log('✅ Resuming auction from RecoveryModal:', auctionData);
          const data = auctionData as any;
          
          // Get auction ID from the recovered data
          const recoveredAuctionId = data.auctionId || localStorage.getItem('current_auction_id') || '';
          console.log('🎯 Recovered auction ID:', recoveredAuctionId, 'auctionData has photos:', !!data?.currentPlayer?.photo);
          console.log('📋 Recovered auctionLog sample:', data?.auctionLog?.[0], 'total entries:', data?.auctionLog?.length);
          
          // Convert auctionLog format to ResumeData format
          let playerSequence: string[] = [];
          let balances: Record<string, {balance: number; acquired: number}> = {};
          
          // Reconstruct sequence from auction log and current state
          if (data.players && Array.isArray(data.players)) {
            playerSequence = data.players.map((p: any) => p.name);
          }
          
          // Build balances from teamBalances
          if (data.teamBalances && Array.isArray(data.teamBalances)) {
            data.teamBalances.forEach((team: any) => {
              balances[team.name] = {
                balance: team.balance,
                acquired: team.acquired || 0
              };
            });
          }
          
          // Convert auctionLog entries to expected format
          const resumeLog = (data.auctionLog || []).map((entry: any) => ({
            round: entry.round || 1,
            attempt: entry.attempt || 1,
            timestamp: entry.timestamp || new Date().toISOString(),
            playerName: entry.playerName || '',
            team: entry.team || '',
            amount: entry.amount || '',
            status: entry.status || 'Unsold',
            category: entry.category,
            notes: entry.notes
          }));
          
          // Create proper resumeData structure
          const resumeData: ResumeData = {
            round: data.round || 1,
            playerIdx: data.playerIdx || 0,
            sequence: playerSequence,
            balances,
            log: resumeLog
          };
          
          console.log('📊 Converted resumeData:', resumeData);
          
          // Convert recovered data to setup format
          setSetup({
            tournament: data.tournament || 'Recovered Auction',
            players: data.players || [],
            teams: data.teams || [],
            bidLog: [],
            playerImages: {},
            teamLogos: {},
            defaultBalance: data.defaultBalance || 0,
            resumeData,
            auctionId: recoveredAuctionId,
            minPlayersPerTeam: data.minPlayersPerTeam,
            maxPlayersPerTeam: data.maxPlayersPerTeam,
            blueCapPercent: data.blueCapPercent,
          });
          
          // Store auction ID for audience view
          localStorage.setItem('current_auction_id', recoveredAuctionId);
          
          setShowRecovery(false);
        }}
        onCancel={() => {
          console.log('User chose new auction');
          setShowRecovery(false);
        }}
      />
    );
  }
  
  console.log('App final render - setup:', setup ? 'YES' : 'NO');
  if (setup) {
    console.log('Rendering AuctionScreen with players:', setup.players?.length);
    try {
      return <AuctionScreen {...setup} />;
    } catch (error) {
      console.error('Error in AuctionScreen:', error);
      return <div style={{ color: 'red', padding: '2rem' }}>Error in AuctionScreen: {String(error)}</div>;
    }
  } else {
    console.log('Rendering AuctionSetup');
    try {
      return <AuctionSetup onSetup={setSetup} />;
    } catch (error) {
      console.error('Error in AuctionSetup:', error);
      return <div style={{ color: 'red', padding: '2rem' }}>Error in AuctionSetup: {String(error)}</div>;
    }
  }
}

export default App;
