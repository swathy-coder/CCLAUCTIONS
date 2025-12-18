# Player Distribution System - Implementation Guide

## Overview
The player distribution system allows auctioneers to assign unsold players to teams after all teams have met their minimum player quota (default: 6 players). This feature is designed to ensure all players are assigned before the auction concludes.

## Key Features

### 1. Distribution Eligibility
- **When Available**: Distribution button appears when:
  - ALL teams have acquired ≥ `minPlayersPerTeam` (default: 6)
  - Unsold players still exist (players not in auctionLog with status 'Sold')

- **Eligible Teams**: Teams that can receive distribution players must:
  - Have acquired ≥ `minPlayersPerTeam` (met minimum quota)
  - Have acquired < `maxPlayersPerTeam` (have roster slots available)

### 2. Distribution UI

#### Distribution Modal
Located in `AuctionScreen.tsx` lines 1612-1690

**States:**
1. **Player Assignment State** - Shows current unsold player
   - Player name and category (Blue/Red)
   - Team selector dropdown (filtered to eligible teams)
   - Amount input field (max is team's remaining balance)
   - "Assign" button to add to pending assignments

2. **Summary State** - Shows pending assignments review
   - Table of all queued assignments
   - Player name, Team, Amount columns
   - Delete button to remove individual assignments
   - "Back" button to continue assigning
   - "Confirm Distribution" button to apply all assignments

#### Distribution Button
Located in `AuctionScreen.tsx` line 1293

```tsx
{allTeamsMetMinimum() && getUnsoldPlayers().length > 0 && (
  <button className="btn-action btn-distribute">
    📦 DISTRIBUTE
  </button>
)}
```

**Styling:**
- Background: Orange (#ff6f00)
- Hover: Dark orange (#e65100) with shadow
- Only appears when distribution is possible
- Full-width action button matching other auction controls

### 3. Helper Functions

#### `getUnsoldPlayers(): Player[]`
Returns all players not yet sold.

```tsx
const getUnsoldPlayers = (): Player[] => {
  const soldNames = new Set(auctionLog.filter(l => l.status === 'Sold').map(l => l.playerName));
  return orderedPlayers.filter(p => !soldNames.has(p.name));
};
```

#### `allTeamsMetMinimum(): boolean`
Checks if all teams have met their minimum player quota.

```tsx
const allTeamsMetMinimum = (): boolean => {
  return teamBalances.every(team => (team.acquired || 0) >= minPlayersPerTeam);
};
```

#### `getEligibleDistributionTeams(): Team[]`
Returns teams that can receive distribution players.

```tsx
const getEligibleDistributionTeams = (): Team[] => {
  return teamBalances.filter(team => {
    const acquired = team.acquired || 0;
    return acquired >= minPlayersPerTeam && acquired < maxPlayersPerTeam;
  });
};
```

#### `handleDistributionAssign(): void`
Adds current player assignment to pending queue and moves to next unsold player.

- Validates team selection
- Creates assignment object: `{playerName, teamName, amount}`
- Adds to `pendingAssignments` state
- Auto-advances to next unsold player or clears if all assigned

#### `handleConfirmDistribution(): void`
Applies all pending assignments to auction log and team balances.

- For each assignment:
  - Creates AuctionLogEntry with proper category
  - Updates team balance (deducts amount)
  - Increments team acquired count
  - Adds to auctionLog

- Clears distribution state
- Marks auction as complete
- Syncs to localStorage

#### `handleUndoDistributionAssignment(idx): void`
Removes individual assignment from pending queue.

### 4. State Management

**Distribution State Variables (lines 197-201):**

```tsx
const [distributionMode, setDistributionMode] = useState(false);
const [pendingAssignments, setPendingAssignments] = useState<Array<{
  playerName: string;
  teamName: string;
  amount: number;
}>>([]);
const [currentDistributionPlayer, setCurrentDistributionPlayer] = useState<Player | null>(null);
const [distributionTeamSelection, setDistributionTeamSelection] = useState('');
const [distributionAmount, setDistributionAmount] = useState(0);
```

### 5. CSS Styling

**Modal Styles (AuctionScreen.css lines 1480-1631):**

- `.modal-overlay`: Fixed overlay with backdrop blur
- `.modal-content`: Centered white card with animation
- `.distribution-form`: Form state layout
- `.distribution-summary`: Review state layout
- `.player-display`: Current player highlight box
- `.player-badge`: Category indicator (blue/red)
- `.form-group`: Form field grouping
- `.team-selector`, `.amount-input`: Input styling
- `.assignments-table`: Pending assignments review table
- `.btn-small.btn-danger`: Delete button for assignments
- `.modal-actions`: Footer button group

**Button Styles (AuctionScreen.css lines 639-648):**

```css
.btn-distribute {
  background: #ff6f00;
  color: white;
  font-weight: 900;
  font-size: 15px;
}

.btn-distribute:hover:not(.disabled) {
  background: #e65100;
  box-shadow: 0 0 20px rgba(255, 111, 0, 0.6);
}
```

## Usage Workflow

### Step 1: Meet Minimum Quota
- Continue auction until all teams have ≥ `minPlayersPerTeam` players

### Step 2: Trigger Distribution
- Click "📦 DISTRIBUTE" button
- First unsold player appears in modal

### Step 3: Assign Players
- Select eligible team from dropdown
- (Optional) Enter custom amount (₹0 default)
- Click "Assign" to queue assignment
- Modal auto-advances to next unsold player

### Step 4: Review Assignments
- After last player assigned, modal shows summary table
- Review all pending assignments
- Click "Back" to make changes or continue assigning

### Step 5: Confirm
- Click "Confirm Distribution" to apply all assignments
- Auction is marked complete
- All team rosters updated
- CSV export includes distribution entries

## Data Structures

### Assignment Object
```tsx
{
  playerName: string;      // Name of unsold player
  teamName: string;        // Target team name
  amount: number;          // Units (0 for ₹0, else deducted from budget)
}
```

### Auction Log Entry (created during confirmation)
```tsx
{
  round: number;
  attempt: number;
  timestamp: string;
  playerName: string;
  team: string;
  amount: number;           // Assignment amount in units
  status: 'Sold';
  category: string;         // Player's category (Blue/Red)
}
```

## Constraints & Validations

1. **Distribution Only When**: All teams ≥ minimum AND unsold players exist
2. **Team Eligibility**: Must have ≥ minimum AND < maximum
3. **Budget Validation**: Team must have sufficient balance for custom amount
4. **Assignment Required**: All unsold players must be assigned before confirmation
5. **Amount Input**: Max limited to team's remaining balance

## Integration with Existing Features

- **Multi-Round**: Distribution can occur in any round
- **Blue Cap**: Distribution respects team balance calculations
- **CSV Export**: Distribution entries appear in auction log export
- **Resume**: Distribution assignments preserved in resume data
- **Audience View**: Roster updates sync via localStorage (200ms polling)

## Error Handling

- Team selector required: Alert "Please select a team"
- No assignments made: Alert "No assignments made" on confirm
- Disabled confirm button: When pendingAssignments.length === 0
- Amount exceeds budget: Browser input max attribute prevents overflow

## Testing Checklist

- [ ] Distribution button appears when all teams meet minimum
- [ ] Unsold players correctly identified (not in auctionLog)
- [ ] Eligible teams filtered (≥ min, < max players)
- [ ] Amount input respects max budget
- [ ] Assignments queue and advance to next player
- [ ] Summary table shows all pending assignments
- [ ] Delete button removes individual assignments
- [ ] Confirm creates proper log entries
- [ ] Team balances updated correctly
- [ ] Team acquired counts incremented
- [ ] Auction marked complete after distribution
- [ ] localStorage syncs to AudienceView
- [ ] CSV export includes distribution entries

## Future Enhancements

1. **Bulk Assignment**: Assign multiple unsold to same team at once
2. **Auto-Distribution**: Automatically distribute at ₹0 when applicable
3. **Distribution Presets**: Save distribution templates
4. **Undo Distribution**: Reverse completed distribution if needed
5. **Fair Distribution**: Algorithm to automatically balance teams

## Troubleshooting

**Distribution button doesn't appear:**
- Check that all teams have ≥ minPlayersPerTeam acquired
- Verify there are unsold players remaining

**Teams not appearing in dropdown:**
- Confirm team has < maxPlayersPerTeam already acquired

**Amount input disabled:**
- Team budget may be insufficient
- Try ₹0 (default) amount instead

**Assignments not applied:**
- Ensure at least one assignment in pending queue
- Confirm "Confirm Distribution" button is not disabled
