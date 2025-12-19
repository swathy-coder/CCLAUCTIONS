import React, { useState, useEffect } from 'react';
import './AudienceView.css';
import type { Player, Team } from './AuctionScreen';
import { subscribeToAuctionUpdates, loadAuctionStateOnline } from '../src/firebase';
import LogoImage from '../LOGO 2.png';

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
  soldPlayers: propSoldPlayers = [],
  teamBalances: propTeamBalances = [],
  auctionLog: propAuctionLog = [],
  round: propRound = 1,
  auctionId,
}: AudienceViewProps) {
  const urlParams = new URLSearchParams(window.location.search);
  const isStandaloneView = urlParams.get('audienceView') === 'true';
  // Get auctionId from URL first, then props, then localStorage fallback
  const effectiveAuctionId = urlParams.get('auction') || auctionId || localStorage.getItem('current_auction_id');
  console.log('AudienceView rendered. isStandaloneView:', isStandaloneView, 'effectiveAuctionId:', effectiveAuctionId);
  
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

  // Subscribe to real-time Firebase updates when in standalone mode OR when we have an auction ID
  useEffect(() => {
    if (effectiveAuctionId) {
      console.log('🔥 AudienceView: Subscribing to Firebase for:', effectiveAuctionId, 'isStandaloneView:', isStandaloneView);
      
      let updateCount = 0;
      
      // Subscribe to real-time updates from Firebase
      const unsubscribe = subscribeToAuctionUpdates(effectiveAuctionId, (data) => {
        updateCount++;
        console.log(`🔥 AudienceView: Firebase update #${updateCount} received:`, {
          currentPlayer: (data as any)?.currentPlayer?.name,
          logEntries: (data as any)?.auctionLog?.length,
          round: (data as any)?.round,
          hasPhotos: !!(data as any)?.currentPlayer?.photo
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
  }, [effectiveAuctionId]);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Poll localStorage for updates (for more frequent updates than Firebase)
  useEffect(() => {
    if (effectiveAuctionId) {
      const pollInterval = setInterval(() => {
        try {
          const stored = localStorage.getItem(`auction_${effectiveAuctionId}`);
          if (stored) {
            const data = JSON.parse(stored);
            setLiveData(data);
            console.log('📡 AudienceView polled localStorage - got', data.auctionLog?.length || 0, 'log entries, currentPlayer:', data.currentPlayer?.name);
          }
        } catch (e) {
          console.error('AudienceView poll error:', e);
        }
      }, 200); // Poll every 200ms for responsive updates

      return () => clearInterval(pollInterval);
    }
  }, [effectiveAuctionId]);

  // Poll Firebase for updates (for cross-device sync when localStorage is stale)
  useEffect(() => {
    if (effectiveAuctionId) {
      const firebasePollInterval = setInterval(async () => {
        try {
          const data = await loadAuctionStateOnline(effectiveAuctionId);
          if (data) {
            console.log('🔥 AudienceView polled Firebase - got', (data as any)?.auctionLog?.length || 0, 'log entries');
            setLiveData(data as typeof liveData);
          }
        } catch (e) {
          // Silently fail - Firebase polling is backup
        }
      }, 1000); // Poll Firebase every 1 second for less bandwidth

      return () => clearInterval(firebasePollInterval);
    }
  }, [effectiveAuctionId]);
  
  // Use live data if available, otherwise use props
  const currentPlayer = liveData?.currentPlayer ?? propCurrentPlayer;
  const soldPlayers = liveData?.soldPlayers ?? propSoldPlayers;
  const teamBalances = liveData?.teamBalances ?? propTeamBalances;
  const auctionLog = liveData?.auctionLog ?? propAuctionLog;
  const round = liveData?.round ?? propRound;
  const blueCapPercent = liveData?.blueCapPercent ?? 65;
  const allPlayers = liveData?.players ?? [];
  const teamRosterData = liveData?.teamRosterData ?? [];
  const minPlayersPerTeam = liveData?.minPlayersPerTeam ?? 6;
  const maxPlayersPerTeam = liveData?.maxPlayersPerTeam ?? 12;

  // State for tracking expanded team rows
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set());

  // Toggle team row expansion
  const toggleTeamExpansion = (teamName: string) => {
    setExpandedTeams(prev => {
      const newSet = new Set(prev);
      if (newSet.has(teamName)) {
        newSet.delete(teamName);
      } else {
        newSet.add(teamName);
      }
      return newSet;
    });
  };

  // Get players purchased by a team
  const getTeamPlayers = (teamName: string) => {
    return auctionLog
      .filter((log: AuctionLogEntry) => log.team === teamName && log.status === 'Sold')
      .map((log: AuctionLogEntry) => ({
        name: log.playerName,
        amount: log.amount as number,
        category: log.category || 'Unknown'
      }));
  };

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

  const soldPlayersList = soldPlayers;

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
      `}</style>
      
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

        {/* Current Player Card - Full Width */}
        <div style={{
          marginBottom: '1rem',
          width: '100%',
          maxWidth: '1500px',
          margin: '0 auto 1rem auto',
        }}>
          {/* Current Player Card */}
          <div className="current-player-card" style={{
            background: 'rgba(255, 255, 255, 0.08)',
            borderRadius: '1rem',
            padding: '1.5rem',
            backdropFilter: 'blur(10px)',
            width: '1500px',
            maxWidth: '100%',
            margin: '0 auto',
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
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <h2 style={{ margin: 0, fontSize: 'clamp(1.2rem, 3vw, 1.8rem)', fontWeight: 700, color: '#90caf9' }}>
                🎯 Current Player
              </h2>
              {currentPlayer && currentPlayer.category && currentPlayer.owner !== 'yes' && (
                <div style={{
                  padding: 'clamp(0.3rem, 1.5vw, 0.5rem) clamp(0.6rem, 2vw, 1rem)',
                  borderRadius: '0.5rem',
                  background: (currentPlayer.category || '').toLowerCase() === 'blue' 
                    ? 'rgba(25, 118, 210, 0.3)' 
                    : 'rgba(211, 47, 47, 0.3)',
                  border: (currentPlayer.category || '').toLowerCase() === 'blue'
                    ? '1px solid rgba(25, 118, 210, 0.6)'
                    : '1px solid rgba(211, 47, 47, 0.6)',
                  fontSize: 'clamp(0.75rem, 2vw, 0.95rem)',
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
                  flex: '0 0 300px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <div style={{
                    width: '300px',
                    height: '400px',
                    borderRadius: '1rem',
                    overflow: 'hidden',
                    background: '#1a1f3a',
                    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
                    position: 'relative',
                  }}>
                    {currentPlayer.photo ? (
                      <img src={currentPlayer.photo} alt={currentPlayer.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
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
                              {`₹${liveData.soldAmount >= 1000 ? `${(liveData.soldAmount / 1000).toFixed(2)} Cr` : `${(liveData.soldAmount / 10).toFixed(1)} L`}`}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Player Info - Right Side */}
                <div style={{ flex: '1', minWidth: 0, display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'flex-start', justifyContent: 'flex-start' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.5rem', width: '100%' }}>
                    <div style={{ fontSize: '2.5rem', fontWeight: 900, color: '#fff', lineHeight: 1.2, textShadow: '0 2px 10px rgba(25, 118, 210, 0.5)', textAlign: 'left' }}>
                      {currentPlayer.name}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '2rem', fontSize: '1.2rem', justifyContent: 'flex-start', flexWrap: 'wrap' }}>
                    <div><span style={{ color: '#90caf9' }}>Age:</span> <b>{currentPlayer.age}</b></div>
                    <div><span style={{ color: '#90caf9' }}>Flat:</span> <b>{currentPlayer.flat}</b></div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '1.1rem', width: '100%', textAlign: 'left' }}>
                    <div><span style={{ color: '#90caf9' }}>Specialization:</span> <b>{currentPlayer.specialization}</b></div>
                    <div><span style={{ color: '#90caf9' }}>Availability:</span> <b>{currentPlayer.availability}</b></div>
                  </div>
                  <div style={{
                    marginTop: '1rem',
                    padding: '1.5rem',
                    background: 'rgba(255, 255, 255, 0.05)',
                    borderRadius: '0.75rem',
                    fontSize: '1.3rem',
                    lineHeight: 1.6,
                    color: '#e0e0e0',
                    textAlign: 'left',
                    display: '-webkit-box',
                    WebkitLineClamp: 5,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                    wordWrap: 'break-word',
                    overflowWrap: 'break-word',
                    width: '100%',
                  }}>
                    {currentPlayer.description || 'No description available'}
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: 'clamp(2rem, 5vw, 3rem)', color: '#666', fontSize: 'clamp(1rem, 3vw, 1.5rem)' }}>
                No player currently being auctioned
              </div>
            )}
          </div>
        </div>

        {/* Auction Stats - Full Width */}
        <div style={{
          marginBottom: 'clamp(1rem, 2vw, 1.5rem)',
          gridColumn: '1',
          gridRow: '4',
        }}>
          <div className="auction-stats-card" style={{
            background: 'rgba(255, 255, 255, 0.08)',
            borderRadius: '1.5rem',
            padding: 'clamp(0.75rem, 2vw, 1.25rem)',
            backdropFilter: 'blur(10px)',
            border: '2px solid rgba(76, 175, 80, 0.3)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
            maxWidth: '100%',
            overflow: 'hidden',
          }}>
            <h2 style={{ margin: '0 0 clamp(0.75rem, 1.5vw, 1rem) 0', fontSize: 'clamp(1rem, 2.5vw, 1.5rem)', fontWeight: 700, color: '#81c784' }}>
              📊 Auction Statistics
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 'clamp(0.5rem, 1.5vw, 1rem)' }}>
              <div style={{
                background: 'rgba(25, 118, 210, 0.2)',
                padding: 'clamp(0.5rem, 2vw, 0.75rem)',
                borderRadius: '0.75rem',
                textAlign: 'center',
                border: '1px solid rgba(25, 118, 210, 0.3)',
              }}>
                <div style={{ fontSize: 'clamp(1.5rem, 4vw, 2rem)', fontWeight: 900, color: '#90caf9' }}>
                  {soldPlayersList.length}
                </div>
                <div style={{ fontSize: 'clamp(0.75rem, 1.8vw, 0.95rem)', color: '#90caf9', fontWeight: 600, marginTop: '0.25rem' }}>
                  Players Sold
                </div>
              </div>
              <div style={{
                background: 'rgba(244, 67, 54, 0.2)',
                padding: 'clamp(0.5rem, 2vw, 0.75rem)',
                borderRadius: '0.75rem',
                textAlign: 'center',
                border: '1px solid rgba(244, 67, 54, 0.3)',
              }}>
                <div style={{ fontSize: 'clamp(1.5rem, 4vw, 2rem)', fontWeight: 900, color: '#ef5350' }}>
                  {auctionLog.filter(log => log.status === 'Unsold').length}
                </div>
                <div style={{ fontSize: 'clamp(0.75rem, 1.8vw, 0.95rem)', color: '#ef5350', fontWeight: 600, marginTop: '0.25rem' }}>
                  Players Unsold
                </div>
              </div>
              <div style={{
                background: 'rgba(255, 152, 0, 0.2)',
                padding: 'clamp(0.5rem, 2vw, 0.75rem)',
                borderRadius: '0.75rem',
                textAlign: 'center',
                border: '1px solid rgba(255, 152, 0, 0.3)',
              }}>
                <div style={{ fontSize: 'clamp(1.5rem, 4vw, 2rem)', fontWeight: 900, color: '#ffb74d' }}>
                  {teamBalances.length}
                </div>
                <div style={{ fontSize: 'clamp(0.75rem, 1.8vw, 0.95rem)', color: '#ffb74d', fontWeight: 600, marginTop: '0.25rem' }}>
                  Teams
                </div>
              </div>
              <div style={{
                background: 'rgba(156, 39, 176, 0.2)',
                padding: 'clamp(0.5rem, 2vw, 0.75rem)',
                borderRadius: '0.75rem',
                textAlign: 'center',
                border: '1px solid rgba(156, 39, 176, 0.3)',
              }}>
                <div style={{ fontSize: 'clamp(1.5rem, 4vw, 2rem)', fontWeight: 900, color: '#ba68c8' }}>
                  {round}
                </div>
                <div style={{ fontSize: 'clamp(0.75rem, 1.8vw, 0.95rem)', color: '#ba68c8', fontWeight: 600, marginTop: '0.25rem' }}>
                  Current Round
                </div>
              </div>
            </div>
            {/* Total Money Spent */}
            <div style={{
              marginTop: 'clamp(0.5rem, 1.5vw, 1rem)',
              background: 'rgba(76, 175, 80, 0.2)',
              padding: 'clamp(0.5rem, 2vw, 0.75rem)',
              borderRadius: '0.75rem',
              textAlign: 'center',
              border: '1px solid rgba(76, 175, 80, 0.3)',
            }}>
                <div style={{ fontSize: 'clamp(1.25rem, 4vw, 2rem)', fontWeight: 900, color: '#81c784' }}>
                  ₹{(() => {
                    const total = soldPlayersList.reduce((sum, log) => sum + (typeof log.amount === 'number' ? log.amount : 0), 0);
                    return total >= 1000 ? `${(total / 1000).toFixed(2)} Cr` : `${(total / 10).toFixed(1)} L`;
                  })()}
                </div>
              <div style={{ fontSize: 'clamp(0.75rem, 1.8vw, 0.95rem)', color: '#81c784', fontWeight: 600, marginTop: '0.25rem' }}>
                Total Money Spent
              </div>
            </div>
            {/* Max Bid Stat */}
            <div style={{ marginTop: 'clamp(0.5rem, 1.5vw, 1rem)' }}>
              <div style={{
                background: 'rgba(255, 193, 7, 0.2)',
                padding: 'clamp(0.5rem, 2vw, 0.75rem)',
                borderRadius: '0.75rem',
                textAlign: 'center',
                border: '1px solid rgba(255, 193, 7, 0.3)',
              }}>
                <div style={{ fontSize: 'clamp(1.25rem, 3.5vw, 1.75rem)', fontWeight: 900, color: '#ffd54f' }}>
                  {(() => {
                    const maxBid = soldPlayersList.reduce((max, log) => {
                      const amount = typeof log.amount === 'number' ? log.amount : 0;
                      return amount > max ? amount : max;
                    }, 0);
                    return maxBid > 0 ? `₹${maxBid >= 1000 ? `${(maxBid / 1000).toFixed(2)} Cr` : `${(maxBid / 10).toFixed(1)} L`}` : 'N/A';
                  })()}
                </div>
                <div style={{ fontSize: 'clamp(0.75rem, 1.8vw, 0.95rem)', color: '#ffd54f', fontWeight: 600, marginTop: '0.25rem' }}>
                  Highest Bid
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Team Rosters Section - Full Width */}
        <div className="team-rosters-section" style={{
          background: 'rgba(255, 255, 255, 0.08)',
          borderRadius: '1.5rem',
          padding: 'clamp(1rem, 2vw, 1.5rem)',
          backdropFilter: 'blur(10px)',
          border: '2px solid rgba(255, 255, 255, 0.1)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
          marginBottom: 'clamp(1rem, 2vw, 1.5rem)',
          gridColumn: '1',
          gridRow: '3',
          overflow: 'auto',
        }}>
          <h2 style={{ margin: '0 0 1.5rem 0', fontSize: 'clamp(1.2rem, 3vw, 1.8rem)', fontWeight: 700, color: '#fff' }}>
            🏆 Team Rosters
          </h2>
          <div style={{ width: '100%', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'clamp(0.8rem, 1.8vw, 1rem)' }}>
              <thead>
                <tr style={{ background: 'rgba(255, 255, 255, 0.1)' }}>
                  <th style={{ padding: 'clamp(0.4rem, 1.5vw, 0.8rem)', textAlign: 'left', fontWeight: 700, color: '#90caf9', borderBottom: '2px solid rgba(255, 255, 255, 0.2)', whiteSpace: 'nowrap' }}>Team</th>
                  <th style={{ padding: 'clamp(0.4rem, 1.5vw, 0.8rem)', textAlign: 'center', fontWeight: 700, color: '#90caf9', borderBottom: '2px solid rgba(255, 255, 255, 0.2)', whiteSpace: 'nowrap' }}>Players</th>
                  <th style={{ padding: 'clamp(0.4rem, 1.5vw, 0.8rem)', textAlign: 'center', fontWeight: 700, color: '#ff9800', borderBottom: '2px solid rgba(255, 255, 255, 0.2)', whiteSpace: 'nowrap' }}>Need</th>
                  <th style={{ padding: 'clamp(0.4rem, 1.5vw, 0.8rem)', textAlign: 'right', fontWeight: 700, color: '#ef5350', borderBottom: '2px solid rgba(255, 255, 255, 0.2)', whiteSpace: 'nowrap' }}>Spent</th>
                  <th style={{ padding: 'clamp(0.4rem, 1.5vw, 0.8rem)', textAlign: 'right', fontWeight: 700, color: '#90caf9', borderBottom: '2px solid rgba(255, 255, 255, 0.2)', whiteSpace: 'nowrap' }}>Balance</th>
                  <th style={{ padding: 'clamp(0.4rem, 1.5vw, 0.8rem)', textAlign: 'right', fontWeight: 700, color: '#64b5f6', borderBottom: '2px solid rgba(255, 255, 255, 0.2)', whiteSpace: 'nowrap' }}>🔵 Blue Left</th>
                  <th style={{ padding: 'clamp(0.4rem, 1.5vw, 0.8rem)', textAlign: 'right', fontWeight: 700, color: '#81c784', borderBottom: '2px solid rgba(255, 255, 255, 0.2)', whiteSpace: 'nowrap' }}>Max Bid</th>
                  <th style={{ padding: 'clamp(0.4rem, 1.5vw, 0.8rem)', textAlign: 'right', fontWeight: 700, color: '#ce93d8', borderBottom: '2px solid rgba(255, 255, 255, 0.2)', whiteSpace: 'nowrap' }}>Reserve</th>
                  <th style={{ padding: 'clamp(0.4rem, 1.5vw, 0.8rem)', textAlign: 'center', fontWeight: 700, color: '#90caf9', borderBottom: '2px solid rgba(255, 255, 255, 0.2)', whiteSpace: 'nowrap' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {(teamRosterData.length > 0 ? teamRosterData : teamBalances.map(team => {
                  // Fallback calculation if teamRosterData not available
                  const acquired = team.acquired || 0;
                  const needed = Math.max(0, minPlayersPerTeam - acquired);
                  const totalSpent = auctionLog.filter(log => log.team === team.name && log.status === 'Sold').reduce((sum, log) => sum + (typeof log.amount === 'number' ? log.amount : 0), 0);
                  const totalPurse = totalSpent + team.balance;
                  const blueBudget = Math.floor((blueCapPercent / 100) * totalPurse);
                  const blueSpent = getBlueSpentByTeam(team.name);
                  const blueLeft = Math.max(0, blueBudget - blueSpent);
                  const minNeeded = needed <= 1 ? 0 : (needed - 1) * 100;
                  const maxBidUnits = Math.max(0, team.balance - minNeeded);
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
                    isAtRisk: acquired > 0 && team.balance < minNeeded && needed > 1,
                    isFull: acquired >= maxPlayersPerTeam,
                    isComplete: acquired >= minPlayersPerTeam,
                  };
                })).map((roster: { name: string; logo?: string; acquired: number; needed: number; totalSpent: number; balance: number; blueLeft: number; maxBidUnits: number; minNeeded: number; isAtRisk: boolean; isFull: boolean; isComplete: boolean }, idx: number) => {
                  const formatCurrency = (units: number) => units >= 1000 ? `₹${(units / 1000).toFixed(2)} Cr` : `₹${(units / 10).toFixed(1)} L`;
                  const isBlueCapLow = roster.blueLeft < (roster.blueLeft + (auctionLog.filter(log => log.team === roster.name && log.status === 'Sold').reduce((sum, log) => sum + (typeof log.amount === 'number' ? log.amount : 0), 0))) * 0.2;
                  const teamPlayers = getTeamPlayers(roster.name);
                  const isExpanded = expandedTeams.has(roster.name);
                  
                  return (
                    <React.Fragment key={roster.name}>
                      <tr 
                        style={{
                          background: roster.isAtRisk ? 'rgba(244, 67, 54, 0.15)' : (idx % 2 === 0 ? 'rgba(255, 255, 255, 0.03)' : 'transparent'),
                          borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                          cursor: roster.acquired > 0 ? 'pointer' : 'default',
                        }}
                        onClick={() => roster.acquired > 0 && toggleTeamExpansion(roster.name)}
                      >
                        <td style={{ padding: 'clamp(0.4rem, 1.5vw, 0.8rem)', fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ fontSize: '10px', color: '#888', width: '12px', marginRight: '4px' }}>
                              {roster.acquired > 0 ? (isExpanded ? '▼' : '▶') : ''}
                            </span>
                            {roster.logo && (
                              <img src={roster.logo} alt={roster.name} style={{ width: 'clamp(24px, 3vw, 32px)', height: 'clamp(24px, 3vw, 32px)', objectFit: 'contain', borderRadius: '4px' }} />
                            )}
                            <span>{roster.name}</span>
                          </div>
                        </td>
                        <td style={{ padding: 'clamp(0.4rem, 1.5vw, 0.8rem)', textAlign: 'center', fontWeight: 600, color: roster.isFull ? '#9e9e9e' : (roster.isComplete ? '#81c784' : '#fff'), whiteSpace: 'nowrap' }}>
                          {roster.acquired}/{maxPlayersPerTeam}
                        </td>
                        <td style={{ padding: 'clamp(0.4rem, 1.5vw, 0.8rem)', textAlign: 'center', fontWeight: 600, whiteSpace: 'nowrap' }}>
                          {roster.needed > 0 ? (
                            <span style={{ background: '#ff9800', color: '#000', padding: '2px 8px', borderRadius: '10px', fontSize: '0.85em' }}>{roster.needed}</span>
                          ) : (
                            <span style={{ color: '#81c784' }}>✓</span>
                          )}
                        </td>
                        <td style={{ padding: 'clamp(0.4rem, 1.5vw, 0.8rem)', textAlign: 'right', fontWeight: 600, color: '#ef5350', whiteSpace: 'nowrap' }}>
                          {formatCurrency(roster.totalSpent)}
                        </td>
                        <td style={{ padding: 'clamp(0.4rem, 1.5vw, 0.8rem)', textAlign: 'right', fontWeight: 600, color: '#90caf9', whiteSpace: 'nowrap' }}>
                          {formatCurrency(roster.balance)}
                        </td>
                        <td style={{ padding: 'clamp(0.4rem, 1.5vw, 0.8rem)', textAlign: 'right', fontWeight: 600, color: isBlueCapLow ? '#ffab00' : '#64b5f6', whiteSpace: 'nowrap' }}>
                          {formatCurrency(roster.blueLeft)}
                        </td>
                        <td style={{ padding: 'clamp(0.4rem, 1.5vw, 0.8rem)', textAlign: 'right', fontWeight: 600, color: '#81c784', whiteSpace: 'nowrap' }}>
                          {roster.isFull ? '—' : formatCurrency(roster.maxBidUnits)}
                        </td>
                        <td style={{ padding: 'clamp(0.4rem, 1.5vw, 0.8rem)', textAlign: 'right', fontWeight: 600, color: '#ce93d8', whiteSpace: 'nowrap' }}>
                          {roster.isFull || roster.needed === 0 ? '—' : formatCurrency(roster.minNeeded)}
                        </td>
                        <td style={{ padding: 'clamp(0.4rem, 1.5vw, 0.8rem)', textAlign: 'center', whiteSpace: 'nowrap' }}>
                          {roster.isAtRisk && <span style={{ background: '#f44336', color: '#fff', padding: '2px 8px', borderRadius: '10px', fontSize: '0.8em' }}>⚠️ At Risk</span>}
                          {roster.isFull && <span style={{ background: 'linear-gradient(135deg, #ffd700, #ff8c00)', color: '#fff', padding: '2px 8px', borderRadius: '10px', fontSize: '0.8em' }}>🏆 Full</span>}
                          {!roster.isFull && roster.isComplete && <span style={{ background: '#4caf50', color: '#fff', padding: '2px 8px', borderRadius: '10px', fontSize: '0.8em' }}>✓</span>}
                          {!roster.isAtRisk && !roster.isFull && !roster.isComplete && <span style={{ background: '#2196f3', color: '#fff', padding: '2px 8px', borderRadius: '10px', fontSize: '0.8em' }}>Active</span>}
                        </td>
                      </tr>
                      {isExpanded && teamPlayers.length > 0 && (
                        <tr style={{ background: 'rgba(255, 255, 255, 0.05)' }}>
                          <td colSpan={9} style={{ padding: 0 }}>
                            <div style={{
                              padding: '12px 16px 12px 48px',
                              background: 'linear-gradient(135deg, rgba(255,255,255,0.03), rgba(255,255,255,0.06))',
                              borderLeft: '4px solid #1976d2',
                            }}>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                {teamPlayers.map((player, pIdx) => (
                                  <div 
                                    key={pIdx} 
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '8px',
                                      padding: '6px 12px',
                                      borderRadius: '20px',
                                      fontSize: '13px',
                                      fontWeight: 600,
                                      background: player.category.toLowerCase() === 'blue' 
                                        ? 'linear-gradient(135deg, #1565c0, #1976d2)' 
                                        : player.category.toLowerCase() === 'red'
                                        ? 'linear-gradient(135deg, #c62828, #e53935)'
                                        : '#424242',
                                      color: 'white',
                                      boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                                    }}
                                  >
                                    <span style={{ maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      {player.name}
                                    </span>
                                    <span style={{
                                      padding: '2px 8px',
                                      borderRadius: '10px',
                                      background: 'rgba(255, 255, 255, 0.25)',
                                      fontSize: '11px',
                                      fontWeight: 700,
                                    }}>
                                      {formatCurrency(player.amount)}
                                    </span>
                                  </div>
                                ))}
                              </div>
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

        {/* Recently Sold Players - Full Width Bottom */}
        <div className="recently-sold-section" style={{
          background: 'rgba(255, 255, 255, 0.08)',
          borderRadius: '1.5rem',
          padding: 'clamp(1rem, 3vw, 2rem)',
          backdropFilter: 'blur(10px)',
          border: '2px solid rgba(76, 175, 80, 0.3)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
          maxWidth: '100%',
          gridColumn: '1',
          gridRow: '5',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', width: '100%' }}>
            <h2 style={{ margin: 0, fontSize: 'clamp(1.2rem, 3vw, 1.8rem)', fontWeight: 700, color: '#81c784', flex: 1 }}>
              ✅ Recently Sold Players ({soldPlayersList.length})
            </h2>
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))',
            gap: 'clamp(0.75rem, 2vw, 1rem)',
          }}>
            {[...soldPlayersList].reverse().slice(0, 20).map((log, idx) => {
              const amount = typeof log.amount === 'number' ? log.amount : 0;
              console.log('Sold player amount:', log.playerName, amount);
              // Unit conversion: 1000 units = ₹1Cr, 100 units = ₹10L
              const displayAmount = amount >= 1000 
                ? `₹${(amount / 1000).toFixed(2)} Cr` 
                : `₹${(amount / 10).toFixed(1)} L`;
              const isBluePlayer = log.category && log.category.toLowerCase() === 'blue';
              return (
                <div key={idx} style={{
                  background: isBluePlayer ? 'rgba(25, 118, 210, 0.15)' : 'rgba(211, 47, 47, 0.15)',
                  border: isBluePlayer ? '1px solid rgba(25, 118, 210, 0.3)' : '1px solid rgba(211, 47, 47, 0.3)',
                  padding: 'clamp(0.75rem, 2vw, 1rem)',
                  borderRadius: '0.8rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem',
                  minHeight: '140px',
                  justifyContent: 'flex-start',
                }}>
                  <div style={{ 
                    fontSize: 'clamp(0.9rem, 2vw, 1rem)', 
                    fontWeight: 700, 
                    color: '#fff', 
                    lineHeight: '1.3', 
                    wordBreak: 'break-word',
                    paddingBottom: '0.5rem',
                    borderBottom: isBluePlayer ? '2px solid rgba(25, 118, 210, 0.5)' : '2px solid rgba(211, 47, 47, 0.5)',
                  }}>
                    {isBluePlayer ? '🔵' : '🔴'} {log.playerName}
                  </div>
                  <div style={{ fontSize: 'clamp(0.85rem, 2vw, 1rem)', color: '#90caf9', lineHeight: '1.3' }}>To: <b>{log.team}</b></div>
                  <div style={{ fontSize: 'clamp(1.1rem, 2.5vw, 1.3rem)', fontWeight: 900, color: '#81c784', marginTop: 'auto', paddingTop: '0.5rem' }}>{displayAmount}</div>
                  <div style={{ fontSize: 'clamp(0.75rem, 1.5vw, 0.85rem)', color: '#999' }}>Round {log.round}</div>
                </div>
              );
            })}
          </div>
          {soldPlayersList.length === 0 && (
            <div style={{ textAlign: 'center', padding: 'clamp(1.5rem, 4vw, 2rem)', color: '#666', fontSize: 'clamp(1rem, 2.5vw, 1.2rem)' }}>
              No players sold yet
            </div>
          )}
        </div>

        {/* Unsold Players - Coming Back in Round 2 */}
        <div className="unsold-players-section" style={{
          background: 'rgba(255, 255, 255, 0.08)',
          borderRadius: '1.5rem',
          padding: 'clamp(1rem, 3vw, 2rem)',
          backdropFilter: 'blur(10px)',
          border: '2px solid rgba(255, 152, 0, 0.3)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
          maxWidth: '100%',
          gridColumn: '1',
          gridRow: '6',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', width: '100%' }}>
            <h2 style={{ margin: 0, fontSize: 'clamp(1.2rem, 3vw, 1.8rem)', fontWeight: 700, color: '#ffb74d', flex: 1 }}>
              ⏳ Unsold Players - Round 2 ({auctionLog.filter(log => log.status === 'Unsold').length})
            </h2>
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))',
            gap: 'clamp(0.75rem, 2vw, 1rem)',
          }}>
            {unsoldPlayersList.reverse().slice(0, 20).map((log, idx) => {
              return (
                <div key={idx} style={{
                  background: 'rgba(255, 152, 0, 0.15)',
                  border: '1px solid rgba(255, 152, 0, 0.3)',
                  padding: 'clamp(0.75rem, 2vw, 1rem)',
                  borderRadius: '0.8rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem',
                  minHeight: '140px',
                  justifyContent: 'flex-start',
                }}>
                  <div style={{ 
                    fontSize: 'clamp(0.9rem, 2vw, 1rem)', 
                    fontWeight: 700, 
                    color: '#fff', 
                    lineHeight: '1.3', 
                    wordBreak: 'break-word',
                    paddingBottom: '0.5rem',
                    borderBottom: '2px solid rgba(255, 152, 0, 0.5)',
                  }}>⏳ {log.playerName}</div>
                  <div style={{ fontSize: 'clamp(0.85rem, 2vw, 1rem)', color: '#ffb74d', lineHeight: '1.3' }}>Attempt: <b>{log.attempt}</b></div>
                  <div style={{ fontSize: 'clamp(0.75rem, 1.5vw, 0.85rem)', color: '#999', marginTop: 'auto' }}>Round {log.round}</div>
                </div>
              );
            })}
          </div>
          {unsoldPlayersList.length === 0 && (
            <div style={{ textAlign: 'center', padding: 'clamp(1.5rem, 4vw, 2rem)', color: '#666', fontSize: 'clamp(1rem, 2.5vw, 1.2rem)' }}>
              No unsold players yet
            </div>
          )}
        </div>
      </div>
    </>
  );
}
