import React, { useState, useEffect, useRef } from 'react';
import './AuctionScreen.css';
import AudienceView from './AudienceView';
import { saveAuctionStateOnline } from '../src/firebase';
// Removed exportToCSV import because log download button was removed

export type Player = {
  id: string;
  photo: string;
  name: string;
  age: number;
  flat: string;
  description: string;
  specialization: string;
  category: string;
  availability?: string;
  role?: string;
};
export type Team = { name: string; balance: number; logo?: string; acquired?: number };

type AuctionLogEntry = {
  round: number;
  attempt: number;
  timestamp: string;
  playerName: string;
  team: string;
  amount: number | '';
  status: 'Sold' | 'Unsold';
};

export type ResumeData = {
  round: number;
  playerIdx: number;
  sequence: string[];
  balances: Record<string, {balance: number; acquired: number}>;
  log: Array<{
    round: number;
    attempt: number;
    timestamp: string;
    playerName: string;
    team: string;
    amount: number | '';
    status: 'Sold' | 'Unsold';
  }>;
};

interface AuctionScreenProps {
  players?: Player[];
  teams?: Team[];
  defaultBalance?: number;
  resumeData?: ResumeData;
  auctionId: string;
  minPlayersPerTeam?: number;
}


function getConfettiConfigs(seed: number, count: number) {
  const colors = ['#4caf50', '#1976d2', '#ffeb3b', '#e91e63', '#ff9800', '#00bcd4', '#f44336', '#8bc34a', '#ff5722', '#9c27b0'];
  function seededRandom(s: number) {
    const x = Math.sin(s) * 10000;
    return x - Math.floor(x);
  }
  return Array.from({ length: count }).map((_, i) => {
    const color = colors[i % colors.length];
    const size = 10 + (i % 12); // 10-21px
    const left = seededRandom(seed * 100 + i) * 90; // percent
    const duration = 1.8 + seededRandom(seed * 200 + i) * 1.5; // 1.8s - 3.3s
    const delay = seededRandom(seed * 300 + i) * 1.2; // 0-1.2s
    return { color, size, left, duration, delay };
  });
}

function ConfettiRain({ seed }: { seed: number }) {
  const configs = getConfettiConfigs(seed, 60); // More balls for denser effect
  return (
    <>
      {configs.map((cfg, i) => (
        <div
          key={i}
          className="confetti-ball"
          style={{
            background: cfg.color,
            width: cfg.size,
            height: cfg.size,
            borderRadius: '50%',
            position: 'absolute',
            left: `${cfg.left}%`,
            top: '0', // Start at the top of the card
            animation: `confetti-bounce ${cfg.duration}s ${cfg.delay}s infinite cubic-bezier(.5,1.5,.5,1)`,
            zIndex: 11,
            pointerEvents: 'none',
          }}
        />
      ))}
    </>
  );
}


function AuctionScreen({ players = [], teams = [], defaultBalance = 0, resumeData, auctionId, minPlayersPerTeam = 6 }: AuctionScreenProps) {
  const [playerIdx, setPlayerIdx] = useState(resumeData?.playerIdx || 0);
  const [auctionLog, setAuctionLog] = useState<AuctionLogEntry[]>(resumeData?.log || []);
  const [soldStatus, setSoldStatus] = useState<'Sold' | 'Unsold' | null>(null);
  const [selectedTeam, setSelectedTeam] = useState('');
  const [bidAmount, setBidAmount] = useState('100');
  const [bidWarning, setBidWarning] = useState('');
  // Ensure every team has a balance, using defaultBalance if missing or falsy
  const [teamBalances, setTeamBalances] = useState(() => {
    if (resumeData?.balances) {
      return teams.map(t => ({
        ...t,
        balance: resumeData.balances[t.name]?.balance ?? (t.balance && t.balance > 0 ? t.balance : defaultBalance),
        acquired: resumeData.balances[t.name]?.acquired ?? 0
      }));
    }
    return teams.map(t => ({
      ...t,
      balance: t.balance && t.balance > 0 ? t.balance : defaultBalance
    }));
  });
  const [round, setRound] = useState(resumeData?.round || 1);
  const [roundCountdown, setRoundCountdown] = useState(0);
  const [categoryCountdown, setCategoryCountdown] = useState(0);
  const [auctionComplete, setAuctionComplete] = useState(false);
  const [viewingHistory, setViewingHistory] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [currentCategory, setCurrentCategory] = useState<'blue' | 'red' | 'other' | null>(null);
  // Auction log edit mode
  const [isEditingLog, setIsEditingLog] = useState(false);
  const [editedLog, setEditedLog] = useState<AuctionLogEntry[]>([]);
  // Ordered player sequence (may be randomized externally, restored from CSV)
  const [orderedPlayers, setOrderedPlayers] = useState(() => {
    if (resumeData?.sequence && resumeData.sequence.length > 0) {
      const byName: Record<string, Player> = {};
      players.forEach(p => { byName[p.name] = p; });
      return resumeData.sequence.map(name => byName[name]).filter(Boolean);
    }
    return players;
  });
  const resumedRef = useRef(!!resumeData);
  const audienceWindowRef = useRef<Window | null>(null);
  
  // Sync auction state to Firebase (primary) and localStorage (backup) for audience view
  useEffect(() => {
    // Only sync if we have valid data (avoid syncing empty states on initial render)
    if (orderedPlayers.length === 0) return;
    
    const auctionState = {
      currentPlayer: orderedPlayers[playerIdx] || null,
      soldPlayers: auctionLog.filter(l => l.status === 'Sold'),
      teams,
      teamBalances,
      auctionLog,
      round,
      isSold: soldStatus === 'Sold',
      soldToTeam: selectedTeam,
      soldAmount: Number(bidAmount) * 10000,
      timestamp: Date.now(),
    };
    
    // Save to Firebase (primary storage) - async, non-blocking
    // Firebase will also try to save to localStorage as backup (with error handling)
    saveAuctionStateOnline(auctionId, auctionState).catch(err => 
      console.error('Failed to sync:', err)
    );
    
    // Also update the auto-recovery data in localStorage for page refresh recovery
    try {
      const resumeState = {
        round,
        playerIdx,
        sequence: orderedPlayers.map(p => p.name),
        balances: Object.fromEntries(teamBalances.map(t => [t.name, { balance: t.balance, acquired: t.acquired || 0 }])),
        log: auctionLog.map(l => ({
          round: l.round,
          attempt: l.attempt,
          timestamp: l.timestamp,
          playerName: l.playerName,
          status: l.status,
          team: l.team || '',
          amount: l.amount || '',
        })),
        generated: new Date().toISOString(),
      };
      
      const fullSetup = {
        players,
        teams,
        defaultBalance,
        resumeData: resumeState,
        auctionId,
      };
      
      localStorage.setItem('auction_auto_recovery', JSON.stringify(fullSetup));
    } catch (error) {
      console.warn('Failed to save auto-recovery data:', error);
    }
  }, [playerIdx, orderedPlayers, auctionLog, teams, teamBalances, round, soldStatus, selectedTeam, bidAmount, auctionId, players, defaultBalance]);
  
  // Open audience view in new tab on mount with auction ID
  useEffect(() => {
    // Only open on initial mount, not when resuming
    if (!resumedRef.current && orderedPlayers.length > 0 && !audienceWindowRef.current) {
      // Small delay to ensure main window is ready
      const timer = setTimeout(() => {
        const baseUrl = window.location.origin + window.location.pathname;
        const audienceUrl = `${baseUrl}?audienceView=true&auction=${auctionId}`;
        const newWindow = window.open(audienceUrl, '_blank');
        if (newWindow) {
          audienceWindowRef.current = newWindow;
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [orderedPlayers.length, auctionId]);
  
  // Keep orderedPlayers in sync with incoming props only if not resumed
  useEffect(() => {
    if (!resumedRef.current) {
      setOrderedPlayers(players);
      console.log('AuctionScreen received players:', players.length);
      console.log('Players with photos:', players.filter(p => p.photo).length);
      if (players.length > 0 && players[0]) {
        console.log('First player photo:', players[0].photo ? 'EXISTS (length: ' + players[0].photo.length + ')' : 'MISSING');
      }
    } else {
      console.log('AuctionScreen resumed from CSV');
      console.log('Round:', round, 'PlayerIdx:', playerIdx);
      console.log('Ordered players:', orderedPlayers.length);
      console.log('Auction log entries:', auctionLog.length);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players]);
  
  // Detect category changes and show countdown
  useEffect(() => {
    if (orderedPlayers.length === 0 || playerIdx >= orderedPlayers.length) return;
    
    const currentPlayer = orderedPlayers[playerIdx];
    if (!currentPlayer) return;
    
    const category = (currentPlayer.category || '').toLowerCase();
    let newCategory: 'blue' | 'red' | 'other' | null = null;
    
    if (category === 'blue') newCategory = 'blue';
    else if (category === 'red') newCategory = 'red';
    else newCategory = 'other';
    
    // Show countdown on category change (or initial start) for blue/red only
    if (currentCategory !== newCategory && round === 1) {
      setCurrentCategory(newCategory);
      if (newCategory === 'blue' || newCategory === 'red') {
        setCategoryCountdown(10);
      }
    } else if (currentCategory === null) {
      setCurrentCategory(newCategory);
      if (newCategory === 'blue' || newCategory === 'red') {
        setCategoryCountdown(10);
      }
    }
  }, [playerIdx, orderedPlayers, round, currentCategory]);
  
  // Set sold status from resume data on mount
  useEffect(() => {
    if (resumeData && orderedPlayers.length > 0) {
      const currentPlayer = orderedPlayers[resumeData.playerIdx];
      if (currentPlayer) {
        const logEntry = resumeData.log.find(e => e.playerName === currentPlayer.name);
        if (logEntry) {
          setSoldStatus(logEntry.status);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const player = orderedPlayers[playerIdx] || {};
  const alreadyAuctioned = auctionLog.some(log => log.playerName === player.name && log.status === 'Sold');

  // Download auction state (resume) as CSV with embedded state rows
  // Format:
  // __STATE__,round,<number>
  // __STATE__,playerIdx,<number>
  // __STATE__,sequence,Player1|Player2|...
  // __STATE__,balances,TeamA=12345:2|TeamB=9000:1 (balance:acquired)
  // __STATE__,generated,<ISO timestamp>
  // Sequence,Timestamp,Player,Team,Amount,Status  (header)
  // 1,<ts>,<player>,<team>,<amount>,<status>
  function handleDownloadResumeCSV() {
    generateAndDownloadResumeCSV();
  }
  function generateAndDownloadResumeCSV(filename?: string) {
    // Build chronological log (oldest first) from current state
    const chronological = [...auctionLog].reverse();
    
    // Determine correct playerIdx for resume: if current player is already sold, advance to next unsold player
    let resumePlayerIdx = playerIdx;
    const currentPlayer = orderedPlayers[resumePlayerIdx];
    if (currentPlayer) {
      const isCurrentPlayerSold = auctionLog.some(log => log.playerName === currentPlayer.name && log.status === 'Sold');
      if (isCurrentPlayerSold) {
        // Find next player that hasn't been sold yet
        let nextIdx = resumePlayerIdx + 1;
        while (nextIdx < orderedPlayers.length && 
               auctionLog.some(log => log.playerName === orderedPlayers[nextIdx].name && log.status === 'Sold')) {
          nextIdx++;
        }
        resumePlayerIdx = nextIdx < orderedPlayers.length ? nextIdx : resumePlayerIdx;
      }
    }
    
    // Encode state meta rows
    const stateLines = [
      ['__STATE__','format','2'],
      ['__STATE__','round', String(round)],
      ['__STATE__','playerIdx', String(resumePlayerIdx)],
      ['__STATE__','sequence', orderedPlayers.map(p=>p.name).join('|')],
      ['__STATE__','balances', teamBalances.map(t=>`${t.name}=${t.balance}:${t.acquired||0}`).join('|')],
      ['__STATE__','generated', new Date().toISOString()]
    ];
    const header = ['Sequence','Round','Attempt','Timestamp','Player','Team','Amount','Status'];
    const escape = (v: unknown) => {
      if (v === null || v === undefined) return '';
      let s = String(v).replace(/\r\n|\r|\n/g,'\n');
      if (/[",\n]/.test(s)) s = '"'+s.replace(/"/g,'""')+'"';
      return s;
    };
    const lines: string[] = [];
    stateLines.forEach(arr=>lines.push(arr.map(escape).join(',')));
    lines.push(header.join(','));
    chronological.forEach((entry, idx) => {
      const row = [
        idx + 1,
        entry.round,
        entry.attempt,
        entry.timestamp,
        entry.playerName,
        entry.team || '',
        entry.amount === '' ? '' : entry.amount,
        entry.status
      ];
      lines.push(row.map(escape).join(','));
    });
    const csv = '\uFEFF' + lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename || `auction-resume-${new Date().toISOString().replace(/[:.]/g,'-')}.csv`;
    document.body.appendChild(a);
    a.click();
    setTimeout(()=>{document.body.removeChild(a);},0);
  }

  // Generate and download team rosters CSV
  function generateAndDownloadRostersCSV() {
    const escape = (v: unknown) => {
      if (v === null || v === undefined) return '';
      let s = String(v).replace(/\r\n|\r|\n/g,'\n');
      if (/[",\n]/.test(s)) s = '"'+s.replace(/"/g,'""')+'"';
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
    a.download = `team-rosters-${new Date().toISOString().replace(/[:.]/g,'-')}.csv`;
    document.body.appendChild(a);
    a.click();
    setTimeout(()=>{document.body.removeChild(a);},0);
  }

  // Generate and download auction log CSV
  function generateAndDownloadAuctionLogCSV() {
    const escape = (v: unknown) => {
      if (v === null || v === undefined) return '';
      let s = String(v).replace(/\r\n|\r|\n/g,'\n');
      if (/[",\n]/.test(s)) s = '"'+s.replace(/"/g,'""')+'"';
      return s;
    };
    
    const lines: string[] = [];
    
    // Add headers
    lines.push('Round,Attempt,Timestamp,Player,Team,Amount,Status');
    
    // Add log entries
    auctionLog.forEach(log => {
      const row = [
        log.round,
        log.attempt,
        log.timestamp,
        log.playerName,
        log.team || '',
        typeof log.amount === 'number' ? log.amount : '',
        log.status
      ];
      lines.push(row.map(escape).join(','));
    });
    
    const csv = lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = `auction-log-${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a);
    a.click();
    setTimeout(()=>{document.body.removeChild(a);},0);
  }

  // Upload and resume auction from resume CSV
  function handleUploadResumeCSV(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    file.text().then(text => {
      try {
        const lines = text.replace(/\r/g,'').split('\n').filter(l=>l.trim().length>0);
        let headerIndex = -1;
        let newRound = round;
        let newPlayerIdx = playerIdx;
        let balancesMap: Record<string,{balance:number; acquired:number}> = {};
        let sequenceNames: string[] | null = null;
        for (let i=0;i<lines.length;i++) {
          const line = lines[i];
            if (line.startsWith('__STATE__')) {
            const parts = line.split(',');
            const key = parts[1];
            const value = parts.slice(2).join(',');
            switch(key){
              case 'round': newRound = Number(value)||1; break;
              case 'playerIdx': newPlayerIdx = Number(value)||0; break;
              case 'sequence': sequenceNames = value.split('|').filter(Boolean); break;
              case 'balances':
                balancesMap = {};
                value.split('|').forEach(seg=>{
                  if(!seg) return;
                  const [teamPart, balAcq] = seg.split('=');
                  if(!teamPart || !balAcq) return;
                  const [balStr, acqStr] = balAcq.split(':');
                  balancesMap[teamPart] = { balance: Number(balStr)||0, acquired: Number(acqStr)||0 };
                });
                break;
              default: break; // sequence & generated not needed for now
            }
          } else if (line.startsWith('Sequence,')) {
            headerIndex = i;
            break;
          }
        }
        if (headerIndex === -1) throw new Error('Missing header');
        const logLines = lines.slice(headerIndex + 1);
        const newLog: AuctionLogEntry[] = logLines.map(l => {
          const parts: string[] = [];
          let cur = '';
          let inQuotes = false;
          for (let i=0;i<l.length;i++) {
            const ch = l[i];
            if (ch === '"') {
              if (inQuotes && l[i+1] === '"') { cur += '"'; i++; }
              else inQuotes = !inQuotes;
            } else if (ch === ',' && !inQuotes) {
              parts.push(cur); cur='';
            } else { cur += ch; }
          }
          parts.push(cur);
          if (parts.length < 6) return null as unknown as AuctionLogEntry;
          const [, timestamp, playerName, team, amount, status] = parts; // ignore sequence index here
          return {
            timestamp,
            playerName,
            team: team || '',
            amount: amount ? Number(amount) : '',
            status: (status as 'Sold'|'Unsold') || 'Unsold'
          };
        }).filter(Boolean) as AuctionLogEntry[];

        // Reconstruct orderedPlayers if sequence provided
        if (sequenceNames) {
          const byName: Record<string, Player> = {};
            players.forEach(p => { byName[p.name] = p; });
          const newOrdered = sequenceNames.map(n => byName[n]).filter(Boolean);
          if (newOrdered.length) {
            resumedRef.current = true;
            setOrderedPlayers(newOrdered);
            if (newPlayerIdx >= newOrdered.length) newPlayerIdx = newOrdered.length - 1;
          }
        }

        // Determine current sold status if that player already auctioned
        let resumedStatus: 'Sold' | 'Unsold' | null = null;
        const currentPlayerName = sequenceNames ? sequenceNames[newPlayerIdx] : players[newPlayerIdx]?.name;
        if (currentPlayerName) {
          const entry = newLog.find(l => l.playerName === currentPlayerName);
          if (entry) resumedStatus = entry.status;
        }
        setAuctionLog(newLog.reverse()); // store newest first
        setRound(newRound);
        setPlayerIdx(newPlayerIdx);
        setSoldStatus(resumedStatus);
        if (Object.keys(balancesMap).length) {
          setTeamBalances(teamBalances.map(t => balancesMap[t.name] ? { ...t, balance: balancesMap[t.name].balance, acquired: balancesMap[t.name].acquired } : t));
        }
        alert('Auction resumed from CSV');
      } catch(_err) {
        void _err;
        alert('Failed to parse resume CSV');
      } finally {
        e.target.value='';
      }
    });
  }

  // Show confetti and overlay when soldStatus is 'Sold'
  useEffect(() => {
    if (soldStatus === 'Sold') setShowConfetti(true);
    else setShowConfetti(false);
  }, [soldStatus]);

  // Check bid against selected team's balance
  useEffect(() => {
    if (!selectedTeam) {
      setBidWarning('');
      return;
    }
    const team = teamBalances.find(t => t.name === selectedTeam);
    if (!team) {
      setBidWarning('');
      return;
    }
    // Calculate actual remaining balance based on auction log (to account for corrections)
    const teamPlayers = auctionLog.filter(log => log.team === selectedTeam && log.status === 'Sold');
    const totalSpent = teamPlayers.reduce((sum, log) => sum + (typeof log.amount === 'number' ? log.amount : 0), 0);
    const initialBalance = teams.find(t => t.name === selectedTeam)?.balance || defaultBalance;
    const actualRemainingBalance = initialBalance - totalSpent;
    
    const actualAmount = Number(bidAmount) * 10000;
    
    // Calculate remaining players needed AFTER this purchase
    const teamAcquired = team?.acquired || 0;
    const remainingPlayersNeeded = Math.max(0, minPlayersPerTeam - teamAcquired - 1);
    
    // Check if this bid would leave enough for remaining players (1M minimum per player)
    if (bidAmount && remainingPlayersNeeded > 0) {
      const balanceAfterBid = actualRemainingBalance - actualAmount;
      const minRequiredForRemaining = remainingPlayersNeeded * 1000000; // 10 lakhs each = 1M
      
      if (balanceAfterBid < minRequiredForRemaining) {
        const maxAllowedBid = actualRemainingBalance - minRequiredForRemaining;
        const maxAllowedDisplay = maxAllowedBid >= 10000000 
          ? `₹${(maxAllowedBid / 10000000).toFixed(2)} Cr` 
          : `₹${(maxAllowedBid / 100000).toFixed(2)} L`;
        const reservedAmount = minRequiredForRemaining >= 10000000
          ? `₹${(minRequiredForRemaining / 10000000).toFixed(2)} Cr`
          : `₹${(minRequiredForRemaining / 100000).toFixed(2)} L`;
        setBidWarning(`⚠️ Max allowed: ${maxAllowedDisplay} (Must reserve ${reservedAmount} for ${remainingPlayersNeeded} more ${remainingPlayersNeeded === 1 ? 'player' : 'players'})`);
        return;
      }
    }
    
    // Check if bid exceeds total balance
    if (bidAmount && actualAmount > actualRemainingBalance) {
      setBidWarning('⚠️ This bid exceeds the team\'s remaining balance!');
    } else {
      setBidWarning('');
    }
  }, [bidAmount, selectedTeam, teamBalances, auctionLog, teams, defaultBalance, minPlayersPerTeam]);

  function handleNext() {
    if (!soldStatus) return;
    setShowConfetti(false);
    setViewingHistory(false);
    // Next index within current round (skip players already attempted this round)
    let nextIdx = playerIdx + 1;
    while (nextIdx < orderedPlayers.length &&
      auctionLog.some(log => log.playerName === orderedPlayers[nextIdx].name && log.round === round)) {
      nextIdx++;
    }
    if (nextIdx < orderedPlayers.length) {
      setPlayerIdx(nextIdx);
      setSoldStatus(null);
      setSelectedTeam('');
      setBidAmount('100');
      return;
    }
    // All attempted this round: build list of players that were explicitly Unsold in THIS round (not just "not sold" overall)
    const unsoldThisRound = orderedPlayers.filter(p => {
      const attemptsThisRound = auctionLog.filter(l => l.playerName === p.name && l.round === round);
      if (attemptsThisRound.length === 0) return true; // not attempted yet -> keep
      return attemptsThisRound.some(a => a.status === 'Unsold');
    });
    if (unsoldThisRound.length > 0) {
      setRound(r => r + 1);
      // Second (and subsequent) rounds show only those unsold in the immediately prior round
      setOrderedPlayers(unsoldThisRound);
      setPlayerIdx(0);
      setSoldStatus(null);
      setSelectedTeam('');
      setBidAmount('100');
      setRoundCountdown(10);
      setTimeout(() => generateAndDownloadResumeCSV('auto-resume-round-advance.csv'), 60);
    } else {
      // No unsold players -> auction complete
      setAuctionComplete(true);
      setTimeout(() => generateAndDownloadResumeCSV('auto-resume-auction-complete.csv'), 60);
      // Auto-download team rosters CSV
      setTimeout(() => generateAndDownloadRostersCSV(), 100);
    }
  }

  // Mark as Sold
  function handleSold() {
    if (!selectedTeam || !bidAmount || alreadyAuctioned) return;
    
    const now = new Date().toLocaleString();
    const actualAmount = Number(bidAmount) * 10000; // Convert to actual amount (100 = 10 lakhs)
    
    // Find existing log entry for this player in current round (unsold placeholder)
    let replaced = false;
    const newLog = auctionLog.map(entry => {
      if (!replaced && entry.playerName === player.name && entry.round === round) {
        replaced = true;
        const attempt = (entry.attempt || 1) + (entry.status === 'Unsold' ? 1 : 0);
        return { round, attempt, timestamp: now, playerName: player.name, team: selectedTeam, amount: actualAmount, status: 'Sold' } as AuctionLogEntry;
      }
      return entry;
    });
    if (!replaced) {
      // No prior unsold placeholder this round, insert fresh entry at top
      newLog.unshift({ round, attempt: 1, timestamp: now, playerName: player.name, team: selectedTeam, amount: actualAmount, status: 'Sold' });
    }
    
    // Update state immediately in batch to avoid intermediate renders
    setAuctionLog(newLog);
    setTeamBalances(teamBalances.map(t => t.name === selectedTeam ? { ...t, balance: t.balance - actualAmount, acquired: (t.acquired || 0) + 1 } : t));
    setSoldStatus('Sold');
    
    // Generate resume CSV after a small delay
    setTimeout(() => generateAndDownloadResumeCSV('auto-resume-sold.csv'), 50);
    
    // If in round > 1, immediately remove this sold player from the current orderedPlayers list (so only unsold remain visible)
    if (round > 1) {
      setTimeout(() => {
        setOrderedPlayers(prev => {
          const idxName = player.name;
          const updated = prev.filter(p => p.name !== idxName);
          // Adjust playerIdx: if we removed an element before or at current index, keep index stable
          setPlayerIdx(i => {
            if (updated.length === 0) return 0;
            if (i >= updated.length) return updated.length - 1;
            return i;
          });
          return updated;
        });
        // Auto-advance to next unsold player without requiring Next click
        setTimeout(() => {
          setSoldStatus(null); // ready for next
          setSelectedTeam('');
          setBidAmount('100');
        }, 30);
      }, 10);
    }
  }
  // Mark as Unsold
  function handleUnsold() {
    if (alreadyAuctioned) return; // Once sold we don't mark unsold again
    
    const now = new Date().toLocaleString();
    let updated = false;
    const newLog = auctionLog.map(entry => {
      if (!updated && entry.playerName === player.name && entry.round === round) {
        updated = true;
        // Keep the earliest unsold attempt attempt number; if sold later we'll increment
        return { ...entry, timestamp: now, status: 'Unsold' } as AuctionLogEntry;
      }
      return entry;
    });
    if (!updated) {
      newLog.unshift({ round, attempt: 1, timestamp: now, playerName: player.name, team: '', amount: '', status: 'Unsold' });
    }
    
    // Update state immediately in batch
    setAuctionLog(newLog);
    setSoldStatus('Unsold');
    
    setTimeout(() => generateAndDownloadResumeCSV('auto-resume-unsold.csv'), 50);
  }

  // Countdown timer effects
  useEffect(() => {
    if (roundCountdown > 0) {
      const timer = setTimeout(() => {
        setRoundCountdown(roundCountdown - 1);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [roundCountdown]);

  useEffect(() => {
    if (categoryCountdown > 0) {
      const timer = setTimeout(() => {
        setCategoryCountdown(categoryCountdown - 1);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [categoryCountdown]);

  // Set default bid amount to 1 when player changes (represents 10,000 actual)
  React.useEffect(() => {
    setBidAmount('1');
  }, [playerIdx]);

  // Check if this window should show audience view based on URL parameter
  const urlParams = new URLSearchParams(window.location.search);
  const isAudienceViewWindow = urlParams.get('audienceView') === 'true';

  // If showing audience view, render that instead
  if (isAudienceViewWindow) {
    return (
      <div style={{ position: 'relative' }}>

        <AudienceView
          currentPlayer={player}
          soldPlayers={auctionLog.filter(l => l.status === 'Sold')}
          teams={teams}
          teamBalances={teamBalances}
          auctionLog={auctionLog}
          round={round}
          isSold={soldStatus === 'Sold'}
          soldToTeam={selectedTeam}
          soldAmount={Number(bidAmount) * 10000}
        />
      </div>
    );
  }

  // Determine if we can move to next round
  // For round 1: At least one player must be sold OR all players attempted
  // For round 2+: All players in current round list must be attempted (sold or unsold)
  const canMoveToNextRound = (() => {
    const allPlayersAttempted = orderedPlayers.every(p => 
      auctionLog.some(log => log.playerName === p.name && log.round === round)
    );
    
    if (round === 1) {
      const atLeastOneSold = auctionLog.some(log => log.status === 'Sold' && log.round === 1);
      return atLeastOneSold || allPlayersAttempted;
    }
    
    return allPlayersAttempted;
  })();

  // Handler to manually trigger next round
  function handleMoveToNextRound() {
    if (!canMoveToNextRound) return;
    
    // Build list of players that were explicitly Unsold in THIS round
    const unsoldThisRound = orderedPlayers.filter(p => {
      const attemptsThisRound = auctionLog.filter(l => l.playerName === p.name && l.round === round);
      if (attemptsThisRound.length === 0) return true; // not attempted yet -> keep
      return attemptsThisRound.some(a => a.status === 'Unsold');
    });
    
    if (unsoldThisRound.length > 0) {
      setRound(r => r + 1);
      setOrderedPlayers(unsoldThisRound);
      setPlayerIdx(0);
      setSoldStatus(null);
      setSelectedTeam('');
      setBidAmount('100');
      setRoundCountdown(10);
      setTimeout(() => generateAndDownloadResumeCSV('auto-resume-round-advance.csv'), 60);
    } else {
      // No unsold players -> auction complete
      setAuctionComplete(true);
      setTimeout(() => generateAndDownloadResumeCSV('auto-resume-auction-complete.csv'), 60);
      setTimeout(() => generateAndDownloadRostersCSV(), 100);
    }
  }

  // Undo last action
  function handleUndo() {
    if (auctionLog.length === 0) return;
    
    // Remove the last entry from auction log
    const newLog = auctionLog.slice(0, -1);
    setAuctionLog(newLog);
    
    // Clear current player status
    setSoldStatus(null);
    setSelectedTeam('');
    setBidAmount('100');
    setShowConfetti(false);
  }

  return (
    <>
      {/* Force light mode color scheme */}
      <style>{`
        * {
          color-scheme: light !important;
        }
        body {
          background: #f7f7fa !important;
          color: #333 !important;
        }
      `}</style>




      {auctionComplete && (
        <div style={{
          width: '100%', padding: '3rem',
          background: 'linear-gradient(135deg, rgba(76, 175, 80, 0.95) 0%, rgba(56, 142, 60, 0.95) 100%)',
          color: '#fff',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          animation: 'fadeSlideIn 0.4s ease'
        }}>
          <div style={{ fontSize: '8rem', marginBottom: '2rem' }}>🎉</div>
          <div style={{ fontSize: '4rem', fontWeight: 900, letterSpacing: '0.1em', marginBottom: '1rem', textAlign: 'center', textShadow: '0 4px 20px rgba(0, 0, 0, 0.3)' }}>
            AUCTION COMPLETE!
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '3rem', textAlign: 'center', opacity: 0.9 }}>
            All players have been successfully allocated to teams
          </div>
          <div style={{ display: 'flex', gap: '1.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button 
              onClick={() => generateAndDownloadRostersCSV()} 
              style={{ 
                padding: '1rem 2rem', 
                borderRadius: '1rem', 
                background: '#fff', 
                color: '#388e3c', 
                fontWeight: 700, 
                fontSize: '1.1rem',
                border: 'none', 
                cursor: 'pointer',
                boxShadow: '0 4px 15px rgba(0, 0, 0, 0.2)',
                transition: 'transform 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
              onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
            >
              📊 Download Rosters CSV
            </button>
            <button 
              onClick={() => generateAndDownloadResumeCSV('final-auction-log.csv')} 
              style={{ 
                padding: '1rem 2rem', 
                borderRadius: '1rem', 
                background: 'rgba(255, 255, 255, 0.2)', 
                color: '#fff', 
                fontWeight: 700, 
                fontSize: '1.1rem',
                border: '2px solid #fff', 
                cursor: 'pointer',
                transition: 'background 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)'}
            >
              📋 Download Final Log
            </button>
            <button 
              onClick={() => setAuctionComplete(false)} 
              style={{ 
                padding: '1rem 2rem', 
                borderRadius: '1rem', 
                background: 'rgba(0, 0, 0, 0.2)', 
                color: '#fff', 
                fontWeight: 600, 
                fontSize: '1.1rem',
                border: '2px solid rgba(255, 255, 255, 0.5)', 
                cursor: 'pointer',
                transition: 'background 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(0, 0, 0, 0.3)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(0, 0, 0, 0.2)'}
            >
              ✕ Close
            </button>
          </div>
        </div>
      )}
      <div style={{
        width: '100%',
        height: '100vh',
        background: '#f5f7fa',
        fontFamily: 'Segoe UI, Arial, sans-serif',
        padding: '1rem',
        boxSizing: 'border-box',
        display: 'grid',
        gridTemplateColumns: '40% 50% 10%',
        gap: '1rem',
        overflow: 'hidden',
      }}>
        {/* Column 1: Player Card (40%) */}
        <div style={{
          background: '#fff',
          borderRadius: '12px',
          padding: '1.5rem',
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          height: '100%',
          overflow: 'hidden',
        }}>
          <div style={{
            width: '100%',
            height: '45%',
            background: '#e3e9f6',
            borderRadius: '8px',
            overflow: 'hidden',
            position: 'relative',
            flexShrink: 0,
          }}>
              {player.photo ? (
                <img src={player.photo} alt={player.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ color: '#b0b0b0', fontSize: '2rem' }}>📷</span>
                </div>
              )}
              {showConfetti && soldStatus === 'Sold' && (
                <div style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  background: 'rgba(56, 142, 60, 0.95)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 10,
                }}>
                  <ConfettiRain seed={playerIdx * 3 + 1} />
                  <span style={{
                    fontSize: '3rem',
                    fontWeight: 900,
                    color: '#fff',
                    textShadow: '0 2px 12px rgba(0,0,0,0.3)',
                  }}>SOLD</span>
                </div>
              )}
          </div>
          <div style={{
            fontSize: '1.8rem',
            fontWeight: 700,
            color: '#1976d2',
            textAlign: 'center',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}>
            {player.name}
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '0.5rem',
            fontSize: '1rem',
            flexShrink: 0,
          }}>
            <div><strong>Age:</strong> {player.age || 'N/A'}</div>
            <div><strong>Flat:</strong> {player.flat || 'N/A'}</div>
            <div style={{ gridColumn: '1 / -1' }}><strong>Role:</strong> {player.specialization || 'N/A'}</div>
            <div style={{ gridColumn: '1 / -1' }}><strong>Available:</strong> {player.availability || 'N/A'}</div>
          </div>
          
          {/* Description Section */}
          <div style={{
            padding: '1rem',
            background: '#f8f9fa',
            borderRadius: '8px',
            fontSize: '1rem',
            color: '#555',
            lineHeight: '1.5',
            flex: 1,
            overflow: 'auto',
            minHeight: 0,
          }}>
            <strong style={{ color: '#333', display: 'block', marginBottom: '0.5rem', fontSize: '1.1rem' }}>Description:</strong>
            {player.description || <span style={{ color: '#999', fontStyle: 'italic' }}>No description available</span>}
          </div>
        </div>

        {/* Column 2: Team Selection + Roster (50%) */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          height: '100%',
          overflow: 'hidden',
        }}>
          {/* Team Selection */}
          <div style={{
            background: '#fff',
            borderRadius: '12px',
            padding: '1rem',
            boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
            height: '40%',
            overflow: 'hidden',
          }}>
            {/* Team Selection Buttons */}
            <div style={{ flexShrink: 0 }}>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: '0.5rem', color: '#333' }}>Select Team</div>
            </div>
            <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {[...teamBalances].sort((a, b) => a.name.localeCompare(b.name)).map((team) => {
                  const isSelected = selectedTeam === team.name;
                  const currentBid = parseFloat(bidAmount) || 0;
                  const actualAmount = currentBid * 10000;
                  const teamAcquired = team.acquired || 0;
                  const remainingPlayersNeeded = Math.max(0, minPlayersPerTeam - teamAcquired - 1);
                  const balanceAfterBid = team.balance - actualAmount;
                  const minRequiredForRemaining = remainingPlayersNeeded * 1000000;
                  const canAfford = actualAmount <= team.balance && 
                    (remainingPlayersNeeded === 0 || balanceAfterBid >= minRequiredForRemaining);

                  return (
                    <button
                      key={team.name}
                      onClick={() => canAfford && setSelectedTeam(team.name)}
                      disabled={alreadyAuctioned || viewingHistory || !canAfford}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        borderRadius: '6px',
                        border: isSelected ? '2px solid #1976d2' : '1px solid #e0e0e0',
                        background: !canAfford ? '#f5f5f5' : isSelected ? '#e3f2fd' : '#fff',
                        color: !canAfford ? '#999' : isSelected ? '#1976d2' : '#333',
                        fontWeight: isSelected ? 700 : 600,
                        fontSize: '0.85rem',
                        cursor: alreadyAuctioned || viewingHistory || !canAfford ? 'not-allowed' : 'pointer',
                        transition: 'all 0.2s',
                        boxShadow: isSelected ? '0 2px 8px rgba(25, 118, 210, 0.3)' : '0 1px 3px rgba(0,0,0,0.1)',
                        opacity: (alreadyAuctioned || viewingHistory || !canAfford) ? 0.4 : 1,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        textAlign: 'left',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flex: 1 }}>
                        {team.logo && (
                          <img src={team.logo} alt={team.name} style={{ width: '20px', height: '20px', objectFit: 'contain', borderRadius: '3px' }} />
                        )}
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <div style={{ fontSize: '0.85rem', fontWeight: 700 }}>{team.name}</div>
                          <div style={{ fontSize: '0.7rem', color: isSelected ? '#1976d2' : '#888', fontWeight: 500 }}>
                            Players: {team.acquired || 0}/{minPlayersPerTeam}
                          </div>
                        </div>
                      </div>
                      <div style={{ fontSize: '0.75rem', color: isSelected ? '#1976d2' : '#666', fontWeight: 600 }}>
                        ₹{team.balance >= 10000000 ? `${(team.balance / 10000000).toFixed(2)} Cr` : `${(team.balance / 100000).toFixed(2)} L`}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Team Roster Table */}
          <div style={{
            background: '#fff',
            borderRadius: '12px',
            padding: '1rem',
            boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
            flex: 1,
            overflow: 'auto',
            minHeight: 0,
          }}>
            <div style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: '0.75rem', color: '#333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Team Rosters</span>
              <button
                style={{ fontSize: '0.75rem', padding: '0.4em 0.8em', borderRadius: '0.5em', border: 'none', background: '#1976d2', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
                onClick={() => generateAndDownloadRostersCSV()}
              >
                Download CSV
              </button>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ background: '#f5f5f5' }}>
                    <th style={{ padding: '0.5em', color: '#333', fontWeight: 700, textAlign: 'left', borderBottom: '2px solid #e0e0e0' }}>Team</th>
                    <th style={{ padding: '0.5em', color: '#333', fontWeight: 700, textAlign: 'center', borderBottom: '2px solid #e0e0e0' }}>Players</th>
                    <th style={{ padding: '0.5em', color: '#333', fontWeight: 700, textAlign: 'right', borderBottom: '2px solid #e0e0e0' }}>Spent</th>
                    <th style={{ padding: '0.5em', color: '#333', fontWeight: 700, textAlign: 'right', borderBottom: '2px solid #e0e0e0' }}>Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {teamBalances.map(team => {
                    const teamPlayers = auctionLog.filter(log => log.team === team.name && log.status === 'Sold');
                    const totalSpent = teamPlayers.reduce((sum, log) => sum + (typeof log.amount === 'number' ? log.amount : 0), 0);
                    return (
                      <tr key={team.name} style={{ borderBottom: '1px solid #f0f0f0' }}>
                        <td style={{ padding: '0.5em', color: '#1976d2', fontWeight: 700, verticalAlign: 'top' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            {team.logo && <img src={team.logo} alt={team.name} style={{ width: '20px', height: '20px', objectFit: 'contain' }} />}
                            <span>{team.name}</span>
                          </div>
                        </td>
                        <td style={{ padding: '0.5em', color: '#555', fontWeight: 600, textAlign: 'center', verticalAlign: 'top' }}>{team.acquired || 0}</td>
                        <td style={{ padding: '0.5em', color: '#555', fontWeight: 600, textAlign: 'right', verticalAlign: 'top' }}>
                          {totalSpent >= 10000000 ? `${(totalSpent / 10000000).toFixed(2)} Cr` : `${(totalSpent / 100000).toFixed(2)} L`}
                        </td>
                        <td style={{ padding: '0.5em', color: '#388e3c', fontWeight: 600, textAlign: 'right', verticalAlign: 'top' }}>
                          {team.balance >= 10000000 ? `${(team.balance / 10000000).toFixed(2)} Cr` : `${(team.balance / 100000).toFixed(2)} L`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Column 3: Bid Controls & Actions (10%) */}\n        <div style={{
          background: '#fff',
          borderRadius: '12px',
          padding: '1rem',
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
          height: '100%',
          overflow: 'auto',
        }}>
          {/* Bid Input */}
          <div style={{ flexShrink: 0 }}>
            <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.4rem', color: '#333' }}>Bid Amount</div>
            <input
              type="text"
              inputMode="numeric"
              placeholder="Bid"
              value={bidAmount}
              onChange={e => {
                let val = e.target.value.replace(/[^0-9]/g, '');
                if (selectedTeam) {
                  const team = teamBalances.find(t => t.name === selectedTeam);
                  if (team && Number(val) * 10000 > team.balance) {
                    val = String(Math.floor(team.balance / 10000));
                  }
                }
                setBidAmount(val.slice(0, 10));
              }}
              style={{
                fontSize: '0.85rem',
                padding: '0.5em',
                borderRadius: '6px',
                border: '2px solid #e0e0e0',
                width: '100%',
                boxSizing: 'border-box',
                fontWeight: 600,
                textAlign: 'center',
              }}
              maxLength={10}
              disabled={alreadyAuctioned || viewingHistory}
            />
            <div style={{ fontSize: '0.7rem', color: '#666', marginTop: '0.2rem', textAlign: 'center' }}>
              = ₹{bidAmount ? (Number(bidAmount) * 10000 >= 10000000 ? `${(Number(bidAmount) * 10000 / 10000000).toFixed(2)} Cr` : `${(Number(bidAmount) * 10000 / 100000).toFixed(2)} L`) : '0'}
            </div>
          </div>

          {/* Quick Increment Buttons */}
          <div style={{ flexShrink: 0 }}>
            <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.4rem', color: '#333' }}>Quick Add</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <button
                  onClick={() => {
                    const newVal = Math.min(Number(bidAmount || 0) + 100, 999999999);
                    setBidAmount(String(newVal));
                  }}
                  disabled={alreadyAuctioned || viewingHistory}
                  style={{
                    flex: 1,
                    padding: '0.6em',
                    borderRadius: '8px',
                    border: 'none',
                    background: alreadyAuctioned || viewingHistory ? '#e0e0e0' : '#e3f2fd',
                    color: alreadyAuctioned || viewingHistory ? '#999' : '#1976d2',
                    fontWeight: 700,
                    fontSize: '0.9rem',
                    cursor: alreadyAuctioned || viewingHistory ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s',
                  }}
                >
                  +100<br/><span style={{ fontSize: '0.65rem' }}>(₹10L)</span>
                </button>
                <button
                  onClick={() => {
                    const newVal = Math.min(Number(bidAmount || 0) + 500, 999999999);
                    setBidAmount(String(newVal));
                  }}
                  disabled={alreadyAuctioned || viewingHistory}
                  style={{
                    flex: 1,
                    padding: '0.4em',
                    borderRadius: '6px',
                    border: 'none',
                    background: alreadyAuctioned || viewingHistory ? '#e0e0e0' : '#e3f2fd',
                    color: alreadyAuctioned || viewingHistory ? '#999' : '#1976d2',
                    fontWeight: 700,
                    fontSize: '0.8rem',
                    cursor: alreadyAuctioned || viewingHistory ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s',
                  }}
                >
                  +500<br/><span style={{ fontSize: '0.65rem' }}>(₹50L)</span>
                </button>
                <button
                  onClick={() => {
                    const newVal = Math.min(Number(bidAmount || 0) + 1000, 999999999);
                    setBidAmount(String(newVal));
                  }}
                  disabled={alreadyAuctioned || viewingHistory}
                  style={{
                    flex: 1,
                    padding: '0.4em',
                    borderRadius: '6px',
                    border: 'none',
                    background: alreadyAuctioned || viewingHistory ? '#e0e0e0' : '#e3f2fd',
                    color: alreadyAuctioned || viewingHistory ? '#999' : '#1976d2',
                    fontWeight: 700,
                    fontSize: '0.8rem',
                    cursor: alreadyAuctioned || viewingHistory ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s',
                  }}
                >
                  +1000<br/><span style={{ fontSize: '0.65rem' }}>(₹1Cr)</span>
                </button>
              </div>
            </div>

            {/* Warning Message */}
            {bidWarning && (
              <div style={{
                padding: '0.5rem',
                background: '#fff3e0',
                border: '1px solid #ff9800',
                borderRadius: '6px',
                fontSize: '0.75rem',
                color: '#e65100',
                fontWeight: 600,
                flexShrink: 0,
              }}>
                {bidWarning}
              </div>
            )}

            {/* Action Buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flexShrink: 0 }}>
              <button
                onClick={handleSold}
                disabled={alreadyAuctioned || viewingHistory || !selectedTeam}
                style={{
                  padding: '0.6em',
                  borderRadius: '6px',
                  border: 'none',
                  background: alreadyAuctioned || viewingHistory || !selectedTeam ? '#e0e0e0' : '#4caf50',
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: '0.9rem',
                  cursor: alreadyAuctioned || viewingHistory || !selectedTeam ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s',
                  boxShadow: alreadyAuctioned || viewingHistory || !selectedTeam ? 'none' : '0 2px 8px rgba(76, 175, 80, 0.3)',
                }}
              >
                ✓ SOLD
              </button>
              <button
                onClick={handleUnsold}
                disabled={alreadyAuctioned || viewingHistory}
                style={{
                  padding: '0.6em',
                  borderRadius: '6px',
                  border: 'none',
                  background: alreadyAuctioned || viewingHistory ? '#e0e0e0' : '#f44336',
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: '0.9rem',
                  cursor: alreadyAuctioned || viewingHistory ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s',
                  boxShadow: alreadyAuctioned || viewingHistory ? 'none' : '0 2px 8px rgba(244, 67, 54, 0.3)',
                }}
              >
                ✗ UNSOLD
              </button>
              
              {/* Undo and Next Player Buttons */}
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  onClick={handleUndo}
                  disabled={auctionLog.length === 0 || viewingHistory}
                  style={{
                    flex: 1,
                    padding: '0.6em',
                    borderRadius: '6px',
                    border: 'none',
                    background: auctionLog.length === 0 || viewingHistory ? '#e0e0e0' : '#9e9e9e',
                    color: '#fff',
                    fontWeight: 700,
                    fontSize: '0.9rem',
                    cursor: auctionLog.length === 0 || viewingHistory ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s',
                    boxShadow: auctionLog.length === 0 || viewingHistory ? 'none' : '0 2px 8px rgba(158, 158, 158, 0.3)',
                  }}
                >
                  ↶ UNDO
                </button>
                <button
                  onClick={handleNext}
                  disabled={!soldStatus || viewingHistory}
                  style={{
                    flex: 1,
                    padding: '0.6em',
                    borderRadius: '6px',
                    border: 'none',
                    background: !soldStatus || viewingHistory ? '#e0e0e0' : '#2196f3',
                    color: '#fff',
                    fontWeight: 700,
                    fontSize: '0.9rem',
                    cursor: !soldStatus || viewingHistory ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s',
                    boxShadow: !soldStatus || viewingHistory ? 'none' : '0 2px 8px rgba(33, 150, 243, 0.3)',
                  }}
                >
                  → NEXT
                </button>
              </div>
              
              <button
                onClick={handleMoveToNextRound}
                disabled={!canMoveToNextRound || viewingHistory}
                style={{
                  padding: '0.6em',
                  borderRadius: '6px',
                  border: 'none',
                  background: !canMoveToNextRound || viewingHistory ? '#e0e0e0' : '#ff9800',
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: '0.9rem',
                  cursor: !canMoveToNextRound || viewingHistory ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s',
                  boxShadow: !canMoveToNextRound || viewingHistory ? 'none' : '0 2px 8px rgba(255, 152, 0, 0.3)',
                }}
              >
                → NEXT ROUND
              </button>
          </div>
        </div>
      </div>
    </>
  );
}

export default AuctionScreen;
