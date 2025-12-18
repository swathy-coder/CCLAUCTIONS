/**
 * Auction setup file I/O logic
 * Handles saving complete auction state to JSON files and loading them back
 */

export interface AuctionSetupSnapshot {
  // Metadata
  auctionId: string;
  auctionName: string;
  timestamp: string;
  version: string;

  // Setup Config
  settings: {
    bluePlayerCap: number;
    puddingPercentage: number;
    specialRulesId?: string;
    minPlayersPerTeam: number;
    maxPlayersPerTeam: number;
  };

  // All players (separate from teams)
  players: Array<{
    id: string;
    name: string;
    photo: string; // base64 JPEG 80%
    age?: number;
    flat?: string;
    description?: string;
    specialization?: string;
    category?: string;
    availability?: string;
    role?: string;
    owner?: string;
  }>;

  // Teams & Rosters (with compressed photos as base64)
  teams: Array<{
    id: string;
    name: string;
    logo: string; // base64 JPEG 80%
    color: string;
    budget: number;
    players: Array<{
      id: string;
      name: string;
      photo: string; // base64 JPEG 80%
      basePrice: number;
      isBluePrinting: boolean;
      age?: number;
      flat?: string;
      description?: string;
      specialization?: string;
      category?: string;
      availability?: string;
      role?: string;
      owner?: string;
    }>;
  }>;

  // Current State During/After Auction
  auctionState: {
    soldPlayers: Array<{
      playerId: string;
      teamId: string;
      playerName: string;
      soldPrice: number;
      soldTo: string;
      timestamp: string;
    }>;
    unsoldPlayers: string[];
    currentPlayer?: {
      playerId: string;
      teamId: string;
    };
    teamBalances: Record<string, number>;
    capLimitsUsed: Record<string, number>;
    capLimitsRemaining: Record<string, number>;
    auctionLog: Array<{
      action: string;
      player?: string;
      details?: string;
      timestamp: string;
    }>;
    round: number;
    auctionComplete: boolean;
  };

  // Edit history
  editHistory: Array<{
    field: string;
    oldValue: unknown;
    newValue: unknown;
    timestamp: string;
  }>;
}

/**
 * Save auction setup to a downloadable JSON file
 * @param setupData - Auction setup snapshot to save
 * @param isEdited - Whether this is an edited version of a loaded setup
 */
export function saveAuctionSetupToFile(
  setupData: AuctionSetupSnapshot,
  isEdited: boolean = false
): void {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const editedSuffix = isEdited ? '_EDITED' : '';
  const filename = `auction_setup_${setupData.auctionId}_${editedSuffix}_${timestamp}.json`;

  const dataStr = JSON.stringify(setupData, null, 2);
  const dataBlob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(dataBlob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  console.log(`💾 Auction setup saved: ${filename}`);
}

/**
 * Load auction setup from a JSON file
 * @param file - File to load
 * @returns Promise resolving to parsed AuctionSetupSnapshot
 */
export async function loadAuctionSetupFromFile(
  file: File
): Promise<AuctionSetupSnapshot> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const data = JSON.parse(content) as AuctionSetupSnapshot;
        console.log('📂 Auction setup loaded:', data.auctionName);
        resolve(data);
      } catch (error) {
        reject(
          new Error(
            `Failed to parse auction setup file: ${error instanceof Error ? error.message : 'Unknown error'}`
          )
        );
      }
    };

    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };

    reader.readAsText(file);
  });
}

/**
 * Create a snapshot of current auction setup
 * Call this before starting auction to capture full state
 */
export function createAuctionSetupSnapshot(
  auctionId: string,
  auctionName: string,
  teams: Array<{ name: string; balance: number; logo?: string; color?: string }>,
  players: Array<{ 
    id: string; 
    name: string; 
    photo: string;
    age?: number;
    flat?: string;
    description?: string;
    specialization?: string;
    category?: string;
    availability?: string;
    role?: string;
    owner?: string;
  }>,
  settings: { 
    bluePlayerCap?: number; 
    puddingPercentage?: number;
    minPlayersPerTeam?: number;
    maxPlayersPerTeam?: number;
  },
  auctionState?: {
    soldPlayers?: Array<{ playerId: string; teamId: string; playerName: string; soldPrice: number; soldTo: string; timestamp: string }>;
    unsoldPlayers?: string[];
    currentPlayer?: { playerId: string; teamId: string };
    teamBalances?: Record<string, number>;
    capLimitsUsed?: Record<string, number>;
    capLimitsRemaining?: Record<string, number>;
    auctionLog?: Array<{ action: string; player?: string; details?: string; timestamp: string }>;
    round?: number;
    auctionComplete?: boolean;
  }
): AuctionSetupSnapshot {
  return {
    auctionId,
    auctionName,
    timestamp: new Date().toISOString(),
    version: '1.0',
    settings: {
      bluePlayerCap: settings.bluePlayerCap || 0,
      puddingPercentage: settings.puddingPercentage || 0,
      minPlayersPerTeam: settings.minPlayersPerTeam || 6,
      maxPlayersPerTeam: settings.maxPlayersPerTeam || 12,
    },
    // Store all players once at top level
    players: players.map(p => ({
      id: p.id,
      name: p.name,
      photo: p.photo,
      age: p.age,
      flat: p.flat,
      description: p.description,
      specialization: p.specialization,
      category: p.category,
      availability: p.availability,
      role: p.role,
      owner: p.owner,
    })),
    // Teams with empty player arrays (players stored separately)
    teams: teams.map((team) => ({
      id: team.name,
      name: team.name,
      logo: team.logo || '', // Already compressed when saved
      color: team.color || '#999',
      budget: team.balance,
      players: [], // Players are stored separately, not per team
    })),
    auctionState: {
      soldPlayers: auctionState?.soldPlayers || [],
      unsoldPlayers: auctionState?.unsoldPlayers || [],
      currentPlayer: auctionState?.currentPlayer,
      teamBalances: auctionState?.teamBalances || {},
      capLimitsUsed: auctionState?.capLimitsUsed || {},
      capLimitsRemaining: auctionState?.capLimitsRemaining || {},
      auctionLog: auctionState?.auctionLog || [],
      round: auctionState?.round || 0,
      auctionComplete: auctionState?.auctionComplete || false,
    },
    editHistory: [],
  };
}

/**
 * Add edit history entry to snapshot
 */
export function addEditHistory(
  snapshot: AuctionSetupSnapshot,
  field: string,
  oldValue: unknown,
  newValue: unknown
): void {
  snapshot.editHistory.push({
    field,
    oldValue,
    newValue,
    timestamp: new Date().toISOString(),
  });
}
