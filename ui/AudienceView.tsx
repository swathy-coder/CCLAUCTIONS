import React, { useState, useEffect } from 'react';
import './AudienceView.css';
import type { Player, Team } from './AuctionScreen';
import { subscribeToAuctionUpdates } from '../src/firebase';
import LogoImage from '../LOGO 2.png';

// Helper: Format currency - displays exact values with readable suffixes
// 100 → ₹100, 1000 → ₹1k, 10000 → ₹10k, 100000 → ₹1L, 1000000 → ₹10L, 10000000 → ₹1Cr
function formatCurrency(value: number): string {
  if (value >= 10000000) {
    const crores = value / 10000000;
    return crores % 1 === 0 ? `₹${crores}Cr` : `₹${crores.toFixed(1)}Cr`;
  }
  if (value >= 100000) {
    const lakhs = value / 100000;
    return lakhs % 1 === 0 ? `₹${lakhs}L` : `₹${lakhs.toFixed(1)}L`;
  }
  if (value >= 1000) {
    const k = value / 1000;
    return k % 1 === 0 ? `₹${k}k` : `₹${k.toFixed(1)}k`;
  }
  return `₹${value}`;
}

type AuctionLogEntry = {
  round: number;
  attempt: number;
  timestamp: string;
  playerName: string;
  team: string;
  amount: number | '';
  status: 'Sold' | 'Unsold';
  category?: string;
};

interface AudienceViewProps {
  currentPlayer?: Player | null;
  soldPlayers?: AuctionLogEntry[];
  teams?: Team[];
  teamBalances?: Team[];
  auctionLog?: AuctionLogEntry[];
  round?: number;
  auctionId?: string;
}

export default function AudienceView({
  currentPlayer: propCurrentPlayer = null,
  // soldPlayers prop is deprecated - we now derive it from auctionLog for proper ordering
  teamBalances: propTeamBalances = [],
  auctionLog: propAuctionLog = [],
  round: propRound = 1,
  auctionId,
}: AudienceViewProps) {
  const urlParams = new URLSearchParams(window.location.search);
  const isStandaloneView = urlParams.get('audienceView') === 'true';
  // Get auctionId from URL first, then props, then localStorage fallback
  const effectiveAuctionId = urlParams.get('auction') || auctionId || localStorage.getItem('current_auction_id');
  console.log('🎬 AudienceView rendered. isStandaloneView:', isStandaloneView, 'effectiveAuctionId:', effectiveAuctionId, 'URL auction param:', urlParams.get('auction'), 'localStorage auction:', localStorage.getItem('current_auction_id'));
  
  const [currentTime, setCurrentTime] = useState(new Date());
  
  // State for live auction data from localStorage
  const [liveData, setLiveData] = useState<{
    currentPlayer: Player | null;
    soldPlayers: AuctionLogEntry[];
    teams: Team[];
    teamBalances: Team[];
    auctionLog: AuctionLogEntry[];
    round: number;
    isSold: boolean;
    soldToTeam: string;
    soldAmount: number;
    auctionComplete?: boolean;
    blueCapPercent?: number;
    players?: Player[];
    minPlayersPerTeam?: number;
    maxPlayersPerTeam?: number;
    teamRosterData?: {
      name: string;
      logo?: string;
      acquired: number;
      needed: number;
      totalSpent: number;
      balance: number;
      blueLeft: number;
      blueBudget: number;
      blueSpent: number;
      maxBidUnits: number;
      minNeeded: number;
      isAtRisk: boolean;
      isFull: boolean;
      isComplete: boolean;
    }[];
  } | null>(null);

  // Track online status to force reconnect
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [reconnectKey, setReconnectKey] = useState(0);
  
  // Listen for online/offline events and force reconnect
  useEffect(() => {
    const handleOnline = () => {
      console.log('🌐 AudienceView: Back ONLINE - forcing Firebase reconnect');
      setIsOnline(true);
      // Force re-subscription by updating key
      setReconnectKey(k => k + 1);
    };
    const handleOffline = () => {
      console.log('📴 AudienceView: OFFLINE detected');
      setIsOnline(false);
    };
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Subscribe to real-time Firebase updates when in standalone mode OR when we have an auction ID
  // reconnectKey forces re-subscription when coming back online
  useEffect(() => {
    if (effectiveAuctionId) {
      console.log('🔥 AudienceView: Subscribing to Firebase for:', effectiveAuctionId, 'isStandaloneView:', isStandaloneView, 'reconnectKey:', reconnectKey);
      
      let updateCount = 0;
      
      // Subscribe to real-time updates from Firebase
      const unsubscribe = subscribeToAuctionUpdates(effectiveAuctionId, (data) => {
        updateCount++;
        console.log(`🔥 AudienceView: Firebase subscription FIRED #${updateCount}:`, {
          auctionId: effectiveAuctionId,
          currentPlayer: (data as any)?.currentPlayer?.name,
          logEntries: (data as any)?.auctionLog?.length,
          lastEntry: (data as any)?.auctionLog?.[((data as any)?.auctionLog?.length || 0) - 1],
          round: (data as any)?.round,
          hasPhotos: !!(data as any)?.currentPlayer?.photo,
          timestamp: new Date().toLocaleTimeString()
        });
        setLiveData(data as typeof liveData);
      });
      
      // Also load from localStorage immediately as fallback
      try {
        const stored = localStorage.getItem(`auction_${effectiveAuctionId}`);
        if (stored) {
          const data = JSON.parse(stored);
          console.log('📄 AudienceView: Loaded from localStorage:', effectiveAuctionId);
          setLiveData(data);
        } else {
          console.log('📄 AudienceView: No localStorage data for:', effectiveAuctionId);
        }
      } catch (e) {
        console.error('Failed to load from localStorage:', e);
      }
      
      // Cleanup subscription on unmount
      return unsubscribe;
    }
  }, [effectiveAuctionId, reconnectKey]);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // REMOVED: localStorage polling (200ms) - was causing lag with 100+ viewers
  // localStorage only works same-device anyway, not useful for cross-device audience
  
  // REMOVED: Firebase polling (1 second) - was causing 100 reads/second with 100 viewers
  // The Firebase subscription (onValue) above handles real-time updates properly
  // Polling was competing with subscription and causing 30+ second lag
  
  // Use live data if available, otherwise use props
  const currentPlayer = liveData?.currentPlayer ?? propCurrentPlayer;
  // Note: soldPlayers prop is no longer used - we derive it from auctionLog for proper ordering
  const teamBalances = liveData?.teamBalances ?? propTeamBalances;
  const auctionLog = liveData?.auctionLog ?? propAuctionLog;
  const round = liveData?.round ?? propRound;
  const blueCapPercent = liveData?.blueCapPercent ?? 65;
  const allPlayers = liveData?.players ?? [];
  const teamRosterData = liveData?.teamRosterData ?? [];
  const minPlayersPerTeam = liveData?.minPlayersPerTeam ?? 6;
  const maxPlayersPerTeam = liveData?.maxPlayersPerTeam ?? 12;



  // Calculate blue spending per team (fallback if teamRosterData not available)
  const getBlueSpentByTeam = (teamName: string): number => {
    return auctionLog
      .filter(entry => {
        if (entry.status !== 'Sold' || entry.team !== teamName) return false;
        // Use category from log entry (for resume support) or fall back to player lookup
        const categoryFromLog = (entry.category || '').toLowerCase();
        if (categoryFromLog) {
          return categoryFromLog === 'blue';
        }
        // Fallback: find the player to check if they're blue category
        const player = allPlayers.find(p => p.name === entry.playerName);
        return player && (player.category || '').toLowerCase() === 'blue';
      })
      .reduce((sum, entry) => sum + (typeof entry.amount === 'number' ? entry.amount : 0), 0);
  };

  function generateAndDownloadRostersCSV() {
    const escape = (v: unknown) => {
      if (v === null || v === undefined) return '';
      let s = String(v).replace(/\r\n|\r|\n/g, '\n');
      if (/[",\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
      return s;
    };

    const lines: string[] = [];

    // Build merged headers row with team names
    const headers: string[] = [];
    teamBalances.forEach(team => {
      headers.push(team.name, '');
    });
    lines.push(headers.map(escape).join(','));

    // Build sub-headers row
    const subHeaders: string[] = [];
    teamBalances.forEach(() => {
      subHeaders.push('Player', 'Amount');
    });
    lines.push(subHeaders.map(escape).join(','));

    // Find max number of players any team has
    const teamPlayerLists = teamBalances.map(team =>
      auctionLog
        .filter(log => log.team === team.name && log.status === 'Sold')
        .sort((a, b) => (typeof b.amount === 'number' && typeof a.amount === 'number' ? b.amount - a.amount : 0))
    );
    const maxPlayers = Math.max(...teamPlayerLists.map(list => list.length), 0);

    // Build data rows
    for (let i = 0; i < maxPlayers; i++) {
      const row: (string | number)[] = [];
      teamPlayerLists.forEach(playerList => {
        if (i < playerList.length) {
          row.push(playerList[i].playerName);
          row.push(typeof playerList[i].amount === 'number' ? playerList[i].amount : '');
        } else {
          row.push('', '');
        }
      });
      lines.push(row.map(escape).join(','));
    }

    // Add empty row separator
    lines.push(teamBalances.map(() => ',').join('').slice(0, -1));

    // Add "Total Spent" row
    const spentRow: (string | number)[] = [];
    teamBalances.forEach(team => {
      const teamPlayers = auctionLog.filter(log => log.team === team.name && log.status === 'Sold');
      const totalSpent = teamPlayers.reduce((sum, log) => sum + (typeof log.amount === 'number' ? log.amount : 0), 0);
      spentRow.push('Total Spent', totalSpent);
    });
    lines.push(spentRow.map(escape).join(','));

    // Add "Remaining Balance" row
    const balanceRow: (string | number)[] = [];
    teamBalances.forEach(team => {
      balanceRow.push('Remaining Balance', team.balance);
    });
    lines.push(balanceRow.map(escape).join(','));

    const csv = '\uFEFF' + lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `team-rosters-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); }, 0);
  }

  // Derive soldPlayersList from auctionLog to ensure all sold players (before and after resume) are included
  // Sort by timestamp in reverse chronological order (most recent first)
  const soldPlayersList = auctionLog
    .filter(log => log.status === 'Sold')
    .sort((a, b) => {
      // Sort by round (descending), then by timestamp (descending)
      if (a.round !== b.round) return b.round - a.round;
      // Parse timestamps for proper comparison
      const timeA = new Date(a.timestamp).getTime();
      const timeB = new Date(b.timestamp).getTime();
      if (!isNaN(timeA) && !isNaN(timeB)) return timeB - timeA;
      // Fallback to string comparison
      return b.timestamp.localeCompare(a.timestamp);
    });

  // Compute unsold players list (filter out those that were sold later)
  const unsoldPlayersList = auctionLog.filter(log => {
    if (log.status !== 'Unsold') return false;
    // Check if this player was sold in a later round
    const wasSoldLater = auctionLog.some(l => 
      l.playerName === log.playerName && 
      l.status === 'Sold' && 
      l.round > log.round
    );
    return !wasSoldLater;
  });

  return (
    <>
      <style>{`
        * {
          color-scheme: light !important;
        }
        body {
          background: #0a0e27 !important;
          color: #fff !important;
        }
        @keyframes pulse-warning {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
      `}</style>
      
      {/* Offline Warning Banner for Audience */}
      {!isOnline && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          background: 'linear-gradient(90deg, #ff9800, #f57c00)',
          color: 'white',
          padding: '0.6rem 1rem',
          textAlign: 'center',
          zIndex: 9999,
          fontWeight: 600,
          fontSize: '0.95rem',
          animation: 'pulse-warning 2s infinite',
        }}>
          ⏳ Waiting for connection... Updates will resume automatically
        </div>
      )}
      
      {/* Auction Complete Overlay */}
      {liveData?.auctionComplete && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          background: 'rgba(0, 0, 0, 0.9)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          animation: 'fadeIn 0.5s ease-out',
        }}>
          <div style={{
            textAlign: 'center',
            padding: '3rem',
            background: 'linear-gradient(135deg, #1a1f3a 0%, #0a0e27 100%)',
            borderRadius: '2rem',
            boxShadow: '0 0 60px rgba(25, 118, 210, 0.5)',
            border: '3px solid rgba(25, 118, 210, 0.6)',
            maxWidth: '600px',
          }}>
            <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🎉🏆🎉</div>
            <h1 style={{ fontSize: '3rem', fontWeight: 900, color: '#fff', marginBottom: '1rem', textShadow: '0 0 20px rgba(25, 118, 210, 0.8)' }}>
              Auction Complete!
            </h1>
            <p style={{ fontSize: '1.5rem', color: '#90caf9', marginBottom: '2rem' }}>
              All players have been successfully auctioned
            </p>
            <button
              onClick={generateAndDownloadRostersCSV}
              style={{
                padding: '1rem 2rem',
                fontSize: '1.2rem',
                fontWeight: 700,
                background: 'linear-gradient(135deg, #4caf50, #45a049)',
                color: '#fff',
                border: 'none',
                borderRadius: '0.75rem',
                cursor: 'pointer',
                boxShadow: '0 4px 20px rgba(76, 175, 80, 0.4)',
              }}
            >
              📊 Download Team Rosters
            </button>
          </div>
        </div>
      )}
      
      <div className="audience-view-container" style={{
        width: '100%',
        maxWidth: '100vw',
        margin: 0,
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0a0e27 0%, #1a1f3a 50%, #0a0e27 100%)',
        color: '#fff',
        fontFamily: 'Segoe UI, Arial, sans-serif',
        padding: '1rem',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div className="audience-header" style={{
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '0.5rem',
          padding: '1rem 1.5rem',
          background: 'rgba(255, 255, 255, 0.05)',
          borderRadius: '1rem',
          backdropFilter: 'blur(10px)',
          gap: '1rem',
          flexWrap: 'wrap',
          width: '1500px',
          maxWidth: '100%',
          margin: '0 auto 0.5rem auto',
        }}>
          <img 
            src={LogoImage} 
            alt="CCL Logo" 
            style={{
              height: '80px',
              width: 'auto',
              objectFit: 'contain',
              marginRight: '0.5rem',
            }}
          />
          <div style={{ flex: '1 1 auto', minWidth: 0 }}>
            <h1 style={{ margin: 0, fontSize: '2.5rem', fontWeight: 900, color: '#fff', textShadow: '0 2px 10px rgba(25, 118, 210, 0.5)' }}>
              🏏 AUCTION LIVE
            </h1>
            <div style={{ fontSize: '1.2rem', color: '#90caf9', marginTop: '0.5rem', fontWeight: 600 }}>
              Round {round} • {currentTime.toLocaleTimeString()}
            </div>
            {/* Category indicator - hidden for owners */}
            {currentPlayer && currentPlayer.category && currentPlayer.owner !== 'yes' && (
              <div style={{
                marginTop: '0.75rem',
                display: 'inline-block',
                padding: 'clamp(0.4rem, 1.5vw, 0.6rem) clamp(0.8rem, 2.5vw, 1.2rem)',
                borderRadius: '0.6rem',
                background: (currentPlayer.category || '').toLowerCase() === 'blue' 
                  ? 'linear-gradient(135deg, #1976d2, #1565c0)' 
                  : 'linear-gradient(135deg, #d32f2f, #c62828)',
                fontSize: 'clamp(0.8rem, 2vw, 1rem)',
                fontWeight: 700,
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                animation: 'pulse 2s ease-in-out infinite',
              }}>
                {(currentPlayer.category || '').toLowerCase() === 'blue' ? '🔵 BLUE PLAYERS' : '🔴 RED PLAYERS'} AUCTION
              </div>
            )}
            {/* Owner indicator */}
            {currentPlayer && currentPlayer.owner === 'yes' && (
              <div style={{
                marginTop: '0.75rem',
                display: 'inline-block',
                padding: 'clamp(0.4rem, 1.5vw, 0.6rem) clamp(0.8rem, 2.5vw, 1.2rem)',
                borderRadius: '0.6rem',
                background: 'linear-gradient(135deg, #ffc107, #ffb300)',
                fontSize: 'clamp(0.8rem, 2vw, 1rem)',
                fontWeight: 700,
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                animation: 'pulse 2s ease-in-out infinite',
              }}>
                👤 OWNER AUCTION
              </div>
            )}
          </div>
          <button
            onClick={generateAndDownloadRostersCSV}
            style={{
              padding: 'clamp(0.6rem, 2vw, 1rem) clamp(1rem, 3vw, 2rem)',
              borderRadius: '0.8rem',
              background: 'linear-gradient(135deg, #1976d2, #1565c0)',
              color: '#fff',
              fontWeight: 700,
              fontSize: 'clamp(0.85rem, 2vw, 1.1rem)',
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 4px 15px rgba(25, 118, 210, 0.4)',
              transition: 'transform 0.2s',
              whiteSpace: 'nowrap',
            }}
            onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
          >
            📊 Download Rosters
          </button>
        </div>

        {/* Compact Stats Bar */}
        <div style={{
          display: 'flex',
          gap: '1rem',
          flexWrap: 'wrap',
          justifyContent: 'center',
          padding: '0.75rem 1rem',
          background: 'rgba(255, 255, 255, 0.05)',
          borderRadius: '0.75rem',
          maxWidth: '1500px',
          margin: '0 auto',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', background: 'rgba(25, 118, 210, 0.2)', borderRadius: '0.5rem' }}>
            <span style={{ fontSize: '1.5rem' }}>✅</span>
            <span style={{ color: '#90caf9', fontWeight: 700, fontSize: '1.1rem' }}>{soldPlayersList.length} Sold</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', background: 'rgba(255, 152, 0, 0.2)', borderRadius: '0.5rem' }}>
            <span style={{ fontSize: '1.5rem' }}>⏳</span>
            <span style={{ color: '#ffb74d', fontWeight: 700, fontSize: '1.1rem' }}>{auctionLog.filter(log => log.status === 'Unsold').length} Unsold</span>
          </div>
          {/* Players Remaining - Blue and Red counts */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', background: 'rgba(156, 39, 176, 0.2)', borderRadius: '0.5rem' }}>
            <span style={{ fontSize: '1.5rem' }}>📋</span>
            <span style={{ color: '#ce93d8', fontWeight: 700, fontSize: '1.1rem' }}>
              {(() => {
                const decidedNames = new Set(auctionLog.map(l => l.playerName));
                const remaining = allPlayers.filter(p => !decidedNames.has(p.name));
                const blueRemaining = remaining.filter(p => (p.category || '').toLowerCase() === 'blue').length;
                const redRemaining = remaining.filter(p => (p.category || '').toLowerCase() === 'red').length;
                return `${remaining.length} Left (🔵${blueRemaining} 🔴${redRemaining})`;
              })()}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', background: 'rgba(76, 175, 80, 0.2)', borderRadius: '0.5rem' }}>
            <span style={{ fontSize: '1.5rem' }}>💰</span>
            <span style={{ color: '#81c784', fontWeight: 700, fontSize: '1.1rem' }}>
              {formatCurrency(soldPlayersList.reduce((sum, log) => sum + (typeof log.amount === 'number' ? log.amount : 0), 0))} Spent
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', background: 'rgba(255, 193, 7, 0.2)', borderRadius: '0.5rem' }}>
            <span style={{ fontSize: '1.5rem' }}>🏆</span>
            <span style={{ color: '#ffd54f', fontWeight: 700, fontSize: '1.1rem' }}>
              Max: {formatCurrency(soldPlayersList.reduce((max, log) => Math.max(max, typeof log.amount === 'number' ? log.amount : 0), 0))}
            </span>
          </div>
        </div>

        {/* MAIN CONTENT: Side-by-Side Layout - Player (60%) + Teams (40%) */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 3fr) minmax(0, 2fr)',
          gap: '1rem',
          maxWidth: '1500px',
          margin: '0 auto',
          width: '100%',
          minHeight: '500px',
        }}>
          {/* LEFT: Current Player Card */}
          <div className="current-player-card" style={{
            background: 'rgba(255, 255, 255, 0.08)',
            borderRadius: '1rem',
            padding: '1.25rem',
            backdropFilter: 'blur(10px)',
            border: currentPlayer && currentPlayer.owner === 'yes'
              ? '2px solid rgba(255, 193, 7, 0.6)'
              : currentPlayer && currentPlayer.category 
              ? ((currentPlayer.category || '').toLowerCase() === 'blue' 
                ? '2px solid rgba(25, 118, 210, 0.6)' 
                : '2px solid rgba(211, 47, 47, 0.6)')
              : '2px solid rgba(25, 118, 210, 0.3)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
            position: 'relative',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: '#90caf9' }}>
                🎯 Current Player
              </h2>
              {currentPlayer && currentPlayer.category && currentPlayer.owner !== 'yes' && (
                <div style={{
                  padding: '0.4rem 0.8rem',
                  borderRadius: '0.5rem',
                  background: (currentPlayer.category || '').toLowerCase() === 'blue' 
                    ? 'rgba(25, 118, 210, 0.3)' 
                    : 'rgba(211, 47, 47, 0.3)',
                  border: (currentPlayer.category || '').toLowerCase() === 'blue'
                    ? '1px solid rgba(25, 118, 210, 0.6)'
                    : '1px solid rgba(211, 47, 47, 0.6)',
                  fontSize: '0.9rem',
                  fontWeight: 700,
                  color: '#fff',
                }}>
                  {(currentPlayer.category || '').toLowerCase() === 'blue' ? '🔵 BLUE' : '🔴 RED'}
                </div>
              )}
              {currentPlayer && currentPlayer.owner === 'yes' && (
                <div style={{
                  padding: 'clamp(0.3rem, 1.5vw, 0.5rem) clamp(0.6rem, 2vw, 1rem)',
                  borderRadius: '0.5rem',
                  background: 'rgba(255, 193, 7, 0.3)',
                  border: '1px solid rgba(255, 193, 7, 0.6)',
                  fontSize: 'clamp(0.75rem, 2vw, 0.95rem)',
                  fontWeight: 700,
                  color: '#ffc107',
                }}>
                  👤 OWNER
                </div>
              )}
            </div>
            {currentPlayer ? (
              <div className="player-content" style={{ display: 'flex', flexDirection: 'row', gap: '2rem', alignItems: 'flex-start', width: '100%' }}>
                {/* Player Photo - Left Side */}
                <div style={{
                  flex: '0 0 350px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <div style={{
                    width: '350px',
                    height: '450px',
                    borderRadius: '1rem',
                    overflow: 'hidden',
                    background: '#1a1f3a',
                    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
                    position: 'relative',
                  }}>
                    {currentPlayer.photo ? (
                      <img 
                        src={currentPlayer.photo} 
                        alt={currentPlayer.name} 
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        onError={(e) => {
                          // Try alternative format if current one fails
                          const img = e.currentTarget;
                          const src = img.src;
                          if (!src.includes('data:') && !img.dataset.retried) {
                            img.dataset.retried = 'true';
                            // Try different extensions
                            if (src.endsWith('.jpg')) {
                              img.src = src.replace('.jpg', '.png');
                            } else if (src.endsWith('.png')) {
                              img.src = src.replace('.png', '.jpeg');
                            } else if (src.endsWith('.jpeg')) {
                              img.src = src.replace('.jpeg', '.JPG');
                            } else {
                              img.style.display = 'none';
                            }
                          } else {
                            img.style.display = 'none';
                          }
                        }}
                      />
                    ) : (
                      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666', fontSize: '1.2rem' }}>
                        No Photo
                      </div>
                    )}
                    {liveData?.isSold && (
                      <div style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        background: 'rgba(34, 197, 94, 0.85)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 10,
                        gap: 'clamp(0.5rem, 2vw, 1rem)',
                        padding: 'clamp(0.5rem, 3vw, 1.5rem)',
                        boxSizing: 'border-box',
                        overflow: 'hidden',
                      }}>
                        <div style={{
                          fontSize: 'clamp(1.5rem, 5vw, 3rem)',
                          fontWeight: 900,
                          color: 'white',
                          textShadow: '2px 2px 4px rgba(0, 0, 0, 0.3)',
                          transform: 'rotate(-15deg)',
                          letterSpacing: 'clamp(1px, 0.3vw, 3px)',
                          textAlign: 'center',
                        }}>
                          SOLD
                        </div>
                        <div style={{
                          fontSize: 'clamp(0.7rem, 2vw, 1.2rem)',
                          fontWeight: 700,
                          color: 'white',
                          textShadow: '1px 1px 2px rgba(0, 0, 0, 0.3)',
                          textAlign: 'center',
                          lineHeight: 1.3,
                          maxWidth: '95%',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}>
                          {liveData.soldToTeam && <div style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>To {liveData.soldToTeam}</div>}
                          {liveData.soldAmount && (
                            <div style={{ fontSize: 'clamp(0.8rem, 2.5vw, 1.5rem)', marginTop: 'clamp(0.1rem, 0.5vw, 0.3rem)' }}>
                              {formatCurrency(liveData.soldAmount)}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Player Info - Right Side */}
                <div style={{ flex: '1', minWidth: 0, display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'flex-start', justifyContent: 'flex-start' }}>
                  <div style={{ fontSize: '2.2rem', fontWeight: 900, color: '#fff', lineHeight: 1.2, textShadow: '0 2px 10px rgba(25, 118, 210, 0.5)' }}>
                    {currentPlayer.name}
                  </div>
                  <div style={{ display: 'flex', gap: '1.5rem', fontSize: '1.2rem', flexWrap: 'wrap' }}>
                    <div><span style={{ color: '#90caf9' }}>Age:</span> <b>{currentPlayer.age}</b></div>
                    <div><span style={{ color: '#90caf9' }}>Flat:</span> <b>{currentPlayer.flat}</b></div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '1.1rem' }}>
                    <div><span style={{ color: '#90caf9' }}>Specialization:</span> <b>{currentPlayer.specialization}</b></div>
                    <div><span style={{ color: '#90caf9' }}>Availability:</span> <b>{currentPlayer.availability}</b></div>
                  </div>
                  <div style={{
                    marginTop: '0.5rem',
                    padding: '1rem',
                    background: 'rgba(255, 255, 255, 0.05)',
                    borderRadius: '0.5rem',
                    fontSize: '1.1rem',
                    lineHeight: 1.6,
                    color: '#e0e0e0',
                    width: '100%',
                    height: '120px',
                    overflow: 'hidden',
                    position: 'relative',
                  }}>
                    {/* Vertical marquee for long descriptions */}
                    <div style={{
                      animation: (currentPlayer.description || '').length > 150 ? 'scrollUp 12s linear infinite' : 'none',
                      animationDelay: '2s',
                    }}>
                      {currentPlayer.description || 'No description available'}
                    </div>
                    <style>{`
                      @keyframes scrollUp {
                        0%, 15% { transform: translateY(0); }
                        85%, 100% { transform: translateY(calc(-100% + 100px)); }
                      }
                    `}</style>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '2rem', color: '#666', fontSize: '1.2rem' }}>
                No player currently being auctioned
              </div>
            )}
          </div>

          {/* RIGHT: Team Summary Panel */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.08)',
            borderRadius: '1rem',
            padding: '1rem',
            backdropFilter: 'blur(10px)',
            border: '2px solid rgba(255, 255, 255, 0.1)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}>
            <h2 style={{ margin: '0 0 0.75rem 0', fontSize: '1.3rem', fontWeight: 700, color: '#fff' }}>
              🏆 Team Standings
            </h2>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {(teamRosterData.length > 0 ? teamRosterData : teamBalances.map(team => {
                const acquired = team.acquired || 0;
                const totalSpent = auctionLog.filter(log => log.team === team.name && log.status === 'Sold').reduce((sum, log) => sum + (typeof log.amount === 'number' ? log.amount : 0), 0);
                const totalPurse = totalSpent + team.balance;
                const blueBudget = Math.floor((blueCapPercent / 100) * totalPurse);
                const blueSpent = getBlueSpentByTeam(team.name);
                const blueLeft = Math.max(0, blueBudget - blueSpent);
                return { name: team.name, logo: team.logo, acquired, balance: team.balance, blueLeft, isFull: acquired >= maxPlayersPerTeam, isComplete: acquired >= minPlayersPerTeam };
              })).map((roster: any, idx: number) => {
                return (
                  <div key={roster.name} style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr auto auto auto',
                    gap: '0.5rem',
                    alignItems: 'center',
                    padding: '0.6rem 0.5rem',
                    borderBottom: idx < teamBalances.length - 1 ? '1px solid rgba(255,255,255,0.1)' : 'none',
                    background: roster.isFull ? 'rgba(76, 175, 80, 0.1)' : 'transparent',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                      {roster.logo && <img src={roster.logo} alt="" style={{ width: '24px', height: '24px', objectFit: 'contain', borderRadius: '4px' }} />}
                      <span style={{ fontWeight: 700, fontSize: '1rem', color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{roster.name}</span>
                      {roster.isFull && <span style={{ fontSize: '0.7rem', background: '#4caf50', padding: '2px 6px', borderRadius: '4px' }}>FULL</span>}
                    </div>
                    <div style={{ textAlign: 'right', minWidth: '50px' }}>
                      <div style={{ fontSize: '0.75rem', color: '#aaa' }}>Players</div>
                      <div style={{ fontSize: '1rem', fontWeight: 700, color: roster.isComplete ? '#81c784' : '#fff' }}>{roster.acquired}/{maxPlayersPerTeam}</div>
                    </div>
                    <div style={{ textAlign: 'right', minWidth: '70px' }}>
                      <div style={{ fontSize: '0.75rem', color: '#aaa' }}>Purse</div>
                      <div style={{ fontSize: '1rem', fontWeight: 700, color: '#90caf9' }}>{formatCurrency(roster.balance)}</div>
                    </div>
                    <div style={{ textAlign: 'right', minWidth: '70px' }}>
                      <div style={{ fontSize: '0.75rem', color: '#aaa' }}>🔵 Blue</div>
                      <div style={{ fontSize: '1rem', fontWeight: 700, color: roster.blueLeft < 500 ? '#ffab00' : '#64b5f6' }}>{formatCurrency(roster.blueLeft)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Detailed Team Roster - Same as Auction View */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.08)',
          borderRadius: '1rem',
          padding: '1.25rem',
          backdropFilter: 'blur(10px)',
          border: '2px solid rgba(255, 255, 255, 0.1)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
          maxWidth: '1500px',
          margin: '0 auto',
          width: '100%',
        }}>
          <h2 style={{ margin: '0 0 1rem 0', fontSize: '1.5rem', fontWeight: 700, color: '#fff' }}>
            📊 Team Roster
          </h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.95rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid rgba(255, 255, 255, 0.2)' }}>
                  <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: 700, color: '#90caf9' }}>Team</th>
                  <th style={{ padding: '0.75rem', textAlign: 'center', fontWeight: 700, color: '#90caf9' }}>Players</th>
                  <th style={{ padding: '0.75rem', textAlign: 'center', fontWeight: 700, color: '#ff9800' }}>Needed</th>
                  <th style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 700, color: '#ef5350' }}>Spent</th>
                  <th style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 700, color: '#90caf9' }}>Balance</th>
                  <th style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 700, color: '#64b5f6' }}>🔵 Blue Left</th>
                  <th style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 700, color: '#81c784' }}>Max Bid</th>
                  <th style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 700, color: '#ce93d8' }}>Min Reserve</th>
                  <th style={{ padding: '0.75rem', textAlign: 'center', fontWeight: 700, color: '#90caf9' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {(teamRosterData.length > 0 ? teamRosterData : teamBalances.map(team => {
                  const acquired = team.acquired || 0;
                  const needed = Math.max(0, minPlayersPerTeam - acquired);
                  const totalSpent = auctionLog.filter(log => log.team === team.name && log.status === 'Sold').reduce((sum, log) => sum + (typeof log.amount === 'number' ? log.amount : 0), 0);
                  const totalPurse = totalSpent + team.balance;
                  const blueBudget = Math.floor((blueCapPercent / 100) * totalPurse);
                  const blueSpent = getBlueSpentByTeam(team.name);
                  const blueLeft = Math.max(0, blueBudget - blueSpent);
                  const minNeeded = needed <= 1 ? 0 : (needed - 1) * 100000;
                  const maxBidUnits = Math.max(0, team.balance - minNeeded);
                  const isAtRisk = acquired > 0 && team.balance < minNeeded && needed > 1;
                  return { 
                    name: team.name, 
                    logo: team.logo, 
                    acquired, 
                    needed,
                    totalSpent,
                    balance: team.balance, 
                    blueLeft, 
                    maxBidUnits,
                    minNeeded,
                    isAtRisk,
                    isFull: acquired >= maxPlayersPerTeam, 
                    isComplete: acquired >= minPlayersPerTeam 
                  };
                })).map((roster: any, idx: number) => {
                  // Get players for this team from auction log
                  const teamPlayers = auctionLog
                    .filter(log => log.team === roster.name && log.status === 'Sold')
                    .map(log => ({
                      name: log.playerName,
                      amount: log.amount as number,
                      category: log.category || 'Unknown'
                    }));
                  
                  return (
                    <React.Fragment key={roster.name}>
                      <tr style={{
                        background: roster.isAtRisk ? 'rgba(244, 67, 54, 0.15)' : idx % 2 === 0 ? 'rgba(255, 255, 255, 0.03)' : 'transparent',
                        borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                      }}>
                        <td style={{ padding: '0.75rem', fontWeight: 700, color: '#fff' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            {roster.logo && <img src={roster.logo} alt={roster.name} style={{ width: '28px', height: '28px', objectFit: 'contain', borderRadius: '4px' }} />}
                            <span>{roster.name}</span>
                          </div>
                        </td>
                        <td style={{ padding: '0.75rem', textAlign: 'center', fontWeight: 600, color: roster.isFull ? '#9e9e9e' : roster.isComplete ? '#81c784' : '#fff' }}>
                          {roster.acquired}/{maxPlayersPerTeam}
                        </td>
                        <td style={{ padding: '0.75rem', textAlign: 'center', fontWeight: 600 }}>
                          {roster.needed > 0 ? (
                            <span style={{ background: '#ff9800', color: '#000', padding: '2px 8px', borderRadius: '10px', fontSize: '0.85em' }}>{roster.needed}</span>
                          ) : (
                            <span style={{ color: '#81c784' }}>✓</span>
                          )}
                        </td>
                        <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 600, color: '#ef5350' }}>{formatCurrency(roster.totalSpent)}</td>
                        <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 600, color: '#90caf9' }}>{formatCurrency(roster.balance)}</td>
                        <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 600, color: roster.blueLeft < 500000 ? '#ffab00' : '#64b5f6' }}>{formatCurrency(roster.blueLeft)}</td>
                        <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 600, color: '#81c784' }}>{roster.isFull ? '—' : formatCurrency(roster.maxBidUnits)}</td>
                        <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 600, color: '#ce93d8' }}>{roster.isFull || roster.needed === 0 ? '—' : formatCurrency(roster.minNeeded)}</td>
                        <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                          {roster.isAtRisk && <span style={{ background: '#f44336', color: '#fff', padding: '2px 8px', borderRadius: '10px', fontSize: '0.8em' }}>⚠️ At Risk</span>}
                          {roster.isFull && <span style={{ background: 'linear-gradient(135deg, #ffd700, #ff8c00)', color: '#fff', padding: '2px 8px', borderRadius: '10px', fontSize: '0.8em' }}>🏆 Full</span>}
                          {!roster.isFull && roster.isComplete && <span style={{ background: '#4caf50', color: '#fff', padding: '2px 8px', borderRadius: '10px', fontSize: '0.8em' }}>✓ Complete</span>}
                          {!roster.isAtRisk && !roster.isFull && !roster.isComplete && <span style={{ background: '#2196f3', color: '#fff', padding: '2px 8px', borderRadius: '10px', fontSize: '0.8em' }}>In Progress</span>}
                        </td>
                      </tr>
                      {/* Expandable player list */}
                      {teamPlayers.length > 0 && (
                        <tr style={{ background: 'rgba(255, 255, 255, 0.02)' }}>
                          <td colSpan={9} style={{ padding: '0.5rem 0.75rem 0.75rem 3rem' }}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                              {teamPlayers.map((player, pIdx) => (
                                <div key={pIdx} style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.5rem',
                                  padding: '0.4rem 0.75rem',
                                  borderRadius: '15px',
                                  fontSize: '0.85rem',
                                  fontWeight: 600,
                                  background: player.category.toLowerCase() === 'blue' 
                                    ? 'linear-gradient(135deg, #1565c0, #1976d2)' 
                                    : player.category.toLowerCase() === 'red'
                                    ? 'linear-gradient(135deg, #c62828, #e53935)'
                                    : '#424242',
                                  color: 'white',
                                  boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                                }}>
                                  <span style={{ maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{player.name}</span>
                                  <span style={{ padding: '2px 6px', borderRadius: '8px', background: 'rgba(255, 255, 255, 0.25)', fontSize: '0.75rem', fontWeight: 700 }}>
                                    {formatCurrency(player.amount)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recently Sold Players - Vertical Scroll (All Players) */}
        <div className="recently-sold-section" style={{
          background: 'rgba(255, 255, 255, 0.08)',
          borderRadius: '1rem',
          padding: '1rem',
          backdropFilter: 'blur(10px)',
          border: '2px solid rgba(76, 175, 80, 0.3)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
          maxWidth: '1500px',
          margin: '0 auto',
          width: '100%',
        }}>
          <h2 style={{ margin: '0 0 0.75rem 0', fontSize: '1.3rem', fontWeight: 700, color: '#81c784' }}>
            ✅ Recently Sold ({soldPlayersList.length})
          </h2>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
            maxHeight: '400px',
            overflowY: 'auto',
            paddingRight: '0.5rem',
          }}>
            {soldPlayersList.length === 0 ? (
              <div style={{ padding: '1rem', color: '#666' }}>No players sold yet</div>
            ) : soldPlayersList.map((log, idx) => {
              const amount = typeof log.amount === 'number' ? log.amount : 0;
              const displayAmount = formatCurrency(amount);
              const isBlue = log.category && log.category.toLowerCase() === 'blue';
              return (
                <div key={idx} style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto auto',
                  alignItems: 'center',
                  gap: '1rem',
                  background: isBlue ? 'rgba(25, 118, 210, 0.15)' : 'rgba(211, 47, 47, 0.15)',
                  border: isBlue ? '1px solid rgba(25, 118, 210, 0.4)' : '1px solid rgba(211, 47, 47, 0.4)',
                  padding: '0.6rem 1rem',
                  borderRadius: '0.5rem',
                }}>
                  <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {isBlue ? '🔵' : '🔴'} {log.playerName}
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#b0d4f1', whiteSpace: 'nowrap' }}>→ {log.team}</div>
                  <div style={{ fontSize: '1rem', fontWeight: 900, color: '#81c784', whiteSpace: 'nowrap' }}>{displayAmount}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Unsold Players - Compact horizontal section */}
        {unsoldPlayersList.length > 0 && (
          <div style={{
            background: 'rgba(255, 255, 255, 0.08)',
            borderRadius: '1rem',
            padding: '1rem',
            backdropFilter: 'blur(10px)',
            border: '2px solid rgba(255, 152, 0, 0.3)',
            maxWidth: '1500px',
            margin: '0 auto',
            width: '100%',
          }}>
            <h2 style={{ margin: '0 0 0.75rem 0', fontSize: '1.3rem', fontWeight: 700, color: '#ffb74d' }}>
              ⏳ Unsold - Round 2 ({unsoldPlayersList.length})
            </h2>
            <div style={{
              display: 'flex',
              gap: '0.75rem',
              overflowX: 'auto',
              paddingBottom: '0.5rem',
              WebkitOverflowScrolling: 'touch',
            }}>
              {unsoldPlayersList.slice(0, 15).map((log, idx) => (
                <div key={idx} style={{
                  flex: '0 0 150px',
                  background: 'rgba(255, 152, 0, 0.2)',
                  border: '1px solid rgba(255, 152, 0, 0.4)',
                  padding: '0.6rem',
                  borderRadius: '0.5rem',
                }}>
                  <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    ⏳ {log.playerName}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#ffb74d', marginTop: '0.25rem' }}>Attempt {log.attempt}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
