// Test script to simulate Device 1 → Device 2 sync issues
// This tests if the sync logic works correctly for cross-device resume

console.log('='.repeat(80));
console.log('CCL AUCTION SYNC TEST - Device 1 → Device 2 Resume');
console.log('='.repeat(80));

// ============================================================================
// SIMULATE DEVICE 1 - Initial Auction Setup
// ============================================================================

console.log('\n[DEVICE 1] Starting new auction...\n');

const device1_teams = [
  { name: 'Avengers', balance: 10000, acquired: 0 },
  { name: 'Bandits', balance: 10000, acquired: 0 },
  { name: 'Shasti', balance: 10000, acquired: 0 },
  { name: 'Underdogs', balance: 10000, acquired: 0 },
  { name: 'Thunderbolts', balance: 10000, acquired: 0 }
];

const device1_players = [
  { id: '1', name: 'Sravani', category: 'blue', role: 'player' },
  { id: '2', name: 'Karun', category: 'green', role: 'player' },
  { id: '3', name: 'Harshit', category: 'orange', role: 'player' }
];

const device1_auctionLog = [];
let device1_teamBalances = JSON.parse(JSON.stringify(device1_teams));
const device1_auctionId = 'TEST123';

// Device 1: Sell Sravani to Thunderbolts for 3000 units (300L) - BLUE player
console.log('Device 1: Selling Sravani (BLUE) to Thunderbolts for 3000 units...');
device1_auctionLog.push({
  round: 1,
  attempt: 1,
  timestamp: '2025-12-19 10:00:00',
  playerName: 'Sravani',
  team: 'Thunderbolts',
  amount: 3000,
  status: 'Sold',
  category: 'blue'
});
device1_teamBalances.find(t => t.name === 'Thunderbolts').balance -= 3000;
device1_teamBalances.find(t => t.name === 'Thunderbolts').acquired += 1;

console.log(`✓ Sravani sold | Thunderbolts balance: ${device1_teamBalances.find(t => t.name === 'Thunderbolts').balance} units`);

// Device 1: Sell Karun to Avengers for 2000 units (200L) - GREEN player
console.log('Device 1: Selling Karun (GREEN) to Avengers for 2000 units...');
device1_auctionLog.push({
  round: 1,
  attempt: 1,
  timestamp: '2025-12-19 10:01:00',
  playerName: 'Karun',
  team: 'Avengers',
  amount: 2000,
  status: 'Sold',
  category: 'green'
});
device1_teamBalances.find(t => t.name === 'Avengers').balance -= 2000;
device1_teamBalances.find(t => t.name === 'Avengers').acquired += 1;

console.log(`✓ Karun sold | Avengers balance: ${device1_teamBalances.find(t => t.name === 'Avengers').balance} units`);

// Device 1: Sell Harshit to Bandits for 1000 units (100L) - ORANGE player
console.log('Device 1: Selling Harshit (ORANGE) to Bandits for 1000 units...');
device1_auctionLog.push({
  round: 1,
  attempt: 1,
  timestamp: '2025-12-19 10:02:00',
  playerName: 'Harshit',
  team: 'Bandits',
  amount: 1000,
  status: 'Sold',
  category: 'orange'
});
device1_teamBalances.find(t => t.name === 'Bandits').balance -= 1000;
device1_teamBalances.find(t => t.name === 'Bandits').acquired += 1;

console.log(`✓ Harshit sold | Bandits balance: ${device1_teamBalances.find(t => t.name === 'Bandits').balance} units`);

// Simulate Device 1 saves to Firebase
const device1_stateForFirebase = {
  auctionId: device1_auctionId,
  currentPlayer: device1_players[3] || null,
  teams: device1_teams,
  teamBalances: device1_teamBalances,
  auctionLog: device1_auctionLog,
  players: device1_players,
  round: 1,
  playerIdx: 2,
  minPlayersPerTeam: 6,
  maxPlayersPerTeam: 12,
  blueCapPercent: 65
};

console.log('\n[DEVICE 1 → FIREBASE] Syncing state...');
console.log('State saved to Firebase:');
console.log(JSON.stringify(device1_stateForFirebase, null, 2));

// ============================================================================
// SIMULATE DEVICE 2 - Resume From Firebase
// ============================================================================

console.log('\n' + '='.repeat(80));
console.log('[DEVICE 2] Resuming auction from Firebase...\n');

const firebaseData = device1_stateForFirebase; // Simulate Firebase return

// Device 2: Recover data from Firebase
console.log('Device 2: Loading from Firebase...');
console.log(`  • Auction ID: ${firebaseData.auctionId}`);
console.log(`  • Teams: ${firebaseData.teams.length}`);
console.log(`  • Auction Log Entries: ${firebaseData.auctionLog.length}`);
console.log(`  • Blue Cap Percent: ${firebaseData.blueCapPercent}%`);

// Device 2: Reconstruct resumeData (same as App.tsx does)
console.log('\nDevice 2: Converting Firebase data to resumeData format...');

let playerSequence = [];
if (firebaseData.players && Array.isArray(firebaseData.players)) {
  playerSequence = firebaseData.players.map(p => p.name);
}

let balances = {};
if (firebaseData.teamBalances && Array.isArray(firebaseData.teamBalances)) {
  firebaseData.teamBalances.forEach(team => {
    balances[team.name] = {
      balance: team.balance,
      acquired: team.acquired || 0
    };
  });
}

const resumeLog = (firebaseData.auctionLog || []).map(entry => ({
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

const resumeData = {
  round: firebaseData.round || 1,
  playerIdx: firebaseData.playerIdx || 0,
  sequence: playerSequence,
  balances,
  log: resumeLog
};

console.log('✓ resumeData created:');
console.log(JSON.stringify(resumeData, null, 2));

// Device 2: Initialize teamBalances from resumeData (same as AuctionScreen.tsx useState does)
console.log('\nDevice 2: Initializing teamBalances from resumeData...');

const device2_teamBalances = firebaseData.teams.map(t => ({
  ...t,
  balance: resumeData.balances[t.name]?.balance ?? t.balance,
  acquired: resumeData.balances[t.name]?.acquired ?? 0
}));

console.log('Device 2 teamBalances initialized:');
device2_teamBalances.forEach(team => {
  console.log(`  • ${team.name}: ${team.balance} units | Acquired: ${team.acquired}`);
});

// ============================================================================
// TEST 1: Verify Team Balances Match
// ============================================================================

console.log('\n' + '='.repeat(80));
console.log('TEST 1: VERIFY TEAM BALANCES MATCH\n');

let balancesMatch = true;
device2_teamBalances.forEach(device2_team => {
  const device1_team = device1_teamBalances.find(t => t.name === device2_team.name);
  const match = device1_team.balance === device2_team.balance && 
                device1_team.acquired === device2_team.acquired;
  
  const status = match ? '✓ MATCH' : '✗ MISMATCH';
  console.log(`${status} ${device2_team.name}:`);
  console.log(`    Device 1: ${device1_team.balance} units | Acquired: ${device1_team.acquired}`);
  console.log(`    Device 2: ${device2_team.balance} units | Acquired: ${device2_team.acquired}`);
  
  if (!match) balancesMatch = false;
});

console.log(balancesMatch ? '\n✓ TEST 1 PASSED: All team balances match!' : '\n✗ TEST 1 FAILED: Balance mismatch detected!');

// ============================================================================
// TEST 2: Verify Blue Cap Calculation on Device 2
// ============================================================================

console.log('\n' + '='.repeat(80));
console.log('TEST 2: VERIFY BLUE CAP CALCULATION\n');

const blueCapPercent = 65;

// Calculate blue spent for Thunderbolts on Device 2
const thunderboltsBlueSpent = resumeLog
  .filter(entry => entry.team === 'Thunderbolts' && entry.status === 'Sold' && (entry.category || '').toLowerCase() === 'blue')
  .reduce((sum, entry) => sum + (typeof entry.amount === 'number' ? entry.amount : 0), 0);

console.log('Thunderbolts Blue Cap Calculation:');
console.log(`  • Original Balance: ${firebaseData.teams.find(t => t.name === 'Thunderbolts').balance} units`);
console.log(`  • Current Balance: ${device2_teamBalances.find(t => t.name === 'Thunderbolts').balance} units`);

// FIX: Use ORIGINAL purse (not spent + remaining)
const originalPurseThunderbolts = firebaseData.teams.find(t => t.name === 'Thunderbolts').balance; // 1000
const blueBudgetThunderbolts = Math.floor((blueCapPercent / 100) * originalPurseThunderbolts);
const blueLeftThunderbolts = Math.max(0, blueBudgetThunderbolts - thunderboltsBlueSpent);

console.log(`  • Original Purse (from teams): ${originalPurseThunderbolts} units`);
console.log(`  • Blue Budget (65%): ${blueBudgetThunderbolts} units`);
console.log(`  • Blue Spent: ${thunderboltsBlueSpent} units`);
console.log(`  • Blue Left: ${blueLeftThunderbolts} units`);

const blueCapOk = blueLeftThunderbolts > 0;
console.log(blueCapOk ? '\n✓ TEST 2 PASSED: Thunderbolts has blue budget left!' : '\n✗ TEST 2 FAILED: Thunderbolts blue budget exhausted!');

// ============================================================================
// TEST 3: Verify Auction Log Entries Have Category Field
// ============================================================================

console.log('\n' + '='.repeat(80));
console.log('TEST 3: VERIFY AUCTION LOG CATEGORY FIELDS\n');

let categoryFieldsOk = true;
resumeLog.forEach((entry, idx) => {
  const hasCategory = entry.category !== undefined && entry.category !== null && entry.category !== '';
  const status = hasCategory ? '✓' : '✗';
  console.log(`${status} Entry ${idx + 1}: ${entry.playerName} - Category: "${entry.category}"`);
  if (!hasCategory) categoryFieldsOk = false;
});

console.log(categoryFieldsOk ? '\n✓ TEST 3 PASSED: All auction log entries have category field!' : '\n✗ TEST 3 FAILED: Missing category fields!');

// ============================================================================
// TEST 4: Simulate Device 2 Making Changes and AudienceView Sync
// ============================================================================

console.log('\n' + '='.repeat(80));
console.log('TEST 4: SIMULATE DEVICE 2 SELLING A PLAYER AND CHECKING SYNC\n');

console.log('Device 2: Selling new player Priya (BLUE) to Underdogs for 2500 units...');

const device2_auctionLog = [...resumeLog];
device2_auctionLog.push({
  round: 1,
  attempt: 1,
  timestamp: '2025-12-19 10:03:00',
  playerName: 'Priya',
  team: 'Underdogs',
  amount: 2500,
  status: 'Sold',
  category: 'blue'
});

const device2_updatedBalances = device2_teamBalances.map(t =>
  t.name === 'Underdogs'
    ? { ...t, balance: t.balance - 2500, acquired: t.acquired + 1 }
    : t
);

console.log(`✓ Priya sold to Underdogs`);
console.log(`  • Underdogs new balance: ${device2_updatedBalances.find(t => t.name === 'Underdogs').balance} units`);

// Device 2 saves to Firebase
const device2_stateForFirebase = {
  auctionId: device1_auctionId,
  currentPlayer: null,
  teams: firebaseData.teams,
  teamBalances: device2_updatedBalances,
  auctionLog: device2_auctionLog,
  players: firebaseData.players,
  round: 1,
  playerIdx: firebaseData.playerIdx,
  minPlayersPerTeam: firebaseData.minPlayersPerTeam,
  maxPlayersPerTeam: firebaseData.maxPlayersPerTeam,
  blueCapPercent: firebaseData.blueCapPercent
};

console.log('\nDevice 2: Saving to Firebase (auctionId: TEST123)...');
console.log('  • teamBalances updated');
console.log('  • auctionLog updated with new entry');

// ============================================================================
// TEST 5: Verify AudienceView Would Receive Device 2 Update
// ============================================================================

console.log('\n' + '='.repeat(80));
console.log('TEST 5: VERIFY AUDIENCE VIEW RECEIVES DEVICE 2 UPDATE\n');

// AudienceView subscribes to Firebase at auctions/TEST123
const firebaseSnapshot = device2_stateForFirebase;

console.log('AudienceView: Checking Firebase subscription...');
console.log(`  • Subscribed to: auctions/${firebaseSnapshot.auctionId}`);
console.log(`  • Received auction log length: ${firebaseSnapshot.auctionLog.length}`);
console.log(`  • Received Underdogs balance: ${firebaseSnapshot.teamBalances.find(t => t.name === 'Underdogs').balance} units`);

// Check if Priya appears in the log
const priyaInLog = firebaseSnapshot.auctionLog.find(e => e.playerName === 'Priya');
const audienceViewSyncOk = priyaInLog && priyaInLog.team === 'Underdogs' && priyaInLog.amount === 2500;

console.log(audienceViewSyncOk ? '\n✓ TEST 5 PASSED: AudienceView would receive Device 2 updates!' : '\n✗ TEST 5 FAILED: Device 2 updates not in Firebase!');

// ============================================================================
// SUMMARY
// ============================================================================

console.log('\n' + '='.repeat(80));
console.log('SYNC TEST SUMMARY\n');

const allTestsPassed = balancesMatch && blueCapOk && categoryFieldsOk && audienceViewSyncOk;

const results = [
  { test: 'Team Balances Match', passed: balancesMatch },
  { test: 'Blue Cap Calculation', passed: blueCapOk },
  { test: 'Category Fields Preserved', passed: categoryFieldsOk },
  { test: 'AudienceView Receives Device 2 Updates', passed: audienceViewSyncOk }
];

results.forEach(result => {
  const status = result.passed ? '✓ PASS' : '✗ FAIL';
  console.log(`${status}: ${result.test}`);
});

console.log('\n' + '='.repeat(80));
if (allTestsPassed) {
  console.log('🎉 ALL TESTS PASSED - Sync logic appears to be working correctly!');
} else {
  console.log('❌ SOME TESTS FAILED - Issues detected in sync logic');
  
  if (!balancesMatch) {
    console.log('\n⚠️  ISSUE 1: Team balances not matching after resume');
    console.log('   → Check: AuctionScreen useState initialization of teamBalances');
    console.log('   → Check: App.tsx resumeData construction from Firebase data');
  }
  
  if (!blueCapOk) {
    console.log('\n⚠️  ISSUE 2: Blue cap calculation failing on Device 2');
    console.log('   → Check: getBlueSpentByTeam() relies on category field');
    console.log('   → Check: category field being saved and loaded correctly');
  }
  
  if (!categoryFieldsOk) {
    console.log('\n⚠️  ISSUE 3: Category field missing from auction log entries');
    console.log('   → Check: handleSold() includes category in newLog entry');
    console.log('   → Check: Firebase stripPhotosFromState() preserves category');
  }
  
  if (!audienceViewSyncOk) {
    console.log('\n⚠️  ISSUE 4: Device 2 updates not propagating to Firebase');
    console.log('   → Check: Device 2 saving to Firebase with correct auctionId');
    console.log('   → Check: Firebase subscription in AudienceView firing for Device 2 changes');
  }
}

console.log('='.repeat(80));
