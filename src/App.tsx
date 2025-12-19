import { useState, useEffect } from 'react';
import AuctionScreen from '../ui/AuctionScreen';
import AuctionSetup from '../ui/AuctionSetup';
import AudienceView from '../ui/AudienceView';
import RecoveryModal from '../ui/RecoveryModal';
import { saveAuctionStateOnline } from './firebase';
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

// App version - increment this to force cache clear on new deploys
const APP_VERSION = '2.0.0';

// Clean up old auction data on app startup to prevent localStorage quota errors and stale data
const cleanupOldAuctions = () => {
  try {
    // Check if app version changed - if so, clear everything
    const storedVersion = localStorage.getItem('app_version');
    if (storedVersion !== APP_VERSION) {
      console.log(`🔄 App version changed: ${storedVersion} → ${APP_VERSION}. Clearing all cached data.`);
      
      // Clear all auction-related data
      const keys = Object.keys(localStorage);
      let cleaned = 0;
      for (const key of keys) {
        if (key.startsWith('auction_') || key.startsWith('auction_setup_')) {
          localStorage.removeItem(key);
          cleaned++;
        }
      }
      
      // Update version
      localStorage.setItem('app_version', APP_VERSION);
      
      if (cleaned > 0) {
        console.log(`🧹 Cleared ${cleaned} cached auction records due to version update`);
      }
      return;
    }
    
    // Normal cleanup - remove old auctions except current one
    const currentAuctionId = localStorage.getItem('current_auction_id');
    const keys = Object.keys(localStorage);
    let cleaned = 0;
    
    for (const key of keys) {
      // Keep current auction, remove others
      if (key.startsWith('auction_') && !key.includes(currentAuctionId || '___none___')) {
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
          
          // IMPORTANT: Clear all old auction data from localStorage before resuming
          // This prevents stale cached data from conflicting with fresh Firebase data
          try {
            const keys = Object.keys(localStorage);
            let cleared = 0;
            for (const key of keys) {
              if (key.startsWith('auction_') || key.startsWith('auction_setup_')) {
                localStorage.removeItem(key);
                cleared++;
              }
            }
            console.log(`🧹 Cleared ${cleared} cached auction records before resume`);
          } catch (e) {
            console.warn('Could not clear localStorage:', e);
          }
          
          // Get OLD auction ID from the recovered data
          const oldAuctionId = data.auctionId || localStorage.getItem('current_auction_id') || '';
          
          // Generate NEW auction ID to ensure fresh Firebase subscription sync
          // This solves the issue where Device 2 AudienceView doesn't update from Device 2 changes
          const newAuctionId = Math.random().toString(36).substring(2, 10).toUpperCase();
          
          console.log('🔄 Resume: Old auctionId:', oldAuctionId, '→ New auctionId:', newAuctionId);
          console.log('📝 Reason: Fresh ID ensures AudienceView subscribes to new Firebase path');
          console.log('🎯 Data being migrated - auctionData has photos:', !!data?.currentPlayer?.photo);
          console.log('📋 Recovered auctionLog sample:', data?.auctionLog?.[0], 'total entries:', data?.auctionLog?.length);
          
          // Convert auctionLog format to ResumeData format
          let playerSequence: string[] = [];
          let balances: Record<string, {balance: number; acquired: number}> = {};
          
          // Reconstruct sequence from auction log and current state
          if (data.players && Array.isArray(data.players)) {
            playerSequence = data.players.map((p: any) => p.name);
          }
          
          // Build balances from teamBalances
          // Handle both array format and Firebase object format (with numeric keys)
          const teamBalancesData = data.teamBalances;
          console.log('🔍 teamBalances data type:', typeof teamBalancesData, 'isArray:', Array.isArray(teamBalancesData));
          
          if (teamBalancesData) {
            const teamsArray = Array.isArray(teamBalancesData) 
              ? teamBalancesData 
              : Object.values(teamBalancesData); // Firebase sometimes converts arrays to objects
            
            console.log('🔍 Processing', teamsArray.length, 'teams from Firebase');
            
            teamsArray.forEach((team: any) => {
              if (team && team.name) {
                console.log(`   ${team.name}: balance=${team.balance}, acquired=${team.acquired}`);
                balances[team.name] = {
                  balance: team.balance,
                  acquired: team.acquired || 0
                };
              }
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
          
          // Convert recovered data to setup format using NEW auctionId
          // Handle Firebase object format for arrays (Firebase converts arrays to objects with numeric keys)
          const teamsData = data.teams;
          const teamsArray = Array.isArray(teamsData) 
            ? teamsData 
            : (teamsData ? Object.values(teamsData) : []);
          
          const playersData = data.players;
          const playersArray = Array.isArray(playersData)
            ? playersData
            : (playersData ? Object.values(playersData) : []);
          
          console.log('🔍 Teams array length:', teamsArray.length, 'Players array length:', playersArray.length);
          
          const setupData = {
            tournament: data.tournament || 'Recovered Auction',
            players: playersArray,
            teams: teamsArray,
            bidLog: [],
            playerImages: {},
            teamLogos: {},
            defaultBalance: data.defaultBalance || 0,
            resumeData,
            auctionId: newAuctionId,  // USE NEW ID - this is the key fix!
            minPlayersPerTeam: data.minPlayersPerTeam,
            maxPlayersPerTeam: data.maxPlayersPerTeam,
            blueCapPercent: data.blueCapPercent,
          };
          
          setSetup(setupData);
          
          // Store NEW auction ID for audience view - this will be picked up by URL update effect
          localStorage.setItem('current_auction_id', newAuctionId);
          
          // Copy all data from old Firebase path to new path so nothing is lost
          if (oldAuctionId && oldAuctionId !== newAuctionId) {
            console.log('📤 Copying auction data from', oldAuctionId, 'to', newAuctionId);
            // Save the complete state to new Firebase path with new ID
            const completeState = {
              ...data,
              auctionId: newAuctionId,
              resumedFrom: oldAuctionId,
              resumedAt: new Date().toISOString(),
            };
            saveAuctionStateOnline(newAuctionId, completeState)
              .then(() => console.log('✅ Auction data successfully copied to Firebase with new ID:', newAuctionId))
              .catch(err => console.warn('⚠️ Could not copy data to Firebase:', err));
          }
          
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
