
import React, { useState, useRef } from 'react';
import { importFromCSV } from '../src/utils/csv';
import { generateAuctionId, setAuctionIdInUrl } from '../src/firebase';
import { loadAuctionSetupFromFile, createAuctionSetupSnapshot, saveAuctionSetupToFile } from '../src/logic/setupIO';
import { savePhotosToIndexedDB } from '../src/utils/storage';

const TOURNAMENT_TYPES = [
  'Men’s CCL',
  'Women’s CCL',
  'Kids CCL',
  'Senior Citizen CCL',
];

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
export type Team = { name: string; balance: number; logo?: string };
export type BidLog = {
  round: number;
  attempt: number;
  timestamp: string;
  playerName: string;
  status: 'Sold' | 'Unsold';
  team: string;
  amount: number | '';
  category?: string;
};

export type ResumeData = {
  round: number;
  playerIdx: number;
  sequence: string[];
  balances: Record<string, {balance: number; acquired: number}>;
  log: BidLog[];
  generated?: string;
};

interface AuctionSetupData {
  tournament: string;
  players: Player[];
  teams: Team[];
  bidLog: BidLog[];
  playerImages: Record<string, string>;
  teamLogos: Record<string, string>;
  defaultBalance: number;
  resumeData?: ResumeData;
  minPlayersPerTeam?: number;
  maxPlayersPerTeam?: number;
  blueCapPercent?: number;
}

export default function AuctionSetup({ onSetup }: { onSetup: (data: AuctionSetupData & {auctionId: string}) => void }) {
  // Helper to shuffle an array
  function shuffle<T>(arr: T[]): T[] {
    return arr
      .map((v) => [Math.random(), v] as [number, T])
      .sort((a, b) => a[0] - b[0])
      .map((x) => x[1]);
  }

  // Randomize blue/red players separately
  function randomizePlayers() {
    const blue = players.filter(p => (p.category || '').toLowerCase() === 'blue');
    const red = players.filter(p => (p.category || '').toLowerCase() === 'red');
    const other = players.filter(p => (p.category || '').toLowerCase() !== 'blue' && (p.category || '').toLowerCase() !== 'red');
    setPlayers([...shuffle(blue), ...shuffle(red), ...shuffle(other)]);
  }
  const [previewCollapsed, setPreviewCollapsed] = useState(false);
  const [previewMaximized, setPreviewMaximized] = useState(false);
  // Helper to handle CSV import for players or teams
  const handleCSV = async (
    e: React.ChangeEvent<HTMLInputElement>,
    setter: ((data: Player[]) => void) | ((data: Team[]) => void),
    type: 'player' | 'team'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setUploadProgress({ type, current: 0, total: 0 });
    const errors: string[] = [];
    
    try {
      // Import CSV with proper handling of quoted fields containing newlines (Alt+Enter in Excel)
      let data = await importFromCSV(file);
      if (!Array.isArray(data)) data = [];
      
      setUploadProgress({ type, current: data.length, total: data.length });
      console.log('CSV parsed rows:', data.length);
    if (type === 'player') {
      // Robust mapping for player fields
      const normalize = (s: string) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const cleanValue = (v: unknown): string => {
      const str = String(v || '').trim();
      if (str === '-' || str === '--' || str === '—' || str === '' || str === 'null' || str === 'undefined') return '';
      return str;
    };
    
    console.log('Raw CSV data rows:', data.length);
    
    // Process all rows and merge continuation rows (rows without ID/Name that belong to previous player)
    const mergedRows: Array<Record<string, unknown>> = [];
    let currentPlayer: Record<string, unknown> | null = null;
    
    data.forEach((row: Record<string, unknown>, rowIndex: number) => {
      const keys = Object.keys(row);
      const keyMap: { [norm: string]: string } = {};
      keys.forEach(k => { keyMap[normalize(k)] = k; });
      
      const id = cleanValue(row[keyMap['id']] || row[keyMap['playerid']] || row[keyMap['player_id']]);
      const name = cleanValue(row[keyMap['name']] || row[keyMap['playername']]);
      
      setUploadProgress({ type, current: rowIndex + 1, total: data.length });
      
      // If this row has an ID or name, it's a new player
      if (id.length > 0 || name.length > 0) {
        if (currentPlayer) {
          mergedRows.push(currentPlayer);
        }
        currentPlayer = { ...row };
      } else if (currentPlayer) {
        // This is a continuation row - merge description or other fields
        Object.keys(row).forEach(key => {
          const value = cleanValue(row[key]);
          if (value.length > 0) {
            const currentValue = cleanValue(currentPlayer![key]);
            // Append to description field if it has content
            if (normalize(key).includes('description') && currentValue.length > 0) {
              currentPlayer![key] = currentValue + ' ' + value;
            } else if (currentValue.length === 0) {
              currentPlayer![key] = row[key];
            }
          }
        });
      }
    });
    
    // Don't forget the last player
    if (currentPlayer) {
      mergedRows.push(currentPlayer);
    }
    
    console.log('Merged rows:', mergedRows.length);
    
    const players: Player[] = mergedRows
        .map((row: Record<string, unknown>, idx: number) => {
          const keys = Object.keys(row);
          const keyMap: { [norm: string]: string } = {};
          keys.forEach(k => { keyMap[normalize(k)] = k; });
          const id = cleanValue(row[keyMap['id']] || row[keyMap['playerid']] || row[keyMap['player_id']]);
          const name = cleanValue(row[keyMap['name']] || row[keyMap['playername']]);
          const age = cleanValue(row[keyMap['age']]);
          const flat = cleanValue(row[keyMap['flat']]);
          const specialization = cleanValue(row[keyMap['specialization']]);
          const description = cleanValue(row[keyMap['description']]);
          const category = cleanValue(row[keyMap['category']] || row[keyMap['bluered']]);
          const availability = cleanValue(row[keyMap['wouldyoubeavailableonallthematchdates23rdjan26thjan2026']] || row[keyMap['availability']]);
          const role = cleanValue(row[keyMap['role']]);
          const owner = cleanValue(row[keyMap['owner']]);
          
          // Validate required fields
          if (!id || id.length === 0) {
            errors.push(`Row ${idx + 2}: Missing required field 'ID'`);
          }
          if (!name || name.length === 0) {
            errors.push(`Row ${idx + 2}: Missing required field 'Name'`);
          }
          
          return {
            id,
            photo: '',
            name,
            age: Number(age) || 0,
            flat,
            description,
            specialization,
            category,
            availability,
            role,
            owner,
          } as Player;
        })
        .filter(p => p.name && p.name.length > 0);
      
      if (players.length === 0) {
        errors.push('No valid players found in CSV. Check that Name column exists and has values.');
      }
      
      (setter as (d: Player[]) => void)(players);
      console.log('Final players loaded:', players.length);
      console.log('Sample players:', players.slice(0, 3));
    } else if (type === 'team') {
      // Robust mapping for team name and balance
      const normalize = (s: string) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const teams: Team[] = data.map((row: Record<string, unknown>, idx: number) => {
        const keys = Object.keys(row);
        const keyMap: { [norm: string]: string } = {};
        keys.forEach(k => { keyMap[normalize(k)] = k; });
        const name = row[keyMap['name']] || row[keyMap['team']] || row[keyMap['teamname']] || row[keyMap['team_name']] || '';
        const nameStr = String(name).trim();
        
        if (!nameStr || nameStr.length === 0) {
          errors.push(`Row ${idx + 2}: Missing required field 'Team Name'`);
        }
        
        // Get balance from CSV using normalized key mapping
        let bal = row[keyMap['balance']] || row[keyMap['openingbalance']] || row[keyMap['initialbalance']] || row[keyMap['amount']];
        if (typeof bal === 'string') bal = bal.trim();
        let balNum = Number(bal);
        if (!bal || isNaN(balNum) || balNum === 0 || bal === '0' || bal === 0) {
          balNum = 10000; // Default balance if not specified in CSV
          console.log(`Row ${idx + 2}: Using default balance (10000) for team "${nameStr}"`);
        }
        return { name: nameStr, balance: balNum, logo: '' } as Team;
      });
      
      if (teams.length === 0) {
        errors.push('No valid teams found in CSV. Check that Name column exists and has values.');
      }
      
      (setter as (d: Team[]) => void)(teams);
      console.log('Teams loaded:', teams);
    }
    
    // Show errors or success
    if (errors.length > 0) {
      setValidationErrors(errors);
      const maxErrors = 10;
      const errorPreview = errors.slice(0, maxErrors).join('\n');
      const moreErrors = errors.length > maxErrors ? `\n... and ${errors.length - maxErrors} more errors` : '';
      alert(`CSV Upload Warnings/Errors (${errors.length} total):\n\n${errorPreview}${moreErrors}\n\nData loaded but please review the issues above.`);
    } else {
      setValidationErrors([]);
      const successMsg = type === 'player' 
        ? `✓ Successfully loaded ${data.length} players` 
        : `✓ Successfully loaded ${data.length} teams`;
      console.log(successMsg);
    }
    
    } catch (err) {
      const errorMsg = `Failed to parse CSV: ${err instanceof Error ? err.message : String(err)}`;
      errors.push(errorMsg);
      setValidationErrors(errors);
      alert(errorMsg);
    } finally {
      setUploadProgress({ type: null, current: 0, total: 0 });
      e.target.value = ''; // Reset input
    }
  };
  const [tournament, setTournament] = useState(TOURNAMENT_TYPES[0]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [bidLog] = useState<BidLog[]>([]);
  const [minPlayersPerTeam, setMinPlayersPerTeam] = useState(6);
  const [maxPlayersPerTeam, setMaxPlayersPerTeam] = useState(12);
  const [blueCapPercent, setBlueCapPercent] = useState(65);
  const [resumeData, setResumeData] = useState<ResumeData | undefined>(undefined);
  const [playerImages, setPlayerImages] = useState<{[id: string]: string}>({});
  const [teamLogos, setTeamLogos] = useState<{[name: string]: string}>({});
  const playerCSVRef = useRef<HTMLInputElement>(null);
  const teamCSVRef = useRef<HTMLInputElement>(null);
  const bidCSVRef = useRef<HTMLInputElement>(null);
  const playerImgRef = useRef<HTMLInputElement>(null);
  const teamLogoRef = useRef<HTMLInputElement>(null);
  const setupFileRef = useRef<HTMLInputElement>(null);
  const [customType, setCustomType] = useState('');
  // Track last uploaded file names
  // const [lastFiles] = useState<Record<string, string>>({}); // reserved for future
  
  // Progress and validation state
  const [uploadProgress, setUploadProgress] = useState<{type: 'player' | 'team' | 'resume' | null, current: number, total: number}>({ type: null, current: 0, total: 0 });
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  
  // Handle resume CSV upload
  const handleResumeCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    try {
      const text = await file.text();
      const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim().length > 0);
      
      console.log('Resume CSV - Total lines:', lines.length);
      console.log('First 5 lines:', lines.slice(0, 5));
      
      let headerIndex = -1;
      let newRound = 1;
      let newPlayerIdx = 0;
      let balancesMap: Record<string, {balance: number; acquired: number}> = {};
      let sequenceNames: string[] = [];
      
      // Parse __STATE__ meta rows
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.startsWith('__STATE__')) {
          const parts = line.split(',');
          const key = parts[1];
          const value = parts.slice(2).join(',');
          
          console.log(`Parsed state: ${key} = ${value}`);
          
          switch(key) {
            case 'round':
              newRound = Number(value) || 1;
              break;
            case 'playerIdx':
              newPlayerIdx = Number(value) || 0;
              break;
            case 'sequence':
              sequenceNames = value.split('|').filter(Boolean);
              break;
            case 'balances':
              balancesMap = {};
              value.split('|').forEach(seg => {
                if (!seg) return;
                const [teamPart, balAcq] = seg.split('=');
                if (!teamPart || !balAcq) return;
                const [balStr, acqStr] = balAcq.split(':');
                balancesMap[teamPart] = {
                  balance: Number(balStr) || 0,
                  acquired: Number(acqStr) || 0
                };
              });
              break;
          }
        } else if (line.startsWith('Sequence,')) {
          headerIndex = i;
          console.log('Found header at line', i);
          break;
        }
      }
      
      if (headerIndex === -1) {
        console.error('Could not find header line starting with "Sequence,"');
        console.error('Available lines:', lines.map((l, i) => `${i}: ${l.substring(0, 50)}`));
        alert('Invalid resume CSV format: missing header. Expected header starting with "Sequence,"');
        return;
      }
      
      // Detect format from header line
      const headerLine = lines[headerIndex];
      const hasCategory = headerLine.includes('Category');
      console.log('CSV format detection - hasCategory:', hasCategory, 'Header:', headerLine);
      
      // Parse log entries
      const logLines = lines.slice(headerIndex + 1).filter(l => l.trim().length > 0);
      const parsedLog: BidLog[] = [];
      
      console.log('Parsing', logLines.length, 'log lines');
      
      for (const line of logLines) {
        const parts: string[] = [];
        let cur = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
          const ch = line[i];
          if (ch === '"') {
            if (inQuotes && line[i + 1] === '"') {
              cur += '"';
              i++;
            } else {
              inQuotes = !inQuotes;
            }
          } else if (ch === ',' && !inQuotes) {
            parts.push(cur);
            cur = '';
          } else {
            cur += ch;
          }
        }
        parts.push(cur);
        
        // Handle both old format (8 columns) and new format with Category (9 columns)
        // Old: Sequence, Round, Attempt, Timestamp, Player, Team, Bid Amount, Status
        // New: Sequence, Round, Attempt, Timestamp, Player, Category, Team, Bid Amount, Status
        if (parts.length >= 8) {
          let roundStr, attemptStr, timestamp, playerName, category, team, amountStr, status;
          
          if (hasCategory && parts.length >= 9) {
            // New format with category
            [, roundStr, attemptStr, timestamp, playerName, category, team, amountStr, status] = parts;
          } else {
            // Old format without category
            [, roundStr, attemptStr, timestamp, playerName, team, amountStr, status] = parts;
            category = '';
          }
          
          console.log('Parsed entry:', { playerName, category, team, amountStr, status });
          
          parsedLog.push({
            round: Number(roundStr) || 1,
            attempt: Number(attemptStr) || 1,
            timestamp: timestamp || new Date().toLocaleString(),
            playerName: playerName || '',
            team: team || '',
            amount: amountStr && amountStr.trim() !== '' ? Number(amountStr) : '',
            status: (status as 'Sold' | 'Unsold') || 'Unsold',
            category: category || ''
          });
        }
      }
      
      console.log('Successfully parsed', parsedLog.length, 'log entries');
      
      // Store resume data
      const resume: ResumeData = {
        round: newRound,
        playerIdx: newPlayerIdx,
        sequence: sequenceNames,
        balances: balancesMap,
        log: parsedLog.reverse() // Reverse to newest-first for auction screen
      };
      
      setResumeData(resume);
      alert(`Resume data loaded: Round ${newRound}, ${parsedLog.length} log entries, ${sequenceNames.length} players in sequence`);
      
    } catch (err) {
      console.error('Failed to parse resume CSV:', err);
      alert('Failed to parse resume CSV. Please check the file format.');
    } finally {
      e.target.value = '';
    }
  };

  // Handle player image uploads - match by ID in filename
  const handlePlayerImages = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const imageMap: {[id: string]: string} = {};
    let loadedCount = 0;
    const totalFiles = files.length;
    console.log(`Loading ${totalFiles} player images...`);
    Array.from(files).forEach(file => {
      // Extract ID from filename (e.g., "1.jpg" -> "1", "player_23.png" -> "23")
      const match = file.name.match(/(\d+)/);
      if (match) {
        const id = match[1];
        const reader = new FileReader();
        reader.onload = (ev) => {
          if (ev.target?.result) {
            loadedCount++;
            imageMap[id] = ev.target.result as string;
            setPlayerImages(prev => ({...prev, [id]: ev.target!.result as string}));
            // Update player photo URLs
            setPlayers(prevPlayers => {
              const updated = prevPlayers.map(p => 
                p.id === id ? {...p, photo: ev.target!.result as string} : p
              );
              console.log(`Loaded image ${loadedCount}/${totalFiles} for player ID ${id}`);
              if (loadedCount === totalFiles) {
                console.log('All images loaded. Players with photos:', updated.filter(p => p.photo).length);
              }
              return updated;
            });
          }
        };
        reader.readAsDataURL(file);
      } else {
        console.warn(`Could not extract ID from filename: ${file.name}`);
      }
    });
  };

  // Handle team logo uploads - match by team name in filename
  const handleTeamLogos = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    let loadedCount = 0;
    const totalFiles = files.length;
    console.log(`Loading ${totalFiles} team logos...`);
    Array.from(files).forEach(file => {
      // Extract team name from filename (e.g., "TeamA.jpg", "team-b.png")
      // Remove extension and normalize
      const baseName = file.name.replace(/\.[^.]+$/, '').trim();
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (ev.target?.result) {
          loadedCount++;
          const logoData = ev.target.result as string;
          setTeamLogos(prev => ({...prev, [baseName]: logoData}));
          // Update team logos by matching name (case-insensitive partial match)
          setTeams(prevTeams => {
            const updated = prevTeams.map(t => {
              const teamNameNorm = t.name.toLowerCase().replace(/[^a-z0-9]/g, '');
              const fileNameNorm = baseName.toLowerCase().replace(/[^a-z0-9]/g, '');
              // Match if team name contains filename or filename contains team name
              if (teamNameNorm.includes(fileNameNorm) || fileNameNorm.includes(teamNameNorm)) {
                console.log(`Matched logo "${baseName}" to team "${t.name}"`);
                return {...t, logo: logoData};
              }
              return t;
            });
            console.log(`Loaded logo ${loadedCount}/${totalFiles} for "${baseName}"`);
            if (loadedCount === totalFiles) {
              console.log('All logos loaded. Teams with logos:', updated.filter(t => t.logo).length);
            }
            return updated;
          });
        }
      };
      reader.readAsDataURL(file);
    });
  };

  // Handle loading a previous auction setup from file
  const handleLoadSetup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const snapshot = await loadAuctionSetupFromFile(file);
      
      // Restore all setup data
      setTournament(snapshot.auctionName || TOURNAMENT_TYPES[0]);
      setCustomType(snapshot.auctionName);
      setBlueCapPercent(snapshot.settings.bluePlayerCap || 65);
      setMinPlayersPerTeam(snapshot.settings.minPlayersPerTeam || 6);
      setMaxPlayersPerTeam(snapshot.settings.maxPlayersPerTeam || 12);
      
      // Restore teams
      const restoredTeams = snapshot.teams.map(t => ({
        name: t.name,
        balance: t.budget || 10000,
        logo: t.logo // Already base64
      }));
      setTeams(restoredTeams);
      
      // Restore team logos map
      const logoMap: Record<string, string> = {};
      snapshot.teams.forEach((t) => {
        if (t.logo) {
          logoMap[t.name] = t.logo;
        }
      });
      setTeamLogos(logoMap);
      
      // Restore players from top-level players array
      const restoredPlayers = snapshot.players.map(p => ({
        id: p.id,
        name: p.name,
        photo: p.photo, // Already base64
        age: p.age || 0,
        flat: p.flat || '',
        description: p.description || '',
        specialization: p.specialization || '',
        category: p.category || '',
        availability: p.availability || '',
        role: p.role || '',
        owner: p.owner || '',
      }));
      setPlayers(restoredPlayers);
      
      // Restore player photos map
      const photoMap: Record<string, string> = {};
      restoredPlayers.forEach((p) => {
        if (p.photo) {
          photoMap[p.id] = p.photo;
        }
      });
      setPlayerImages(photoMap);
      
      // Restore auction state if available
      if (snapshot.auctionState) {
        // This will be used when resuming an auction
        setResumeData({
          round: snapshot.auctionState.round,
          playerIdx: 0,
          sequence: restoredPlayers.map(p => p.name),
          balances: Object.keys(snapshot.auctionState.teamBalances).reduce((acc, teamName) => {
            acc[teamName] = {
              balance: snapshot.auctionState.teamBalances[teamName],
              acquired: snapshot.auctionState.capLimitsUsed[teamName] || 0
            };
            return acc;
          }, {} as Record<string, {balance: number; acquired: number}>),
          log: snapshot.auctionState.auctionLog.map((entry, idx) => ({
            round: snapshot.auctionState.round,
            attempt: idx + 1,
            timestamp: entry.timestamp,
            playerName: entry.player || '',
            status: entry.action === 'sold' ? 'Sold' : 'Unsold' as const,
            team: entry.details || '',
            amount: 0,
            category: ''
          }))
        });
      }
      
      console.log('✅ Auction setup loaded successfully');
      alert(`✅ Setup loaded!\n\nTeams: ${restoredTeams.length}\nPlayers: ${restoredPlayers.length}\nAuction: ${snapshot.auctionName}\nMin per team: ${snapshot.settings.minPlayersPerTeam}\nMax per team: ${snapshot.settings.maxPlayersPerTeam}\nBlue cap: ${snapshot.settings.bluePlayerCap}%\n\nYou can now edit any details and start the auction.`);
    } catch (error) {
      const errorMsg = `Failed to load auction setup: ${error instanceof Error ? error.message : String(error)}`;
      alert(errorMsg);
      console.error(errorMsg);
    } finally {
      if (setupFileRef.current) {
        setupFileRef.current.value = '';
      }
    }
  };

  // Validate setup before starting auction
  const validateSetup = (): { valid: boolean; errors: string[] } => {
    const errors: string[] = [];
    
    // Check players
    if (players.length === 0) {
      errors.push('❌ No players loaded. Please upload a Players CSV.');
    } else {
      const playersWithoutNames = players.filter(p => !p.name || p.name.trim() === '');
      if (playersWithoutNames.length > 0) {
        errors.push(`⚠️ ${playersWithoutNames.length} player(s) missing names`);
      }
    }
    
    // Check teams
    if (teams.length === 0) {
      errors.push('❌ No teams loaded. Please upload a Teams CSV.');
    } else if (teams.length < 2) {
      errors.push('⚠️ Only 1 team loaded. Auctions typically need at least 2 teams.');
    } else {
      const teamsWithoutNames = teams.filter(t => !t.name || t.name.trim() === '');
      if (teamsWithoutNames.length > 0) {
        errors.push(`⚠️ ${teamsWithoutNames.length} team(s) missing names`);
      }
      
      // Check for unbalanced budgets
      const balances = teams.map(t => t.balance);
      const uniqueBalances = [...new Set(balances)];
      if (uniqueBalances.length > 1) {
        const balanceStr = uniqueBalances.map(b => b >= 1000 ? `${(b / 1000).toFixed(2)} Cr` : `${(b / 10).toFixed(1)} L`).join(', ');
        errors.push(`⚠️ Teams have different budgets: ${balanceStr}. This may create unfair advantage.`);
      }
      
      // Check if total team budget is reasonable for number of players
      const totalBudget = teams.reduce((sum, t) => sum + t.balance, 0);
      const avgPlayerPrice = totalBudget / players.length;
      if (avgPlayerPrice < 100) { // Less than 10L per player (100 units)
        const totalBudgetDisplay = totalBudget >= 1000 ? `${(totalBudget / 1000).toFixed(2)} Cr` : `${(totalBudget / 10).toFixed(1)} L`;
        const avgDisplay = avgPlayerPrice >= 1000 ? `${(avgPlayerPrice / 1000).toFixed(2)} Cr` : `${(avgPlayerPrice / 10).toFixed(1)} L`;
        errors.push(`⚠️ Total budget (${totalBudgetDisplay}) seems low for ${players.length} players. Average ~${avgDisplay} per player.`);
      }
    }
    
    // Check for duplicate player IDs or names
    const playerIds = players.map(p => p.id).filter(id => id && id.trim() !== '');
    const duplicateIds = playerIds.filter((id, idx) => playerIds.indexOf(id) !== idx);
    if (duplicateIds.length > 0) {
      errors.push(`⚠️ Duplicate player IDs found: ${[...new Set(duplicateIds)].join(', ')}`);
    }
    
    const playerNames = players.map(p => p.name.trim().toLowerCase());
    const duplicateNames = playerNames.filter((name, idx) => playerNames.indexOf(name) !== idx);
    if (duplicateNames.length > 0) {
      errors.push(`⚠️ Duplicate player names found: ${[...new Set(duplicateNames)].join(', ')}`);
    }
    
    // Check for photos
    const playersWithPhotos = players.filter(p => p.photo && p.photo.length > 0);
    if (playersWithPhotos.length === 0) {
      errors.push(`ℹ️ No player photos uploaded. Photos enhance the auction experience.`);
    } else if (playersWithPhotos.length < players.length) {
      errors.push(`ℹ️ Only ${playersWithPhotos.length} of ${players.length} players have photos.`);
    }
    
    return { valid: errors.filter(e => e.startsWith('❌')).length === 0, errors };
  };

  // On mount, restore from localStorage if available

  React.useEffect(() => {
    try {
      const saved = localStorage.getItem('auctionSetup');
      if (saved) {
        // ...existing code...
      }
    } catch (err) {
      // ignore malformed or absent stored state
      void err;
    }
  }, []);





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
    <div className="auction-setup" style={{padding: 32, maxWidth: 900, margin: '0 auto'}}>
      <h1>Auction Setup</h1>

      {/* Progress indicator */}
      {uploadProgress.type && (
        <div style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'rgba(0, 0, 0, 0.9)',
          color: '#fff',
          padding: '2rem 3rem',
          borderRadius: '1rem',
          zIndex: 10000,
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
          minWidth: '300px',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1rem' }}>
            {uploadProgress.type === 'player' ? '📊 Loading Players...' : 
             uploadProgress.type === 'team' ? '🏆 Loading Teams...' : 
             '📋 Loading Resume...'}
          </div>
          <div style={{ fontSize: '1.2rem', marginBottom: '1rem' }}>
            {uploadProgress.total > 0 ? `${uploadProgress.current} / ${uploadProgress.total} rows` : 'Processing...'}
          </div>
          <div style={{ width: '100%', height: '8px', background: '#333', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{
              width: uploadProgress.total > 0 ? `${(uploadProgress.current / uploadProgress.total) * 100}%` : '0%',
              height: '100%',
              background: 'linear-gradient(90deg, #1976d2, #42a5f5)',
              transition: 'width 0.2s ease'
            }} />
          </div>
        </div>
      )}
      
      <label>Tournament Type:</label>
      <select value={tournament} onChange={e => setTournament(e.target.value)}>
        {TOURNAMENT_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
        <option value="custom">Custom...</option>
      </select>
      {tournament === 'custom' && (
        <input placeholder="Enter custom type" value={customType} onChange={e => setCustomType(e.target.value)} />
      )}
      <div style={{marginTop: 16, display: 'flex', alignItems: 'center', gap: 8}}>
        <label>Upload Players CSV:</label>
        <input
          type="file"
          accept=".csv"
          ref={playerCSVRef}
          onChange={e => handleCSV(e, setPlayers, 'player')}
        />
        <button
          type="button"
          onClick={randomizePlayers}
          disabled={!players.length}
          style={{ fontSize: 13, padding: '2px 10px', marginLeft: 4, borderRadius: 4, border: '1px solid #1976d2', background: '#e3e9f6', color: '#1976d2', cursor: players.length ? 'pointer' : 'not-allowed' }}
          title="Randomize Blue/Red Players"
        >
          Randomize
        </button>
      </div>
      <div>
        <label>Upload Player Photos:</label>
        <input type="file" accept="image/*" multiple ref={playerImgRef} onChange={handlePlayerImages} />
        <div style={{fontSize: '0.85rem', color: '#666', marginTop: 4}}>Photo files should be named with player ID (e.g., 1.jpg, 2.png, 101.jpg)</div>
        
        {/* Photo preview grid */}
        {players.length > 0 && (
          <div style={{marginTop: 12, padding: '12px', background: '#f9f9f9', borderRadius: '8px', border: '1px solid #e0e0e0'}}>
            <div style={{fontSize: '0.9rem', fontWeight: 600, marginBottom: 8, color: '#333'}}>
              📸 Photo Coverage: {players.filter(p => p.photo).length} / {players.length} players
            </div>
            <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: '8px', maxHeight: '200px', overflowY: 'auto'}}>
              {players.map((p, idx) => (
                <div key={idx} style={{
                  position: 'relative',
                  width: '80px',
                  height: '80px',
                  border: p.photo ? '2px solid #4caf50' : '2px dashed #ccc',
                  borderRadius: '6px',
                  overflow: 'hidden',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: p.photo ? '#fff' : '#f5f5f5'
                }}>
                  {p.photo ? (
                    <img src={p.photo} alt={p.name} style={{width: '100%', height: '100%', objectFit: 'cover'}} />
                  ) : (
                    <span style={{fontSize: '0.7rem', color: '#999', textAlign: 'center', padding: '2px'}}>No photo</span>
                  )}
                  <div style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    background: 'rgba(0,0,0,0.7)',
                    color: '#fff',
                    fontSize: '0.65rem',
                    padding: '2px 4px',
                    textAlign: 'center',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}>
                    {p.name}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <div>
        <label>Upload Teams CSV:</label>
        <input
          type="file"
          accept=".csv"
          ref={teamCSVRef}
          onChange={e => handleCSV(e, setTeams, 'team')}
        />
        <div style={{fontSize: '0.85rem', color: '#666', marginTop: 4}}>CSV should include team name (balance column will be ignored)</div>
      </div>
      
      {/* Team Balance Customization */}
      {teams.length > 0 && (
        <div style={{marginTop: 16, padding: '12px', background: '#f5f5f5', borderRadius: '8px', border: '1px solid #ddd'}}>
          <div style={{display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap'}}>
            <label style={{fontWeight: 600}}>Team Balances (Units):</label>
            <div style={{display: 'flex', alignItems: 'center', gap: 8}}>
              <span style={{fontSize: '0.85rem', color: '#666'}}>Default:</span>
              <input
                type="number"
                value={10000}
                disabled
                style={{
                  padding: '0.5em 8px',
                  fontSize: '0.9rem',
                  width: '100px',
                  background: '#e8f5e9',
                  borderRadius: '4px',
                  border: '1px solid #4caf50'
                }}
              />
              <span style={{fontSize: '0.85rem', color: '#666'}}>= ₹10 Cr</span>
            </div>
            <button
              type="button"
              onClick={() => {
                const updatedTeams = teams.map(t => ({...t, balance: 10000}));
                setTeams(updatedTeams);
              }}
              style={{
                fontSize: '0.85rem',
                padding: '6px 12px',
                background: '#1976d2',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 600,
                marginLeft: 'auto'
              }}
            >
              Reset All to Default
            </button>
          </div>
          <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px'}}>
            {teams.map((team, idx) => (
              <div key={idx} style={{
                padding: '12px',
                background: '#fff',
                border: '1px solid #ddd',
                borderRadius: '6px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
              }}>
                <div style={{fontWeight: 600, color: '#333', fontSize: '0.95rem'}}>
                  {team.logo && <img src={team.logo} alt={team.name} style={{width: 30, height: 30, borderRadius: 4, marginBottom: 4}} />}
                  {team.name}
                </div>
                <div style={{display: 'flex', alignItems: 'center', gap: 8}}>
                  <input
                    type="number"
                    value={team.balance}
                    onChange={(e) => {
                      const newBalance = Number(e.target.value) || 10000;
                      const updatedTeams = [...teams];
                      updatedTeams[idx] = {...team, balance: newBalance};
                      setTeams(updatedTeams);
                    }}
                    min="0"
                    step="100"
                    style={{
                      flex: 1,
                      padding: '0.5em 8px',
                      fontSize: '0.9rem',
                      borderRadius: '4px',
                      border: '1px solid #bbb'
                    }}
                  />
                  <span style={{fontSize: '0.8rem', color: '#666', minWidth: '60px'}}>
                    = ₹{team.balance >= 1000 ? `${(team.balance / 1000).toFixed(2)} Cr` : `${(team.balance / 10).toFixed(1)} L`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <div>
        <label>Upload Team Logos:</label>
        <input type="file" accept="image/*" multiple ref={teamLogoRef} onChange={handleTeamLogos} />
        <div style={{fontSize: '0.85rem', color: '#666', marginTop: 4}}>Logo files should be named with team name (e.g., TeamA.jpg, eagles.png)</div>
        
        <div style={{marginTop: 16, display: 'flex', gap: '2rem', flexWrap: 'wrap'}}>
          <div>
            <label>Minimum Players Per Team:</label>
            <input
              type="number"
              value={minPlayersPerTeam}
              onChange={e => setMinPlayersPerTeam(Number(e.target.value) || 1)}
              min="1"
              style={{marginLeft: 8, padding: '0.5em', fontSize: '1rem', width: '80px'}}
            />
            <div style={{fontSize: '0.85rem', color: '#666', marginTop: 4}}>Teams must acquire at least this many players</div>
          </div>
          <div>
            <label>Maximum Players Per Team:</label>
            <input
              type="number"
              value={maxPlayersPerTeam}
              onChange={e => setMaxPlayersPerTeam(Math.max(minPlayersPerTeam, Number(e.target.value) || minPlayersPerTeam))}
              min={minPlayersPerTeam}
              style={{marginLeft: 8, padding: '0.5em', fontSize: '1rem', width: '80px'}}
            />
            <div style={{fontSize: '0.85rem', color: '#666', marginTop: 4}}>Teams cannot acquire more than this many players</div>
          </div>
        </div>
        
        <div style={{marginTop: 16}}>
          <label>Blue Player Cap (% of Purse):</label>
          <input
            type="number"
            value={blueCapPercent}
            onChange={e => setBlueCapPercent(Math.min(100, Math.max(0, Number(e.target.value) || 65)))}
            min="0"
            max="100"
            style={{marginLeft: 8, padding: '0.5em', fontSize: '1rem', width: '80px'}}
          />
          <span style={{marginLeft: 4}}>%</span>
          <div style={{fontSize: '0.85rem', color: '#666', marginTop: 4}}>Maximum % of team purse that can be spent on Blue category players. Set to 100% to disable this cap.</div>
        </div>
        
        {/* Team logo preview */}
        {teams.length > 0 && (
          <div style={{marginTop: 12, padding: '12px', background: '#f9f9f9', borderRadius: '8px', border: '1px solid #e0e0e0'}}>
            <div style={{fontSize: '0.9rem', fontWeight: 600, marginBottom: 8, color: '#333'}}>
              🏆 Logo Coverage: {teams.filter(t => t.logo).length} / {teams.length} teams
            </div>
            <div style={{display: 'flex', flexWrap: 'wrap', gap: '12px'}}>
              {teams.map((t, idx) => (
                <div key={idx} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 12px',
                  background: '#fff',
                  border: t.logo ? '2px solid #4caf50' : '2px dashed #ccc',
                  borderRadius: '6px',
                  minWidth: '150px'
                }}>
                  <div style={{
                    width: '40px',
                    height: '40px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    overflow: 'hidden',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: t.logo ? '#fff' : '#f5f5f5',
                    flexShrink: 0
                  }}>
                    {t.logo ? (
                      <img src={t.logo} alt={t.name} style={{width: '100%', height: '100%', objectFit: 'contain'}} />
                    ) : (
                      <span style={{fontSize: '0.6rem', color: '#999'}}>No logo</span>
                    )}
                  </div>
                  <div style={{fontSize: '0.85rem', fontWeight: 600, color: '#333'}}>{t.name}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <div>
        <label>Upload Previous Bid Log (optional):</label>
        <input type="file" accept=".csv" ref={bidCSVRef} onChange={handleResumeCSV} />
        {resumeData && (
          <div style={{fontSize: '0.85rem', color: '#388e3c', marginTop: 4}}>
            ✓ Resume loaded: Round {resumeData.round}, {resumeData.log.length} entries, {resumeData.sequence.length} players in sequence
          </div>
        )}
      </div>
      <div style={{marginTop: 16, padding: '1rem', background: '#f0f7ff', border: '1px solid #2196f3', borderRadius: '0.5rem'}}>
        <label style={{fontWeight: 600, display: 'block', marginBottom: '0.5rem', color: '#1565c0'}}>📂 Load Previous Auction Setup:</label>
        <input 
          type="file" 
          accept=".json" 
          ref={setupFileRef} 
          onChange={handleLoadSetup}
          style={{cursor: 'pointer'}}
        />
        <div style={{fontSize: '0.85rem', color: '#666', marginTop: '0.5rem'}}>
          Load a previously saved auction setup file (.json). This will restore all teams, players, photos, settings, and auction state.
        </div>
      </div>
      <div style={{marginTop: 24, display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
        <button
          onClick={() => {
            // Validate setup first
            const validation = validateSetup();
            
            if (!validation.valid) {
              const criticalErrors = validation.errors.filter(e => e.startsWith('❌'));
              alert(`Cannot start auction. Please fix these issues:\n\n${criticalErrors.join('\n')}`);
              setValidationErrors(validation.errors);
              return;
            }
            
            // Show warnings if any
            const warnings = validation.errors.filter(e => e.startsWith('⚠️') || e.startsWith('ℹ️'));
            if (warnings.length > 0) {
              const proceed = confirm(
                `Setup validation warnings:\n\n${warnings.join('\n')}\n\nDo you want to proceed anyway?`
              );
              if (!proceed) {
                setValidationErrors(validation.errors);
                return;
              }
            }
            
            console.log('Starting auction with players:', players);
            console.log('Players with photos:', players.filter(p => p.photo).length, 'out of', players.length);
            
            // Auto-randomize: blue players first, then red, then others
            const blue = players.filter(p => (p.category || '').toLowerCase() === 'blue');
            const red = players.filter(p => (p.category || '').toLowerCase() === 'red');
            const other = players.filter(p => (p.category || '').toLowerCase() !== 'blue' && (p.category || '').toLowerCase() !== 'red');
            const orderedPlayers = [...shuffle(blue), ...shuffle(red), ...shuffle(other)];
            
            console.log(`Auto-randomized: ${blue.length} blue players first, then ${red.length} red players, then ${other.length} others`);
            
            if (resumeData) {
              console.log('Resume data loaded:', resumeData);
            }
            
            const auctionId = generateAuctionId();
            console.log('Starting auction with ID:', auctionId);
            setAuctionIdInUrl(auctionId);
            
            // Save player photos to IndexedDB (survives page refresh and works across devices on same browser)
            // This allows Firebase sync to work without sending 49MB of photos
            savePhotosToIndexedDB(auctionId, players).catch(err => {
              console.warn('⚠️ Failed to save photos to IndexedDB:', err);
            });
            
            // Save auction setup to file before starting
            const snapshot = createAuctionSetupSnapshot(
              auctionId,
              customType || tournament,
              teams,
              players,
              {
                bluePlayerCap: blueCapPercent,
                puddingPercentage: 0,
                minPlayersPerTeam,
                maxPlayersPerTeam
              },
              {
                soldPlayers: [],
                unsoldPlayers: [],
                teamBalances: Object.fromEntries(teams.map(t => [t.name, t.balance])),
                capLimitsUsed: Object.fromEntries(teams.map(t => [t.name, 0])),
                capLimitsRemaining: Object.fromEntries(teams.map(t => [t.name, t.balance])),
                auctionLog: [],
                round: 0,
                auctionComplete: false
              }
            );
            saveAuctionSetupToFile(snapshot, resumeData ? true : false);
            
            onSetup({
              tournament: customType || tournament,
              players: resumeData ? players : orderedPlayers, // Use original order if resuming, otherwise use auto-randomized
              teams,
              bidLog,
              playerImages,
              teamLogos,
              defaultBalance: 10000, // Keep passing default for AuctionScreen compatibility
              resumeData,
              auctionId,
              minPlayersPerTeam,
              maxPlayersPerTeam,
              blueCapPercent,
            });
          }}
          disabled={!players.length || !teams.length}
          style={{
            fontSize: '2rem',
            padding: '1.2em 3em',
            background: (!players.length || !teams.length) ? '#ccc' : '#1976d2',
            color: '#fff',
            border: 'none',
            borderRadius: '0.7em',
            fontWeight: 700,
            boxShadow: '0 2px 12px #0002',
            cursor: (!players.length || !teams.length) ? 'not-allowed' : 'pointer',
            marginBottom: 32,
            marginTop: 8,
            letterSpacing: '0.08em',
            transition: 'background 0.2s',
          }}
        >
          Start Auction
        </button>
        {validationErrors.length > 0 && (
          <div style={{
            marginTop: 16,
            padding: '1rem',
            background: '#fff3cd',
            border: '1px solid #ffc107',
            borderRadius: '0.5rem',
            maxWidth: '600px',
            width: '100%'
          }}>
            <div style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: '0.5rem', color: '#856404' }}>⚠️ Validation Issues:</div>
            <ul style={{ margin: 0, paddingLeft: '1.5rem', color: '#856404' }}>
              {validationErrors.map((error, idx) => (
                <li key={idx} style={{ marginBottom: '0.25rem' }}>{error}</li>
              ))}
            </ul>
          </div>
        )}
        
        {/* Quick status summary */}
        <div style={{
          marginTop: 16,
          padding: '0.75rem',
          background: '#e3f2fd',
          border: '1px solid #2196f3',
          borderRadius: '0.5rem',
          maxWidth: '600px',
          width: '100%',
          fontSize: '0.9rem'
        }}>
          <div style={{ fontWeight: 700, marginBottom: '0.5rem', color: '#1565c0' }}>📊 Setup Status:</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', color: '#1976d2' }}>
            <div>✓ Players: <strong>{players.length}</strong></div>
            <div>✓ Teams: <strong>{teams.length}</strong></div>
            <div>📸 Photos: <strong>{players.filter(p => p.photo).length}/{players.length}</strong></div>
            <div>🏆 Logos: <strong>{teams.filter(t => t.logo).length}/{teams.length}</strong></div>
          </div>
        </div>
      </div>
      {/* Collapsible and maximizable Preview section */}
      <div style={{marginTop: 24, position: 'relative'}}>
        <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
          <h3 style={{margin: 0}}>Preview</h3>
          <div>
            <button onClick={() => setPreviewCollapsed(c => !c)} style={{marginRight: 8, fontSize: 18}}>
              {previewCollapsed ? '▼ Expand' : '▲ Collapse'}
            </button>
            <button onClick={() => setPreviewMaximized(true)} style={{fontSize: 18}}>
              ⬜ Maximize
            </button>
          </div>
        </div>
        {!previewCollapsed && (
          <div>
            <div>Players: {players.length}</div>
            <div style={{overflowX:'auto',maxWidth:'100%',maxHeight:'500px',overflowY:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse',marginBottom:12,fontSize:'0.9em'}}>
                <colgroup>
                  <col style={{width:'60px'}} />
                  <col style={{width:'50px'}} />
                  <col style={{width:'120px'}} />
                  <col style={{width:'45px'}} />
                  <col style={{width:'70px'}} />
                  <col style={{minWidth:'180px'}} />
                  <col style={{width:'100px'}} />
                  <col style={{width:'70px'}} />
                  <col style={{width:'100px'}} />
                  <col style={{width:'80px'}} />
                </colgroup>
                <thead>
                  <tr style={{background:'#e3e9f6'}}>
                    <th style={{padding:'4px 6px',border:'1px solid #bbb',fontSize:'0.85em',color:'#333',fontWeight:700}}>Photo</th>
                    <th style={{padding:'4px 6px',border:'1px solid #bbb',fontSize:'0.85em',color:'#333',fontWeight:700}}>ID</th>
                    <th style={{padding:'4px 6px',border:'1px solid #bbb',fontSize:'0.85em',color:'#333',fontWeight:700}}>Name</th>
                    <th style={{padding:'4px 6px',border:'1px solid #bbb',fontSize:'0.85em',color:'#333',fontWeight:700}}>Age</th>
                    <th style={{padding:'4px 6px',border:'1px solid #bbb',fontSize:'0.85em',color:'#333',fontWeight:700}}>Flat</th>
                    <th style={{padding:'4px 6px',border:'1px solid #bbb',fontSize:'0.85em',color:'#333',fontWeight:700}}>Description</th>
                    <th style={{padding:'4px 6px',border:'1px solid #bbb',fontSize:'0.85em',color:'#333',fontWeight:700}}>Specialization</th>
                    <th style={{padding:'4px 6px',border:'1px solid #bbb',fontSize:'0.85em',color:'#333',fontWeight:700}}>Blue/Red</th>
                    <th style={{padding:'4px 6px',border:'1px solid #bbb',fontSize:'0.85em',color:'#333',fontWeight:700}}>Availability</th>
                    <th style={{padding:'4px 6px',border:'1px solid #bbb',fontSize:'0.85em',color:'#333',fontWeight:700}}>Role</th>
                  </tr>
                </thead>
                <tbody>
                  {players.map((p, i) => (
                    <tr key={i}>
                      <td style={{padding:'4px',border:'1px solid #ccc',textAlign:'center'}}>
                        {p.photo ? (
                          <img src={p.photo} alt={p.name} style={{width:40,height:40,objectFit:'cover',borderRadius:4}} />
                        ) : '-'}
                      </td>
                      <td style={{padding:'4px 6px',border:'1px solid #ccc',fontSize:'0.85em',color:'#333'}}>{p.id || '-'}</td>
                      <td style={{padding:'4px 6px',border:'1px solid #ccc',fontSize:'0.85em',color:'#333',fontWeight:600}}>{p.name || '-'}</td>
                      <td style={{padding:'4px 6px',border:'1px solid #ccc',textAlign:'center',fontSize:'0.85em',color:'#333'}}>{p.age || '-'}</td>
                      <td style={{padding:'4px 6px',border:'1px solid #ccc',fontSize:'0.85em',color:'#333'}}>{p.flat || '-'}</td>
                      <td style={{padding:'4px 6px',border:'1px solid #ccc',fontSize:'0.85em',color:'#333'}}>{p.description || '-'}</td>
                      <td style={{padding:'4px 6px',border:'1px solid #ccc',fontSize:'0.85em',color:'#333'}}>{p.specialization || '-'}</td>
                      <td style={{padding:'4px 6px',border:'1px solid #ccc',textAlign:'center',fontSize:'0.85em',color:'#333'}}>{p.category || '-'}</td>
                      <td style={{padding:'4px 6px',border:'1px solid #ccc',fontSize:'0.85em',color:'#333'}}>{p.availability || '-'}</td>
                      <td style={{padding:'4px 6px',border:'1px solid #ccc',fontSize:'0.85em',color:'#333'}}>{p.role || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div>Teams: {teams.length}</div>
            <ul style={{color:'#388e3c',margin:'4px 0 12px 0'}}>
              {teams.map((t, i) => <li key={i}>{t.name || JSON.stringify(t)}</li>)}
            </ul>
            <div>Bid Log: {bidLog.length}</div>
          </div>
        )}
        {previewMaximized && (
          <div style={{position:'fixed',top:0,left:0,width:'100vw',height:'100vh',background:'#fff',zIndex:1000,overflow:'auto',padding:40}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
              <h2>Preview (Maximized)</h2>
              <button onClick={() => setPreviewMaximized(false)} style={{fontSize:22,padding:'0.3em 1em'}}>✕ Close</button>
            </div>
            <div>Players: {players.length}</div>
            <ul style={{color:'#1976d2',margin:'4px 0 12px 0',fontSize:'1.3em'}}>
              {players.map((p, i) => <li key={i}>{p.name || JSON.stringify(p)}</li>)}
            </ul>
            <div>Teams: {teams.length}</div>
            <ul style={{color:'#388e3c',margin:'4px 0 12px 0',fontSize:'1.3em'}}>
              {teams.map((t, i) => <li key={i}>{t.name || JSON.stringify(t)}</li>)}
            </ul>
            <div>Bid Log: {bidLog.length}</div>
          </div>
        )}
      </div>
    </div>
  </>
  );
}

