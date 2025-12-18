import { useState } from 'react';
import AuctionScreen from '../ui/AuctionScreen';
import AuctionSetup from '../ui/AuctionSetup';
import AudienceView from '../ui/AudienceView';
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
  
  // Check if this is an audience view window
  const urlParams = new URLSearchParams(window.location.search);
  const isAudienceView = urlParams.get('audienceView') === 'true';
  const auctionIdFromUrl = urlParams.get('auction');
  console.log('App params - isAudienceView:', isAudienceView, 'auctionId:', auctionIdFromUrl);
  
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
