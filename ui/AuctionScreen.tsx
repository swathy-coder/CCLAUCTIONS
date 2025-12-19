import { useState, useEffect, useRef, useCallback } from 'react';
import './AuctionScreen.css';
import { saveAuctionStateOnline } from '../src/firebase';

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
  owner?: string;
};

export type Team = { 
  name: string; 
  balance: number; 
  logo?: string; 
  acquired?: number 
};

type AuctionLogEntry = {
  round: number;
  attempt: number;
  timestamp: string;
  playerName: string;
  team: string;
  amount: number | '';
  status: 'Sold' | 'Unsold';
  category?: string;
  notes?: string;
};

export type ResumeData = {
  round: number;
  playerIdx: number;
  sequence: string[];
  balances: Record<string, {balance: number; acquired: number}>;
  log: AuctionLogEntry[];
};

interface AuctionScreenProps {
  players?: Player[];
  teams?: Team[];
  defaultBalance?: number;
  resumeData?: ResumeData;
  auctionId: string;
  minPlayersPerTeam?: number;
  maxPlayersPerTeam?: number;
  blueCapPercent?: number;
}

// Helper: Snap bid to nearest 10-lakh (100 unit) multiple
function snapToMultiple(units: number): number {
  return Math.round(units / 100) * 100;
}

// Helper: Format bid units to currency
// 10 units = 1 lakh, 100 units = 10 lakhs, 1000 units = 1 crore, 10000 units = 10 crore
function formatBidCurrency(units: number): string {
  if (units >= 1000) {
    const crores = units / 1000;
    return `₹${crores.toFixed(2)} Cr`;
  }
  const lakhs = units / 10;
  return `₹${lakhs.toFixed(1)} L`;
}

// Helper: Format balance (already in units)
// 10 units = 1 lakh, 100 units = 10 lakhs, 1000 units = 1 crore, 10000 units = 10 crore
function formatCurrency(units: number): string {
  if (units >= 1000) {
    const crores = units / 1000;
    return `₹${crores.toFixed(2)} Cr`;
  }
  const lakhs = units / 10;
  return `₹${lakhs.toFixed(1)} L`;
}

function AuctionScreen({ 
  players = [], 
  teams = [], 
  defaultBalance = 0, 
  resumeData, 
  auctionId, 
  minPlayersPerTeam = 6,
  maxPlayersPerTeam = 12,
  blueCapPercent = 65
}: AuctionScreenProps) {
  console.log('AuctionScreen mounted with players:', players?.length, 'teams:', teams?.length, 'auctionId:', auctionId);
  console.log('Players data:', players);
  console.log('Teams data:', teams);
  
  // Helper function to randomize array
  const randomizeArray = (arr: Player[]): Player[] => {
    console.log('randomizeArray called with:', arr?.length, 'items');
    if (!arr || arr.length === 0) return [];
    return [...arr].sort(() => Math.random() - 0.5);
  };

  // Helper function to sort players by auction order
  const sortPlayersByAuctionOrder = (playersToSort: Player[] | undefined): Player[] => {
    console.log('sortPlayersByAuctionOrder called with:', playersToSort?.length, 'items');
    if (!playersToSort || playersToSort.length === 0) return playersToSort || [];
    
    try {
      const redOwners = randomizeArray(playersToSort.filter(p => p.owner === 'yes' && (p.category || '').toLowerCase() === 'red'));
      console.log('redOwners:', redOwners.length);
      const blueOwners = randomizeArray(playersToSort.filter(p => p.owner === 'yes' && (p.category || '').toLowerCase() === 'blue'));
      console.log('blueOwners:', blueOwners.length);
      const bluePlayers = randomizeArray(playersToSort.filter(p => p.owner !== 'yes' && (p.category || '').toLowerCase() === 'blue'));
      console.log('bluePlayers:', bluePlayers.length);
      const redPlayers = randomizeArray(playersToSort.filter(p => p.owner !== 'yes' && (p.category || '').toLowerCase() === 'red'));
      console.log('redPlayers:', redPlayers.length);
      
      const result = [...redOwners, ...blueOwners, ...bluePlayers, ...redPlayers];
      console.log('sortPlayersByAuctionOrder result:', result.length);
      return result;
    } catch (error) {
      console.error('Error in sortPlayersByAuctionOrder:', error);
      throw error;
    }
  };
  
  // Core state - MUST be before any early returns for React hooks rules
  const [playerIdx, setPlayerIdx] = useState(resumeData?.playerIdx || 0);
  const [round, setRound] = useState(resumeData?.round || 1);
  const [auctionLog, setAuctionLog] = useState<AuctionLogEntry[]>(resumeData?.log || []);
  const [skippedBluePlayers, setSkippedBluePlayers] = useState<string[]>([]);
  console.log('Initializing orderedPlayers...');
  const [orderedPlayers, setOrderedPlayers] = useState(() => {
    try {
      if (resumeData?.sequence && resumeData.sequence.length > 0) {
        const byName: Record<string, Player> = {};
        players.forEach(p => { byName[p.name] = p; });
        return resumeData.sequence.map(name => byName[name]).filter(Boolean);
      }
      const result = players && players.length > 0 ? sortPlayersByAuctionOrder(players) : players;
      console.log('orderedPlayers initialized with:', result?.length, 'players');
      return result;
    } catch (error) {
      console.error('ERROR in orderedPlayers initialization:', error);
      // Return empty array as fallback
      return [];
    }
  });
  console.log('orderedPlayers state set to:', orderedPlayers?.length);

  // Team state
  const [teamBalances, setTeamBalances] = useState(() => {
    // Balance is already in units from AuctionSetup page (10000 units = ₹10Cr)
    // Only convert if it appears to be in rupees (very large numbers like 100000000)
    const normalizeBalance = (balance: number) => {
      // If balance > 50000, it's likely in rupees and needs conversion to units
      // (50000 units = ₹5Cr is an upper bound for normal auction budgets)
      if (balance > 50000) {
        return Math.round(balance / 10000); // Convert rupees to units
      }
      return balance; // Already in units
    };
    
    if (resumeData?.balances) {
      return teams.map(t => ({
        ...t,
        balance: resumeData.balances[t.name]?.balance ?? normalizeBalance(t.balance && t.balance > 0 ? t.balance : defaultBalance),
        acquired: resumeData.balances[t.name]?.acquired ?? 0
      }));
    }
    return teams.map(t => ({
      ...t,
      balance: normalizeBalance(t.balance && t.balance > 0 ? t.balance : defaultBalance),
      acquired: 0
    }));
  });

  // Bidding state
  const [selectedTeam, setSelectedTeam] = useState('');
  const [bidUnits, setBidUnits] = useState(0); // Default 0
  const [bidError, setBidError] = useState('');

  // Distribution state
  const [distributionMode, setDistributionMode] = useState(false);
  const [pendingAssignments, setPendingAssignments] = useState<Array<{
    playerName: string;
    teamName: string;
    amount: number;
  }>>([]);
  const [currentDistributionPlayer, setCurrentDistributionPlayer] = useState<Player | null>(null);
  const [distributionTeamSelection, setDistributionTeamSelection] = useState('');
  const [distributionAmount, setDistributionAmount] = useState(0);

  // UI state
  const [auctionComplete, setAuctionComplete] = useState(false);
  const [isEditingLog, setIsEditingLog] = useState(false);
  const [editedLog, setEditedLog] = useState<AuctionLogEntry[]>([]);
  const [showSoldOverlay, setShowSoldOverlay] = useState(false);
  const [lastSoldTeam, setLastSoldTeam] = useState('');
  const [lastSoldAmount, setLastSoldAmount] = useState(0);
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
      .filter(log => log.team === teamName && log.status === 'Sold')
      .map(log => ({
        name: log.playerName,
        amount: log.amount as number,
        category: log.category || 'Unknown'
      }));
  };

  // Get unsold players
  const getUnsoldPlayers = (): Player[] => {
    const soldNames = new Set(auctionLog.filter(l => l.status === 'Sold').map(l => l.playerName));
    return orderedPlayers.filter(p => !soldNames.has(p.name));
  };

  // Check if all teams met minimum quota
  const allTeamsMetMinimum = (): boolean => {
    return teamBalances.every(team => (team.acquired || 0) >= minPlayersPerTeam);
  };

  // Get teams eligible for distribution (met minimum, have slots)
  const getEligibleDistributionTeams = (): Team[] => {
    return teamBalances.filter(team => {
      const acquired = team.acquired || 0;
      return acquired >= minPlayersPerTeam && acquired < maxPlayersPerTeam;
    });
  };

  // Handle distribution assignment
  const handleDistributionAssign = () => {
    if (!currentDistributionPlayer || !distributionTeamSelection) {
      alert('Please select a team');
      return;
    }

    const assignment = {
      playerName: currentDistributionPlayer.name,
      teamName: distributionTeamSelection,
      amount: distributionAmount
    };

    setPendingAssignments([...pendingAssignments, assignment]);

    // Move to next unsold player
    const unsold = getUnsoldPlayers();
    const currentIdx = unsold.findIndex(p => p.name === currentDistributionPlayer.name);
    if (currentIdx < unsold.length - 1) {
      setCurrentDistributionPlayer(unsold[currentIdx + 1]);
      setDistributionTeamSelection('');
      setDistributionAmount(0);
    } else {
      // All assigned
      setCurrentDistributionPlayer(null);
    }
  };

  // Confirm all distribution assignments
  const handleConfirmDistribution = () => {
    if (pendingAssignments.length === 0) {
      alert('No assignments made');
      return;
    }

    // Apply all assignments to auction log and team balances
    const updatedLog = [...auctionLog];
    const updatedBalances = teamBalances.map(t => ({ ...t }));

    pendingAssignments.forEach(assignment => {
      // Find player
      const player = orderedPlayers.find(p => p.name === assignment.playerName);
      if (!player) return;

      // Create log entry
      const logEntry: AuctionLogEntry = {
        round,
        attempt: updatedLog.filter(l => l.playerName === assignment.playerName).length + 1,
        timestamp: new Date().toLocaleString(),
        playerName: assignment.playerName,
        team: assignment.teamName,
        amount: assignment.amount,
        status: 'Sold',
        category: player.category || ''
      };

      updatedLog.push(logEntry);

      // Update team
      const teamIdx = updatedBalances.findIndex(t => t.name === assignment.teamName);
      if (teamIdx >= 0) {
        updatedBalances[teamIdx].acquired = (updatedBalances[teamIdx].acquired || 0) + 1;
        updatedBalances[teamIdx].balance -= assignment.amount;
      }
    });

    setAuctionLog(updatedLog);
    setTeamBalances(updatedBalances);
    setDistributionMode(false);
    setPendingAssignments([]);
    setCurrentDistributionPlayer(null);
    setAuctionComplete(true);
  };

  // Undo last assignment
  const handleUndoDistributionAssignment = (idx: number) => {
    setPendingAssignments(pendingAssignments.filter((_, i) => i !== idx));
  };

  const audienceWindowRef = useRef<Window | null>(null);
  const resumedRef = useRef(!!resumeData);

  // Set auction ID in URL and localStorage on mount
  useEffect(() => {
    if (auctionId) {
      // Update URL with auction ID if not already there
      const url = new URL(window.location.href);
      if (!url.searchParams.has('auction')) {
        url.searchParams.set('auction', auctionId);
        window.history.replaceState({}, '', url.toString());
      }
      
      // Store current auction ID for audience view
      localStorage.setItem('current_auction_id', auctionId);
      console.log('✅ Set auction ID in URL and localStorage:', auctionId);
    }
  }, [auctionId]);

  // Auto-skip blue players when all teams are at blue cap in round 1
  useEffect(() => {
    const player = orderedPlayers[playerIdx];
    if (!player) return;
    
    const isBlue = (player.category || '').toLowerCase() === 'blue';
    const shouldSkip = round === 1 && isBlue && allTeamsAtBlueCap();
    
    if (shouldSkip && !skippedBluePlayers.includes(player.name)) {
      console.log(`Auto-skipping blue player: ${player.name} (all teams at blue cap in Round 1)`);
      setSkippedBluePlayers(prev => [...prev, player.name]);
      
      // Move to next unsold player
      const nextIdx = findNextUnsoldPlayerIdx(playerIdx + 1);
      if (nextIdx === -1) {
        // No more players in this round - move to round 2 with blue cap reset
        console.log('All players in Round 1 processed. Moving to Round 2 (blue cap reset)');
        setRound(round + 1);
        setPlayerIdx(0); // Start from beginning with blue players now available
      } else {
        setPlayerIdx(nextIdx);
      }
    }
  }, [playerIdx, round, orderedPlayers, skippedBluePlayers, auctionLog, teamBalances]);

  // Get all sold player names (frozen - cannot be auctioned again)
  const soldPlayerNames = new Set(
    auctionLog
      .filter(entry => entry.status === 'Sold')
      .map(entry => entry.playerName)
  );

  // Calculate blue spending per team for the blue cap rule
  const getBlueSpentByTeam = useCallback((teamName: string): number => {
    return auctionLog
      .filter(entry => {
        if (entry.status !== 'Sold' || entry.team !== teamName) return false;
        // Use category from log entry (for resume support) or fall back to player lookup
        const categoryFromLog = (entry.category || '').toLowerCase();
        if (categoryFromLog) {
          return categoryFromLog === 'blue';
        }
        // Fallback: find the player to check if they're blue category
        const player = players.find(p => p.name === entry.playerName);
        return player && (player.category || '').toLowerCase() === 'blue';
      })
      .reduce((sum, entry) => sum + (typeof entry.amount === 'number' ? entry.amount : 0), 0);
  }, [auctionLog, players]);

  // Get the original team purse (initial balance)
  const getOriginalPurse = (teamName: string): number => {
    const team = teams.find(t => t.name === teamName);
    return team?.balance || 10000; // Default 10 Cr
  };

  // Calculate max blue bid allowed for a team
  // In round 1: Apply blue cap (65%). In round 2+: No blue cap restriction
  const getMaxBlueBid = (teamName: string): number => {
    if (round >= 2) {
      // Round 2+: No blue cap, use full remaining balance
      const team = teamBalances.find(t => t.name === teamName);
      return team ? team.balance : 0;
    }
    
    // Round 1: Apply blue cap
    const originalPurse = getOriginalPurse(teamName);
    const blueCap = (originalPurse * blueCapPercent) / 100;
    const blueSpent = getBlueSpentByTeam(teamName);
    return Math.max(0, blueCap - blueSpent);
  };

  // Helper to find next unsold player index starting from a given index
  const findNextUnsoldPlayerIdx = (startIdx: number): number => {
    for (let i = startIdx; i < orderedPlayers.length; i++) {
      if (!soldPlayerNames.has(orderedPlayers[i]?.name)) {
        return i;
      }
    }
    return -1; // No more unsold players
  };

  // Check if all teams are at blue cap
  const allTeamsAtBlueCap = (): boolean => {
    return teamBalances.every(team => {
      const originalPurse = getOriginalPurse(team.name);
      const blueCap = (originalPurse * blueCapPercent) / 100;
      const blueSpent = getBlueSpentByTeam(team.name);
      const blueLeft = Math.max(0, blueCap - blueSpent);
      return blueLeft < 10; // Less than ₹1L left for blue
    });
  };

  const currentPlayer = orderedPlayers[playerIdx];
  
  // Check if current player is blue category
  const isCurrentPlayerBlue = currentPlayer && (currentPlayer.category || '').toLowerCase() === 'blue';

  // Check if we should auto-skip this player (blue player in round 1 with all teams at blue cap)
  const shouldAutoSkipCurrentPlayer = (): boolean => {
    if (!currentPlayer || round !== 1) return false;
    if (!isCurrentPlayerBlue) return false;
    return allTeamsAtBlueCap();
  };
  
  const isCurrentPlayerSold = currentPlayer ? soldPlayerNames.has(currentPlayer.name) : false;
  const currentPlayerDecided = auctionLog.some(
    entry => entry.playerName === currentPlayer?.name && entry.round === round
  );

  // Firebase sync
  useEffect(() => {
    if (orderedPlayers.length === 0) return;
    
    // Calculate team roster data for sync
    const teamRosterData = teamBalances.map(team => {
      const acquired = team.acquired || 0;
      const remaining = team.balance;
      const needed = Math.max(0, minPlayersPerTeam - acquired);
      const minNeeded = needed <= 1 ? 0 : (needed - 1) * 100;
      const maxBidUnits = Math.max(0, remaining - minNeeded);
      const minRequired = acquired === 0 || needed <= 1 ? 0 : (needed - 1) * 100;
      const isAtRisk = acquired > 0 && remaining < minRequired && needed > 1;
      
      // Calculate total spent from auction log
      const totalSpent = auctionLog
        .filter(log => log.team === team.name && log.status === 'Sold')
        .reduce((sum, log) => sum + (typeof log.amount === 'number' ? log.amount : 0), 0);
      
      // Calculate blue budget
      const totalPurse = totalSpent + remaining;
      const blueBudget = Math.floor((blueCapPercent / 100) * totalPurse);
      const blueSpent = getBlueSpentByTeam(team.name);
      const blueLeft = Math.max(0, blueBudget - blueSpent);
      
      return {
        name: team.name,
        logo: team.logo,
        acquired,
        needed,
        totalSpent,
        balance: remaining,
        blueLeft,
        blueBudget,
        blueSpent,
        maxBidUnits,
        minNeeded,
        isAtRisk,
        isFull: acquired >= maxPlayersPerTeam,
        isComplete: acquired >= minPlayersPerTeam,
      };
    });
    
    const auctionState = {
      auctionId, // Include auction ID for recovery
      currentPlayer: orderedPlayers[playerIdx] || null,
      soldPlayers: auctionLog.filter(l => l.status === 'Sold'),
      teams: teamBalances,
      round,
      auctionComplete,
      auctionLog,
      teamBalances,
      teamRosterData, // Pre-calculated roster data
      minPlayersPerTeam,
      maxPlayersPerTeam,
      isSold: showSoldOverlay,
      soldToTeam: lastSoldTeam,
      soldAmount: lastSoldAmount,
      blueCapPercent,
      players: orderedPlayers,
      playerIdx, // Include player index for recovery
    };
    
    console.log('💾 Syncing auction state - auctionLog entries:', auctionLog.length, 'currentPlayer:', auctionState.currentPlayer?.name);
    saveAuctionStateOnline(auctionId, auctionState);
    try {
      localStorage.setItem(`auction_${auctionId}`, JSON.stringify(auctionState));
      console.log('✅ Saved to localStorage with', auctionLog.length, 'auction log entries');
    } catch (e) {
      if (e instanceof Error && e.name === 'QuotaExceededError') {
        console.warn('⚠️ localStorage quota exceeded, relying on Firebase only');
        // Try to clear old auction data to free up space
        const keys = Object.keys(localStorage);
        for (const key of keys) {
          if (key.startsWith('auction_') && key !== `auction_${auctionId}`) {
            localStorage.removeItem(key);
          }
        }
        // Try again after cleanup
        try {
          localStorage.setItem(`auction_${auctionId}`, JSON.stringify(auctionState));
        } catch {
          console.error('⚠️ Could not save to localStorage even after cleanup, relying on Firebase');
        }
      } else {
        throw e;
      }
    }
  }, [playerIdx, auctionLog, teamBalances, round, auctionComplete, auctionId, orderedPlayers, showSoldOverlay, lastSoldTeam, lastSoldAmount, blueCapPercent, getBlueSpentByTeam, minPlayersPerTeam, maxPlayersPerTeam]);

  // Open audience view in new tab on mount
  useEffect(() => {
    console.log('useEffect check: resumedRef.current=', resumedRef.current, 'orderedPlayers.length=', orderedPlayers.length, 'audienceWindowRef.current=', audienceWindowRef.current);
    if (!resumedRef.current && orderedPlayers.length > 0 && !audienceWindowRef.current) {
      console.log('Opening audience view window...');
      const timer = setTimeout(() => {
        const baseUrl = window.location.origin + window.location.pathname;
        const audienceUrl = `${baseUrl}?audienceView=true&auction=${auctionId}`;
        console.log('Audience URL:', audienceUrl);
        const newWindow = window.open(audienceUrl, '_blank');
        if (newWindow) {
          console.log('Window opened successfully');
          audienceWindowRef.current = newWindow;
        } else {
          console.log('Window open blocked or failed');
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [orderedPlayers.length, auctionId]);

  // Validate bid
  const validateBid = (): { valid: boolean; error: string } => {
    if (!selectedTeam) {
      return { valid: false, error: 'Please select a team' };
    }
    if (bidUnits === 0) {
      return { valid: false, error: 'Bid must be at least 100 units (₹10L)' };
    }
    
    // Minimum bid is 100 units (10 lakhs)
    if (bidUnits < 100) {
      return { valid: false, error: 'Bid must be at least 100 units (₹10L)' };
    }
    
    // Check if multiple of 100 (10 lakhs)
    if (bidUnits % 100 !== 0) {
      const snapped = snapToMultiple(bidUnits);
      return { valid: false, error: `Bid must be multiple of 100 units (₹10L). Snap to ${snapped}?` };
    }

    const team = teamBalances.find(t => t.name === selectedTeam);
    if (!team) return { valid: false, error: 'Invalid team' };

    const acquired = team.acquired || 0;
    const needed = Math.max(0, minPlayersPerTeam - acquired);
    
    // Calculate max bid allowed: remaining balance - minimum needed
    // Minimum needed = needed × 100 units = needed × ₹10L
    // If team needs only 1 more player, they can go all-in (no reserve needed)
    const minNeededBalanceUnits = needed <= 1 ? 0 : (needed - 1) * 100;
    const maxBidBalanceUnits = Math.max(0, team.balance - minNeededBalanceUnits);
    const maxBidAllowed = maxBidBalanceUnits; // Already in bid units
    
    // Check if bid exceeds maximum allowed
    if (bidUnits > maxBidAllowed) {
      const excessAmount = bidUnits - maxBidAllowed;
      return { 
        valid: false, 
        error: `Bid exceeds maximum allowed (${formatBidCurrency(maxBidAllowed)}). Reduce by ${formatBidCurrency(excessAmount)}` 
      };
    }

    // Blue cap check: if current player is blue, check if bid exceeds blue budget
    if (isCurrentPlayerBlue) {
      const maxBlueBidForTeam = getMaxBlueBid(selectedTeam);
      if (bidUnits > maxBlueBidForTeam) {
        return { 
          valid: false, 
          error: `🔵 Blue cap exceeded! Max blue bid: ${formatBidCurrency(maxBlueBidForTeam)} (${blueCapPercent}% rule)` 
        };
      }
    }

    return { valid: true, error: '' };
  };

  // Handle team selection
  const handleTeamSelect = (teamName: string) => {
    setSelectedTeam(teamName);
    setBidError('');
  };

  // Handle bid input
  const handleBidChange = (value: string) => {
    const num = parseInt(value) || 0;
    setBidUnits(num);
    setBidError('');
  };

  // Quick add buttons
  const handleQuickAdd = (amount: number) => {
    setBidUnits(prev => prev + amount);
    setBidError('');
  };

  // Snap bid to nearest multiple
  const handleSnapBid = () => {
    const snapped = snapToMultiple(bidUnits);
    setBidUnits(snapped);
    setBidError('');
  };

  // Auto-download bid log after each action
  const downloadBidLog = (updatedLog: AuctionLogEntry[]) => {
    try {
      // Build CSV with __STATE__ metadata for resume functionality
      const lines: string[] = [];
      
      // Add state metadata rows
      lines.push(`__STATE__,round,${round}`);
      lines.push(`__STATE__,playerIdx,${playerIdx}`);
      lines.push(`__STATE__,sequence,${orderedPlayers.map(p => p.name).join('|')}`);
      
      // Add balances
      const balancesStr = teamBalances.map(t => `${t.name}=${t.balance}:${t.acquired || 0}`).join('|');
      lines.push(`__STATE__,balances,${balancesStr}`);
      
      // Add header
      lines.push('Sequence,Round,Attempt,Timestamp,Player,Category,Team,Bid Amount,Status');
      
      // Add log entries
      updatedLog.forEach((entry, idx) => {
        const escape = (v: unknown) => {
          if (v === null || v === undefined) return '';
          let s = String(v).replace(/\r\n|\r|\n/g, '\n');
          if (/[",\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
          return s;
        };
        
        const seq = idx + 1;
        lines.push(`${seq},${escape(entry.round)},${escape(entry.attempt)},${escape(entry.timestamp)},${escape(entry.playerName)},${escape(entry.category || '')},${escape(entry.team)},${escape(entry.amount)},${escape(entry.status)}`);
      });
      
      const csv = '\uFEFF' + lines.join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      const timestamp = new Date().toISOString().slice(0, 10);
      a.download = `auction-log-${auctionId}-${timestamp}.csv`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { document.body.removeChild(a); }, 0);
    } catch (error) {
      console.error('Error downloading bid log:', error);
    }
  };

  // Handle SOLD
  const handleSold = async () => {
    setShowSoldOverlay(true);
    const validation = validateBid();
    if (!validation.valid) {
      setBidError(validation.error);
      return;
    }

    setLastSoldTeam(selectedTeam);
    setLastSoldAmount(bidUnits);

    const newLog: AuctionLogEntry = {
      round,
      attempt: auctionLog.filter(l => l.playerName === currentPlayer.name).length + 1,
      timestamp: new Date().toLocaleString(),
      playerName: currentPlayer.name,
      team: selectedTeam,
      amount: bidUnits,
      status: 'Sold',
      category: currentPlayer.category || ''
    };

    const updatedLog = [...auctionLog, newLog];
    setAuctionLog(updatedLog);
    
    // Bid units are already in the correct format, no conversion needed
    // (bidUnits already represents the amount directly)
    const bidInBalanceUnits = bidUnits;
    
    setTeamBalances(teamBalances.map(t => 
      t.name === selectedTeam 
        ? { ...t, balance: t.balance - bidInBalanceUnits, acquired: (t.acquired || 0) + 1 }
        : t
    ));

    // Reset for next
    setSelectedTeam('');
    setBidUnits(0);
    setBidError('');
    
    // Auto-download bid log
    downloadBidLog(updatedLog);
    
    // Check if auction complete
    checkAuctionComplete(playerIdx + 1, updatedLog);
  };

  // Handle UNSOLD
  const handleUnsold = async () => {
    // Reset any sold overlay state first
    setShowSoldOverlay(false);
    setLastSoldTeam('');
    setLastSoldAmount(0);
    
    const newLog: AuctionLogEntry = {
      round,
      attempt: auctionLog.filter(l => l.playerName === currentPlayer.name).length + 1,
      timestamp: new Date().toLocaleString(),
      playerName: currentPlayer.name,
      team: '',
      amount: '',
      status: 'Unsold',
      category: currentPlayer.category || ''
    };

    const updatedLog = [...auctionLog, newLog];
    setAuctionLog(updatedLog);
    
    setSelectedTeam('');
    setBidUnits(0);
    setBidError('');

    // Auto-download bid log
    downloadBidLog(updatedLog);

    checkAuctionComplete(playerIdx + 1, updatedLog);
  };

  // Handle NEXT PLAYER - skips sold players
  const handleNextPlayer = () => {
    setShowSoldOverlay(false);
    setLastSoldTeam('');
    setLastSoldAmount(0);
    
    // Find the next unsold player
    const nextIdx = findNextUnsoldPlayerIdx(playerIdx + 1);
    
    if (nextIdx !== -1) {
      setPlayerIdx(nextIdx);
      setSelectedTeam('');
      setBidUnits(0);
      setBidError('');
    } else {
      // No more unsold players in list, check if we need next round
      const unsoldInCurrentRound = auctionLog.filter(
        entry => entry.round === round && entry.status === 'Unsold'
      );
      
      if (unsoldInCurrentRound.length > 0) {
        // There are unsold players from this round - prompt for next round
        alert('No more players in queue. Click "Next Round" to continue with unsold players.');
      } else {
        // All players sold!
        setAuctionComplete(true);
      }
    }
  };

  // Handle UNDO
  const handleUndo = () => {
    setShowSoldOverlay(false);
    setLastSoldTeam('');
    setLastSoldAmount(0);
    if (auctionLog.length === 0) return;

    const lastEntry = auctionLog[auctionLog.length - 1];
    const newLog = auctionLog.slice(0, -1);
    setAuctionLog(newLog);

    // Revert team balance if sold
    if (lastEntry.status === 'Sold' && lastEntry.team && typeof lastEntry.amount === 'number') {
      // Bid units are already in the correct format, no conversion needed
      const amountToRevert = (lastEntry.amount as number);
      setTeamBalances(teamBalances.map(t =>
        t.name === lastEntry.team
          ? { ...t, balance: t.balance + amountToRevert, acquired: Math.max(0, (t.acquired || 0) - 1) }
          : t
      ));
    }

    // Move back player index if needed
    const playerName = lastEntry.playerName;
    const playerStillHasEntries = newLog.some(e => e.playerName === playerName && e.round === lastEntry.round);
    if (!playerStillHasEntries) {
      const idx = orderedPlayers.findIndex(p => p.name === playerName);
      if (idx !== -1 && idx < playerIdx) {
        setPlayerIdx(idx);
      }
    }
  };

  // Handle NEXT ROUND
  const handleNextRound = () => {
    // Check all unsold players have decision in current round
    const unsoldPlayersWithoutDecision = orderedPlayers.filter(player => {
      // Skip already sold players (frozen)
      if (soldPlayerNames.has(player.name)) return false;
      
      // Check if this unsold player has a decision in this round
      const hasDecision = auctionLog.some(
        entry => entry.playerName === player.name && entry.round === round
      );
      return !hasDecision;
    });

    if (unsoldPlayersWithoutDecision.length > 0) {
      alert(`${unsoldPlayersWithoutDecision.length} players still need decisions in round ${round}`);
      return;
    }

    // Get players marked unsold in this round (they go to next round)
    const unsoldInRound = auctionLog
      .filter(entry => entry.round === round && entry.status === 'Unsold')
      .map(entry => entry.playerName);

    if (unsoldInRound.length === 0) {
      alert('All players sold! Auction complete.');
      setAuctionComplete(true);
      return;
    }

    // Reorder: unsold players first (still in auction), sold players at end (frozen)
    const unsoldPlayers = orderedPlayers.filter(p => unsoldInRound.includes(p.name));
    const soldPlayers = orderedPlayers.filter(p => soldPlayerNames.has(p.name));
    const otherPlayers = orderedPlayers.filter(p => !unsoldInRound.includes(p.name) && !soldPlayerNames.has(p.name));
    
    // Reset sold overlay state before changing to new round
    setShowSoldOverlay(false);
    setLastSoldTeam('');
    setLastSoldAmount(0);
    
    setOrderedPlayers([...unsoldPlayers, ...otherPlayers, ...soldPlayers]);
    setPlayerIdx(0); // First player in new order should be unsold
    setRound(round + 1);
  };

  // Check if auction is complete
  const checkAuctionComplete = (nextIdx: number, currentLog: AuctionLogEntry[]) => {
    // If this was the last player and they're sold, check if any unsold remain
    if (nextIdx >= orderedPlayers.length) {
      const unsoldCount = currentLog.filter(entry => 
        entry.round === round && entry.status === 'Unsold'
      ).length;

      if (unsoldCount === 0) {
        setAuctionComplete(true);
      }
    }
  };

  // Download auction log CSV
  const downloadAuctionLogCSV = () => {
    const headers = ['Round', 'Attempt', 'Timestamp', 'Player', 'Category', 'Team', 'Bid Units', 'Bid Amount', 'Status', 'Notes'];
    const rows = auctionLog.map(entry => [
      entry.round,
      entry.attempt,
      entry.timestamp,
      entry.playerName,
      entry.category || '',
      entry.team || '-',
      typeof entry.amount === 'number' ? entry.amount : '-',
      typeof entry.amount === 'number' ? formatBidCurrency(entry.amount) : '-',
      entry.status,
      entry.notes || ''
    ]);

    const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `auction-log-${new Date().toISOString()}.csv`;
    a.click();
  };

  // Download Team Rosters CSV
  const downloadTeamRosters = () => {
    const escape = (val: string | number) => {
      const s = String(val);
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };

    const lines: string[] = [];
    
    // Header row with team names
    const header = teamBalances.map(t => t.name);
    lines.push(header.map(escape).join(',') + ',' + header.map(escape).join(','));
    
    // Subheader row
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
          row.push(typeof playerList[i].amount === 'number' ? formatBidCurrency(playerList[i].amount as number) : '');
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
      spentRow.push('Total Spent', formatCurrency(totalSpent));
    });
    lines.push(spentRow.map(escape).join(','));

    // Add "Remaining Balance" row
    const balanceRow: (string | number)[] = [];
    teamBalances.forEach(team => {
      balanceRow.push('Remaining Balance', formatCurrency(team.balance));
    });
    lines.push(balanceRow.map(escape).join(','));

    const csv = '\uFEFF' + lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `team-rosters-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
    a.click();
  };

  // Safety check - if no players, show error
  if (!players || players.length === 0 || !orderedPlayers || orderedPlayers.length === 0) {
    return (
      <div style={{ padding: '2rem', color: 'red', fontSize: '1.5rem' }}>
        <h1>⚠️ No Players Loaded</h1>
        <p>Error: Players array is empty!</p>
        <p>Please go back and re-upload your data files.</p>
        <button onClick={() => window.location.reload()}>Reload Page</button>
      </div>
    );
  }

  // Button states - also check if player is already sold (frozen)
  const canSell = selectedTeam && bidUnits > 0 && validateBid().valid && !currentPlayerDecided && !isCurrentPlayerSold;
  const canUnsold = !currentPlayerDecided && !isCurrentPlayerSold;
  const canUndo = auctionLog.length > 0;
  const canNext = (currentPlayerDecided || isCurrentPlayerSold) && playerIdx < orderedPlayers.length - 1;
  const canNextRound = orderedPlayers
    .filter(p => !soldPlayerNames.has(p.name)) // Only check unsold players
    .every(p => auctionLog.some(entry => entry.playerName === p.name && entry.round === round));

  if (!currentPlayer) {
    return (
      <div className="auction-container">
        <div className="empty-state">
          <h2>No players available</h2>
          <p>Please import player data to begin the auction.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="auction-container">
      {/* Auction Complete Overlay */}
      {auctionComplete && (
        <div className="completion-overlay" onClick={() => setAuctionComplete(false)}>
          <div className="completion-content" onClick={(e) => e.stopPropagation()}>
            <h1>🎉 Auction Complete! 🎉</h1>
            <p>All players have been successfully auctioned</p>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button className="btn-primary" onClick={downloadTeamRosters}>
                📊 Download Team Rosters
              </button>
              <button className="btn-secondary" onClick={downloadAuctionLogCSV}>
                📋 Download Auction Log
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Shell */}
      <div className="content-shell">
        
        {/* Header Bar */}
        <div className="header-bar">
          <h1>CCL Auction 2026</h1>
          <div className="header-info">
            <span className="round-badge">
              Round {round}
              {round >= 2 && <span style={{ fontSize: '0.75em', marginLeft: '0.25rem' }}>(🔓 Blue Cap Off)</span>}
            </span>
            <span className="player-progress">Player {playerIdx + 1} / {orderedPlayers.length}</span>
            <a 
              href={`${window.location.origin}${window.location.pathname}?audienceView=true&auction=${auctionId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="audience-view-link"
              title="Open Audience View in new window"
            >
              📺 Audience View
            </a>
          </div>
        </div>

        {orderedPlayers.length === 0 ? (
          <div className="loading-state" style={{ padding: '2rem', textAlign: 'center' }}>
            <p>No players loaded. Please go back and import players first.</p>
          </div>
        ) : !currentPlayer ? (
          <div className="loading-state" style={{ padding: '2rem', textAlign: 'center' }}>
            <p>Loading player information...</p>
          </div>
        ) : (
        <div className="auction-grid">
          
          {/* Column 1: Player Image Card */}
          <div className="player-image-card card">
            <div className="photo-container">
              {currentPlayer.photo ? (
                <img 
                  src={currentPlayer.photo}
                  alt={currentPlayer.name}
                  className="player-photo"
                />
              ) : (
                <div className="player-photo-placeholder">
                  <span>No Photo Available</span>
                </div>
              )}
              {showSoldOverlay && (
                <div className="sold-overlay">
                  <span className="sold-text">SOLD</span>
                </div>
              )}
              {isCurrentPlayerSold && !showSoldOverlay && (
                <div className="frozen-overlay">
                  <span className="frozen-text">FROZEN</span>
                  <span className="frozen-subtext">Already Sold</span>
                </div>
              )}
            </div>
            <div className="player-stats">
              <div className="stat-item">
                <span className="stat-label">Age</span>
                <span className="stat-value">{currentPlayer.age}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Role</span>
                <span className="stat-value">{currentPlayer.role || currentPlayer.specialization}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Availability</span>
                <span className="stat-value">{currentPlayer.availability || 'Full'}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Flat</span>
                <span className="stat-value">{currentPlayer.flat}</span>
              </div>
            </div>
          </div>

          {/* Column 2: Player Info Card */}
          <div className="player-info-card card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
              <h2 className="player-name" style={{ margin: 0 }}>{currentPlayer.name}</h2>
              {shouldAutoSkipCurrentPlayer() && (
                <span style={{
                  padding: '0.4rem 0.8rem',
                  borderRadius: '0.5rem',
                  background: 'rgba(255, 152, 0, 0.3)',
                  border: '1px solid rgba(255, 152, 0, 0.8)',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  color: '#ff9800',
                  whiteSpace: 'nowrap',
                }}>
                  ⏭️ AUTO-SKIP (Round 2)
                </span>
              )}
              {currentPlayer.owner === 'yes' && (
                <span style={{
                  padding: '0.4rem 0.8rem',
                  borderRadius: '0.5rem',
                  background: 'rgba(255, 193, 7, 0.3)',
                  border: '1px solid rgba(255, 193, 7, 0.8)',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  color: '#ffc107',
                  whiteSpace: 'nowrap',
                }}>
                  👤 OWNER
                </span>
              )}
            </div>
            <div className="player-meta">
              {currentPlayer.owner !== 'yes' && (
                <span className="category-badge">{currentPlayer.category}</span>
              )}
              <span className="specialization">{currentPlayer.specialization}</span>
            </div>
            <div className="player-description">
              <p>{currentPlayer.description || 'No description available.'}</p>
            </div>
          </div>

          {/* Column 3: Control Pane (Sticky) */}
          <div className="control-pane card">
            <h3>Bidding Controls</h3>

            {/* Team Selection */}
            <div className="team-selection">
              <label>Select Team {isCurrentPlayerBlue && <span style={{ color: '#1976d2', fontSize: '0.85em' }}>(🔵 Blue Cap Active)</span>}</label>
              <div className="team-grid">
                {teamBalances.map(team => {
                  const acquired = team.acquired || 0;
                  const needed = Math.max(0, minPlayersPerTeam - acquired);
                  // Max bid allowed = balance - minimum needed
                  // Minimum needed = needed × 100 units = needed × ₹10L
                  // If team needs only 1 more player, they can go all-in (no reserve needed)
                  const minNeededBalanceUnits = needed <= 1 ? 0 : (needed - 1) * 100;
                  const maxBidBalanceUnits = Math.max(0, team.balance - minNeededBalanceUnits);
                  // Team can bid if max bid >= minimum (10 units = ₹1L)
                  const canAffordBalance = maxBidBalanceUnits >= 10;
                  
                  // Blue cap check: if current player is blue, check if team can afford within blue budget
                  const maxBlueBidForTeam = getMaxBlueBid(team.name);
                  const canAffordBlueCap = !isCurrentPlayerBlue || maxBlueBidForTeam >= 10;
                  
                  // Max players check: team cannot acquire more than maxPlayersPerTeam
                  const hasReachedMaxPlayers = acquired >= maxPlayersPerTeam;
                  
                  const canAfford = canAffordBalance && canAffordBlueCap && !hasReachedMaxPlayers;
                  const disabledReason = hasReachedMaxPlayers ? 'maxplayers' : (!canAffordBalance ? 'balance' : (!canAffordBlueCap ? 'bluecap' : ''));
                  
                  return (
                    <button
                      key={team.name}
                      className={`team-btn ${selectedTeam === team.name ? 'selected' : ''} ${!canAfford ? 'disabled' : ''} ${disabledReason === 'bluecap' ? 'bluecap-disabled' : ''} ${disabledReason === 'maxplayers' ? 'maxplayers-disabled' : ''}`}
                      onClick={() => handleTeamSelect(team.name)}
                      disabled={!canAfford}
                      aria-label={`Select ${team.name}`}
                      title={disabledReason === 'bluecap' ? `Blue cap reached: ${formatCurrency(maxBlueBidForTeam)} remaining` : (disabledReason === 'maxplayers' ? `Team full: ${acquired}/${maxPlayersPerTeam} players` : '')}
                    >
                      {team.logo && (
                        <img src={team.logo} alt={team.name} className="team-logo-small" />
                      )}
                      <span className="team-full-name">{team.name}</span>
                      {isCurrentPlayerBlue && canAfford && (
                        <span style={{ fontSize: '0.7em', color: '#1976d2', marginLeft: 'auto' }}>
                          🔵{formatCurrency(maxBlueBidForTeam)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Bid Amount */}
            <div className="bid-input-section">
              <label htmlFor="bid-input">Bid Amount (Units)</label>
              <input
                id="bid-input"
                type="number"
                value={bidUnits}
                onChange={(e) => handleBidChange(e.target.value)}
                className="bid-input"
                placeholder="0"
                min="0"
                step="100"
              />
              <div className="bid-display">
                {bidUnits > 0 ? formatBidCurrency(bidUnits) : '₹0'}
              </div>
              {bidUnits % 100 !== 0 && bidUnits > 0 && (
                <button className="btn-snap" onClick={handleSnapBid}>
                  Snap to {snapToMultiple(bidUnits)} units
                </button>
              )}
            </div>

            {/* Quick Add */}
            <div className="quick-add-section">
              <label>Quick Add</label>
              <div className="quick-add-buttons">
                <button className="btn-quick-add" onClick={() => handleQuickAdd(100)}>
                  +100 <small>(10L)</small>
                </button>
                <button className="btn-quick-add" onClick={() => handleQuickAdd(500)}>
                  +500 <small>(50L)</small>
                </button>
                <button className="btn-quick-add" onClick={() => handleQuickAdd(1000)}>
                  +1000 <small>(1Cr)</small>
                </button>
              </div>
            </div>

            {/* Error Display */}
            {bidError && (
              <div className="bid-error" role="alert">
                ⚠️ {bidError}
              </div>
            )}

            {/* Action Buttons */}
            <div className="action-buttons">
              <button 
                className={`btn-action btn-sold ${canSell ? '' : 'disabled'}`}
                onClick={handleSold}
                disabled={!canSell}
                aria-label="Mark player as sold"
              >
                ✓ SOLD
              </button>
              
              <button 
                className={`btn-action btn-unsold ${canUnsold ? '' : 'disabled'}`}
                onClick={handleUnsold}
                disabled={!canUnsold}
                aria-label="Mark player as unsold"
              >
                ✗ UNSOLD
              </button>

              <button 
                className={`btn-action btn-undo ${canUndo ? '' : 'disabled'}`}
                onClick={handleUndo}
                disabled={!canUndo}
                aria-label="Undo last action"
              >
                ↶ UNDO
              </button>

              <button 
                className={`btn-action btn-next ${canNext ? '' : 'disabled'}`}
                onClick={handleNextPlayer}
                disabled={!canNext}
                aria-label="Move to next player"
              >
                → NEXT PLAYER
              </button>

              <button 
                className={`btn-action btn-next-round ${canNextRound ? '' : 'disabled'}`}
                onClick={handleNextRound}
                disabled={!canNextRound}
                aria-label="Start next round"
              >
                ⇒ NEXT ROUND
              </button>

              {allTeamsMetMinimum() && getUnsoldPlayers().length > 0 && (
                <button 
                  className="btn-action btn-distribute"
                  onClick={() => {
                    const unsold = getUnsoldPlayers();
                    if (unsold.length > 0) {
                      setDistributionMode(true);
                      setCurrentDistributionPlayer(unsold[0]);
                    }
                  }}
                  aria-label="Distribute unsold players"
                >
                  📦 DISTRIBUTE
                </button>
              )}
            </div>
          </div>
        </div>
        )}

        {/* Team Roster Section */}
        <div className="team-roster-section">
          <h3>Team Roster</h3>
          <div className="roster-table-wrapper">
            <table className="roster-table">
              <thead>
                <tr>
                  <th>Team</th>
                  <th>Players</th>
                  <th>Needed</th>
                  <th>Spent</th>
                  <th>Balance</th>
                  <th>🔵 Blue Left</th>
                  <th>Max Bid</th>
                  <th>Min Reserve</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {teamBalances.map(team => {
                  const acquired = team.acquired || 0;
                  const remaining = team.balance;
                  const needed = Math.max(0, minPlayersPerTeam - acquired);
                  const minNeeded = needed <= 1 ? 0 : (needed - 1) * 100;
                  const maxBidBalanceUnits = Math.max(0, remaining - minNeeded);
                  const maxBidUnits = maxBidBalanceUnits;
                  const minRequired = acquired === 0 || needed <= 1 ? 0 : (needed - 1) * 100;
                  const isAtRisk = acquired > 0 && remaining < minRequired && needed > 1;
                  
                  // Calculate total spent
                  const totalSpent = auctionLog
                    .filter(log => log.team === team.name && log.status === 'Sold')
                    .reduce((sum, log) => sum + (typeof log.amount === 'number' ? log.amount : 0), 0);
                  
                  // Calculate blue budget
                  const totalPurse = totalSpent + remaining;
                  const blueBudget = Math.floor((blueCapPercent / 100) * totalPurse);
                  const blueSpent = getBlueSpentByTeam(team.name);
                  const blueLeft = Math.max(0, blueBudget - blueSpent);
                  const isBlueCapLow = blueLeft < blueBudget * 0.2;

                  const teamPlayers = getTeamPlayers(team.name);
                  const isExpanded = expandedTeams.has(team.name);

                  return (
                    <>
                      <tr 
                        key={team.name} 
                        className={`${isAtRisk ? 'at-risk' : ''} ${acquired > 0 ? 'expandable-row' : ''}`}
                        onClick={() => acquired > 0 && toggleTeamExpansion(team.name)}
                        style={{ cursor: acquired > 0 ? 'pointer' : 'default' }}
                      >
                        <td className="team-cell">
                          <span className="expand-icon">{acquired > 0 ? (isExpanded ? '▼' : '▶') : ''}</span>
                          {team.logo ? (
                            <>
                              <img src={team.logo} alt={team.name} className="team-logo-table" />
                              <span>{team.name}</span>
                            </>
                          ) : (
                            <span>{team.name}</span>
                          )}
                        </td>
                        <td className="players-cell">
                          <span className={acquired >= maxPlayersPerTeam ? 'full' : (acquired >= minPlayersPerTeam ? 'complete' : '')}>
                            {acquired}/{maxPlayersPerTeam}
                          </span>
                        </td>
                        <td className="needed-cell">
                          {needed > 0 ? <span className="needed-badge">{needed}</span> : <span className="done-badge">✓</span>}
                        </td>
                        <td className="spent-cell">
                          {formatCurrency(totalSpent)}
                        </td>
                        <td className="balance-cell">
                          {formatCurrency(remaining)}
                        </td>
                        <td className="blue-left-cell">
                          <span style={{ color: isBlueCapLow ? '#ff9800' : '#1976d2' }}>
                            {formatCurrency(blueLeft)}
                          </span>
                        </td>
                        <td className="max-bid-cell">
                          {acquired < maxPlayersPerTeam ? formatBidCurrency(maxBidUnits) : '—'}
                        </td>
                        <td className="min-needed-cell">
                          {acquired < maxPlayersPerTeam && needed > 0 ? formatBidCurrency(minNeeded) : '—'}
                        </td>
                        <td className="status-cell">
                          {isAtRisk && <span className="warning-badge">⚠️ At Risk</span>}
                          {acquired >= maxPlayersPerTeam && <span className="full-badge">🏆 Full</span>}
                          {acquired < maxPlayersPerTeam && acquired >= minPlayersPerTeam && <span className="success-badge">✓ Complete</span>}
                          {!isAtRisk && acquired < minPlayersPerTeam && <span className="progress-badge">In Progress</span>}
                        </td>
                      </tr>
                      {isExpanded && teamPlayers.length > 0 && (
                        <tr className="expanded-players-row">
                          <td colSpan={9}>
                            <div className="team-players-list">
                              <div className="players-grid">
                                {teamPlayers.map((player, idx) => (
                                  <div key={idx} className={`player-chip ${player.category.toLowerCase()}`}>
                                    <span className="player-name">{player.name}</span>
                                    <span className="player-amount">{formatCurrency(player.amount)}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Auction Log Section */}
        <div className="auction-log-section">
          <div className="log-header">
            <h3>Auction Log</h3>
            <div className="log-actions">
              <button 
                className="btn-secondary"
                onClick={() => {
                  setIsEditingLog(!isEditingLog);
                  if (!isEditingLog) {
                    setEditedLog([...auctionLog]);
                  } else {
                    // Save changes and recalculate team balances
                    setAuctionLog(editedLog);
                    
                    // Recalculate team balances from the edited log
                    const recalculatedBalances: Record<string, number> = {};
                    const recalculatedAcquired: Record<string, number> = {};
                    
                    // Initialize with original starting balances
                    teamBalances.forEach(team => {
                      recalculatedBalances[team.name] = 0;
                      recalculatedAcquired[team.name] = 0;
                    });
                    
                    // Calculate starting balance for each team (need to reverse-engineer from current state)
                    // For each sold entry in editedLog, subtract from the recalculated balance
                    const allSoldEntries = editedLog.filter(e => e.status === 'Sold');
                    
                    // First pass: get total spent by each team from log
                    const totalSpentByTeam: Record<string, number> = {};
                    allSoldEntries.forEach(entry => {
                      if (entry.team && typeof entry.amount === 'number') {
                        totalSpentByTeam[entry.team] = (totalSpentByTeam[entry.team] || 0) + entry.amount;
                        recalculatedAcquired[entry.team] = (recalculatedAcquired[entry.team] || 0) + 1;
                      }
                    });
                    
                    // Second pass: calculate current balance = original balance - total spent
                    // We need the original balance before any transactions
                    const originalBalances: Record<string, number> = {};
                    teams.forEach(team => {
                      const normalizeBalance = (balance: number) => {
                        if (balance > 50000) {
                          return Math.round(balance / 10000);
                        }
                        return balance;
                      };
                      originalBalances[team.name] = normalizeBalance(team.balance && team.balance > 0 ? team.balance : defaultBalance);
                    });
                    
                    // Calculate new team state
                    const newTeamBalances = teamBalances.map(team => ({
                      ...team,
                      balance: Math.max(0, (originalBalances[team.name] || 0) - (totalSpentByTeam[team.name] || 0)),
                      acquired: recalculatedAcquired[team.name] || 0
                    }));
                    
                    setTeamBalances(newTeamBalances);
                    
                    // Auto-download bid log after edits
                    downloadBidLog(editedLog);
                  }
                }}
              >
                {isEditingLog ? 'Save Changes' : 'Edit Log'}
              </button>
              <button className="btn-secondary" onClick={downloadAuctionLogCSV}>
                Download CSV
              </button>
            </div>
          </div>
          
          <div className="log-table-wrapper">
            <table className="log-table">
              <thead>
                <tr>
                  <th>Round</th>
                  <th>Attempt</th>
                  <th>Timestamp</th>
                  <th>Player</th>
                  <th>Cat</th>
                  <th>Team</th>
                  <th>Bid Units</th>
                  <th>Bid Amount</th>
                  <th>Status</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {(isEditingLog ? editedLog : auctionLog).map((entry, idx) => (
                  <tr key={idx} className={`log-row ${entry.status.toLowerCase()}`}>
                    <td>{entry.round}</td>
                    <td>{entry.attempt}</td>
                    <td>{entry.timestamp}</td>
                    <td>{entry.playerName}</td>
                    <td>
                      <span className={`category-tag ${(entry.category || '').toLowerCase()}`}>
                        {(entry.category || '').toUpperCase().slice(0, 1) || '-'}
                      </span>
                    </td>
                    <td>
                      {isEditingLog && entry.status === 'Sold' ? (
                        <input
                          type="text"
                          value={entry.team || ''}
                          onChange={(e) => {
                            const newLog = [...editedLog];
                            newLog[idx].team = e.target.value;
                            setEditedLog(newLog);
                          }}
                          className="log-edit-input team-input"
                          placeholder="Team"
                          list={`team-list-${idx}`}
                        />
                      ) : (
                        entry.team || '-'
                      )}
                      {isEditingLog && entry.status === 'Sold' && (
                        <datalist id={`team-list-${idx}`}>
                          {teamBalances.map(t => (
                            <option key={t.name} value={t.name} />
                          ))}
                        </datalist>
                      )}
                    </td>
                    <td>
                      {isEditingLog && entry.status === 'Sold' ? (
                        <input
                          type="number"
                          value={typeof entry.amount === 'number' ? entry.amount : ''}
                          onChange={(e) => {
                            const newLog = [...editedLog];
                            const newAmount = parseInt(e.target.value) || 0;
                            newLog[idx].amount = newAmount;
                            setEditedLog(newLog);
                          }}
                          className="log-edit-input bid-input"
                          placeholder="0"
                          min="0"
                          step="100"
                        />
                      ) : (
                        typeof entry.amount === 'number' ? entry.amount : '-'
                      )}
                    </td>
                    <td>
                      {typeof entry.amount === 'number' ? formatBidCurrency(entry.amount) : '-'}
                    </td>
                    <td>
                      <span className={`status-badge ${entry.status.toLowerCase()}`}>
                        {entry.status}
                      </span>
                    </td>
                    <td>
                      {isEditingLog ? (
                        <input
                          type="text"
                          value={entry.notes || ''}
                          onChange={(e) => {
                            const newLog = [...editedLog];
                            newLog[idx].notes = e.target.value;
                            setEditedLog(newLog);
                          }}
                          className="notes-input"
                        />
                      ) : (
                        entry.notes || ''
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* Distribution Modal */}
      {distributionMode && (
        <div className="modal-overlay" onClick={() => setDistributionMode(false)}>
          <div className="modal-content distribution-modal" onClick={(e) => e.stopPropagation()}>
            <h2>📦 Distribute Unsold Players</h2>
            
            {currentDistributionPlayer ? (
              <div className="distribution-form">
                <div className="player-display">
                  <h3>Player: {currentDistributionPlayer.name}</h3>
                  <span className={`player-badge ${currentDistributionPlayer.category?.toLowerCase() || ''}`}>
                    {currentDistributionPlayer.category || 'Unknown'}
                  </span>
                </div>

                <div className="form-group">
                  <label>Select Team:</label>
                  <select 
                    value={distributionTeamSelection}
                    onChange={(e) => setDistributionTeamSelection(e.target.value)}
                    className="team-selector"
                  >
                    <option value="">-- Select Team --</option>
                    {getEligibleDistributionTeams().map(team => (
                      <option key={team.name} value={team.name}>
                        {team.name} ({(team.acquired || 0)}/{maxPlayersPerTeam})
                      </option>
                    ))}
                  </select>
                </div>

                {distributionTeamSelection && (
                  <div className="form-group">
                    <label>Amount (Units):</label>
                    <input 
                      type="number"
                      value={distributionAmount}
                      onChange={(e) => setDistributionAmount(Math.max(0, parseInt(e.target.value) || 0))}
                      className="amount-input"
                      placeholder="0 (₹0)"
                      max={teamBalances.find(t => t.name === distributionTeamSelection)?.balance || 0}
                    />
                    <small>
                      Max available: {formatBidCurrency(teamBalances.find(t => t.name === distributionTeamSelection)?.balance || 0)}
                    </small>
                  </div>
                )}

                <div className="modal-actions">
                  <button 
                    className="btn-primary"
                    onClick={handleDistributionAssign}
                    disabled={!distributionTeamSelection}
                  >
                    ✓ Assign
                  </button>
                </div>
              </div>
            ) : (
              <div className="distribution-summary">
                <h3>Pending Assignments</h3>
                {pendingAssignments.length === 0 ? (
                  <p>No assignments yet</p>
                ) : (
                  <table className="assignments-table">
                    <thead>
                      <tr>
                        <th>Player</th>
                        <th>Team</th>
                        <th>Amount</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingAssignments.map((assign, idx) => (
                        <tr key={idx}>
                          <td>{assign.playerName}</td>
                          <td>{assign.teamName}</td>
                          <td>{assign.amount === 0 ? '₹0' : formatBidCurrency(assign.amount)}</td>
                          <td>
                            <button 
                              className="btn-small btn-danger"
                              onClick={() => handleUndoDistributionAssignment(idx)}
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                <div className="modal-actions">
                  <button 
                    className="btn-secondary"
                    onClick={() => setDistributionMode(false)}
                  >
                    ← Back
                  </button>
                  <button 
                    className="btn-primary"
                    onClick={handleConfirmDistribution}
                    disabled={pendingAssignments.length === 0}
                  >
                    ✓ Confirm Distribution
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default AuctionScreen;
