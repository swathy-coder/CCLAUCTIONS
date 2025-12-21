import { useState, useEffect } from 'react';
import AuctionScreen from '../ui/AuctionScreen';
import AuctionSetup from '../ui/AuctionSetup';
import AudienceView from '../ui/AudienceView';
import { loadAuctionStateOnline } from './firebase';
import './App.css';

import type { Player, Team, BidLog, ResumeData } from '../ui/AuctionSetup';

// Password hash (SHA-256) - the actual password is NOT stored in code
// This is the GLOBAL admin password for initial site access
const ADMIN_HASH = 'd5c40c7735e17f7cd29a17a4a8e7cdb0ed3c0a694047a491ad59daaaab59b699';

// Simple SHA-256 hash function for browser
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

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
  passwordHash?: string; // Auction-specific password hash
}

// App version - increment this to force cache clear on new deploys
const APP_VERSION = '2.0.0';

// Clean up old auction data on app startup to prevent localStorage quota errors and stale data
const cleanupOldAuctions = () => {
  try {
    // Check if app version changed - if so, clear everything
    const storedVersion = localStorage.getItem('app_version');
    if (storedVersion !== APP_VERSION) {
      console.log(`ðŸ”„ App version changed: ${storedVersion} â†’ ${APP_VERSION}. Clearing all cached data.`);
      
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
        console.log(`ðŸ§¹ Cleared ${cleaned} cached auction records due to version update`);
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
      console.log(`ðŸ§¹ Cleaned up ${cleaned} old auction records from localStorage`);
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
  
  // Password protection state
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState('');
  
  // Auto-resume state (when URL has auction ID)
  const [pendingResumeData, setPendingResumeData] = useState<any>(null);
  const [showResumePasswordPrompt, setShowResumePasswordPrompt] = useState(false);
  const [resumePasswordInput, setResumePasswordInput] = useState('');
  const [resumePasswordError, setResumePasswordError] = useState('');
  
  // Check if this is an audience view window
  const urlParams = new URLSearchParams(window.location.search);
  const isAudienceView = urlParams.get('audienceView') === 'true';
  const auctionIdFromUrl = urlParams.get('auction');
  console.log('App params - isAudienceView:', isAudienceView, 'auctionId:', auctionIdFromUrl);
  
  // Check for saved authentication on mount
  useEffect(() => {
    const savedAuth = sessionStorage.getItem('ccl_auth');
    if (savedAuth === 'true') {
      setIsAuthenticated(true);
    }
  }, []);
  
  // Auto-resume: Check Firebase for auction data when URL has auction ID (and not audience view)
  useEffect(() => {
    const checkAutoResume = async () => {
      if (isAudienceView || !auctionIdFromUrl || setup) {
        return;
      }
      
      console.log('ðŸ”„ Auto-resume: Checking Firebase for auction:', auctionIdFromUrl);
      try {
        const data = await loadAuctionStateOnline(auctionIdFromUrl);
        if (data && (data as any).auctionId) {
          console.log('âœ… Auto-resume: Found auction data in Firebase');
          setPendingResumeData(data);
          setShowResumePasswordPrompt(true);
        } else {
          console.log('âš ï¸ Auto-resume: No auction data found for this ID');
          // Clear invalid auction param from URL
          const url = new URL(window.location.href);
          url.searchParams.delete('auction');
          window.history.replaceState({}, '', url.toString());
        }
      } catch (e) {
        console.error('Auto-resume check failed:', e);
      }
    };
    
    if (isAuthenticated && auctionIdFromUrl && !isAudienceView) {
      checkAutoResume();
    }
  }, [isAuthenticated, auctionIdFromUrl, isAudienceView, setup]);
  
  // Password check handler (global admin access)
  const handlePasswordSubmit = async () => {
    const inputHash = await hashPassword(passwordInput);
    if (inputHash === ADMIN_HASH) {
      setIsAuthenticated(true);
      setPasswordError('');
      sessionStorage.setItem('ccl_auth', 'true'); // Remember for this session
    } else {
      setPasswordError('Incorrect password');
      setPasswordInput('');
    }
  };
  
  // Resume password check handler (auction-specific)
  const handleResumePasswordSubmit = async () => {
    if (!pendingResumeData) return;
    
    const inputHash = await hashPassword(resumePasswordInput);
    const storedHash = pendingResumeData.passwordHash;
    
    if (inputHash === storedHash) {
      console.log('âœ… Resume password verified, loading auction...');
      await performAutoResume(pendingResumeData);
      setShowResumePasswordPrompt(false);
      setResumePasswordError('');
    } else {
      setResumePasswordError('Incorrect password');
      setResumePasswordInput('');
    }
  };
  
  // Perform the auto-resume with loaded data
  const performAutoResume = async (data: any) => {
    const auctionId = data.auctionId;
    
    // Load photos from online URL
    const players = data.players || [];
    const onlinePhotoBaseUrl = 'https://cclauctions.pages.dev/player-photos';
    const photoExtensions = ['jpg', 'jpeg', 'png', 'JPG', 'JPEG', 'PNG'];
    
    console.log('ðŸ“· Loading photos for', players.length, 'players from online...');
    
    const playersWithPhotos = await Promise.all(players.map(async (player: any) => {
      // Skip if player already has a photo URL
      if (player.photo && (player.photo.startsWith('http') || player.photo.startsWith('/'))) {
        return player;
      }
      
      // Try to load photo from online
      for (const ext of photoExtensions) {
        const photoUrl = `${onlinePhotoBaseUrl}/${player.id}.${ext}`;
        try {
          const response = await fetch(photoUrl, { method: 'HEAD' });
          if (response.ok) {
            return { ...player, photo: photoUrl };
          }
        } catch {
          // Continue to next extension
        }
      }
      return player;
    }));
    
    console.log('âœ… Loaded photos, setting up auction state');
    
    // Build team balances from data
    const teamBalances = data.teamBalances || [];
    const teams = teamBalances.map((t: any) => ({
      name: t.name,
      balance: t.balance,
      logo: t.logo || '',
      acquired: t.acquired || 0
    }));
    
    // Build resume data
    const resumeData: ResumeData = {
      round: data.round || 1,
      playerIdx: data.playerIdx || 0,
      sequence: playersWithPhotos.map((p: any) => p.name),
      balances: Object.fromEntries(teams.map((t: any) => [t.name, { balance: t.balance, acquired: t.acquired || 0 }])),
      log: data.auctionLog || []
    };
    
    setSetup({
      tournament: data.tournament || 'CCL',
      players: playersWithPhotos,
      teams,
      bidLog: [],
      playerImages: {},
      teamLogos: {},
      defaultBalance: 10000,
      resumeData,
      auctionId,
      minPlayersPerTeam: data.minPlayersPerTeam || 6,
      maxPlayersPerTeam: data.maxPlayersPerTeam || 12,
      blueCapPercent: data.blueCapPercent || 65,
      passwordHash: data.passwordHash
    });
  };
  
  // Set auction ID in URL whenever setup changes
  useEffect(() => {
    if (setup && setup.auctionId) {
      const url = new URL(window.location.href);
      url.searchParams.set('auction', setup.auctionId);
      window.history.replaceState({}, '', url.toString());
      console.log('âœ… App: Updated URL with auction ID:', setup.auctionId);
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
  
  // Password gate for auctioneer access (not needed for audience view)
  if (!isAuthenticated) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: 'linear-gradient(135deg, #0a0e27 0%, #1a1a3e 100%)',
      }}>
        <div style={{
          background: 'rgba(255, 255, 255, 0.05)',
          borderRadius: '1.5rem',
          padding: '3rem',
          width: '90%',
          maxWidth: '400px',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🏏</div>
          <h1 style={{ color: '#fff', fontSize: '1.8rem', marginBottom: '0.5rem' }}>CCL Auction 2025</h1>
          <p style={{ color: '#888', marginBottom: '2rem', fontSize: '0.95rem' }}>Enter password to access auctioneer panel</p>
          
          <input
            type="password"
            value={passwordInput}
            onChange={(e) => setPasswordInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handlePasswordSubmit()}
            placeholder="Password"
            style={{
              width: '100%',
              padding: '1rem',
              fontSize: '1.1rem',
              background: 'rgba(0, 0, 0, 0.3)',
              border: passwordError ? '2px solid #f44336' : '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '0.8rem',
              color: '#fff',
              marginBottom: '1rem',
              boxSizing: 'border-box',
              textAlign: 'center',
            }}
            autoFocus
          />
          
          {passwordError && (
            <div style={{ color: '#f44336', marginBottom: '1rem', fontSize: '0.9rem' }}>
              ❌ {passwordError}
            </div>
          )}
          
          <button
            onClick={handlePasswordSubmit}
            style={{
              width: '100%',
              padding: '1rem',
              fontSize: '1.1rem',
              background: 'linear-gradient(135deg, #1976d2, #1565c0)',
              color: '#fff',
              border: 'none',
              borderRadius: '0.8rem',
              cursor: 'pointer',
              fontWeight: 600,
              transition: 'transform 0.2s',
            }}
          >
            🔓 Enter
          </button>
          
          <p style={{ color: '#666', marginTop: '2rem', fontSize: '0.8rem' }}>
            Audience? Use the shared link to watch the auction live.
          </p>
        </div>
      </div>
    );
  }
  
  // Show resume password prompt when URL has auction ID
  if (showResumePasswordPrompt && pendingResumeData) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: 'linear-gradient(135deg, #0a0e27 0%, #1a1a3e 100%)',
      }}>
        <div style={{
          background: 'rgba(255, 255, 255, 0.05)',
          borderRadius: '1.5rem',
          padding: '3rem',
          width: '90%',
          maxWidth: '450px',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔄</div>
          <h1 style={{ color: '#fff', fontSize: '1.6rem', marginBottom: '0.5rem' }}>Resume Auction</h1>
          <p style={{ color: '#4caf50', marginBottom: '0.5rem', fontSize: '1.1rem', fontWeight: 600 }}>
            Auction ID: {auctionIdFromUrl}
          </p>
          <p style={{ color: '#888', marginBottom: '2rem', fontSize: '0.9rem' }}>
            Enter the auction password to resume where you left off
          </p>
          
          <input
            type="password"
            value={resumePasswordInput}
            onChange={(e) => setResumePasswordInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleResumePasswordSubmit()}
            placeholder="Auction Password"
            style={{
              width: '100%',
              padding: '1rem',
              fontSize: '1.1rem',
              background: 'rgba(0, 0, 0, 0.3)',
              border: resumePasswordError ? '2px solid #f44336' : '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '0.8rem',
              color: '#fff',
              marginBottom: '1rem',
              boxSizing: 'border-box',
              textAlign: 'center',
            }}
            autoFocus
          />
          
          {resumePasswordError && (
            <div style={{ color: '#f44336', marginBottom: '1rem', fontSize: '0.9rem' }}>
              ❌ {resumePasswordError}
            </div>
          )}
          
          <button
            onClick={handleResumePasswordSubmit}
            style={{
              width: '100%',
              padding: '1rem',
              fontSize: '1.1rem',
              background: 'linear-gradient(135deg, #4caf50, #388e3c)',
              color: '#fff',
              border: 'none',
              borderRadius: '0.8rem',
              cursor: 'pointer',
              fontWeight: 600,
              marginBottom: '1rem',
            }}
          >
            ▶️ Resume Auction
          </button>
          
          <button
            onClick={() => {
              setShowResumePasswordPrompt(false);
              setPendingResumeData(null);
              // Clear URL auction param and go to setup
              const url = new URL(window.location.href);
              url.searchParams.delete('auction');
              window.history.replaceState({}, '', url.toString());
            }}
            style={{
              width: '100%',
              padding: '0.8rem',
              fontSize: '0.95rem',
              background: 'transparent',
              color: '#888',
              border: '1px solid #444',
              borderRadius: '0.8rem',
              cursor: 'pointer',
            }}
          >
            Start New Auction Instead
          </button>
        </div>
      </div>
    );
  }

  console.log('App final render - setup:', setup ? 'YES' : 'NO');
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
