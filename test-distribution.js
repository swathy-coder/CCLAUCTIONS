#!/usr/bin/env node

/**
 * Distribution System Unit Tests
 * Run this with: node test-distribution.js
 * 
 * Tests the core logic of the distribution system
 */

// Mock data structures
const mockPlayers = [
  { name: 'Player A', category: 'Blue' },
  { name: 'Player B', category: 'Red' },
  { name: 'Player C', category: 'Blue' },
  { name: 'Player D', category: 'Red' }
];

const mockTeams = [
  { name: 'Team 1', acquired: 6, balance: 500 },
  { name: 'Team 2', acquired: 5, balance: 600 },
  { name: 'Team 3', acquired: 6, balance: 400 }
];

const mockAuctionLog = [
  { playerName: 'Player A', status: 'Sold' },
  { playerName: 'Player C', status: 'Sold' }
];

const minPlayersPerTeam = 6;
const maxPlayersPerTeam = 12;

// Test functions (matching logic from AuctionScreen.tsx)

function getUnsoldPlayers(players, log) {
  const soldNames = new Set(log.filter(l => l.status === 'Sold').map(l => l.playerName));
  return players.filter(p => !soldNames.has(p.name));
}

function allTeamsMetMinimum(teams, min) {
  return teams.every(team => (team.acquired || 0) >= min);
}

function getEligibleDistributionTeams(teams, min, max) {
  return teams.filter(team => {
    const acquired = team.acquired || 0;
    return acquired >= min && acquired < max;
  });
}

// Test runner
function runTests() {
  console.log('🧪 Distribution System Unit Tests\n');

  let passed = 0;
  let failed = 0;

  // Test 1: getUnsoldPlayers
  console.log('Test 1: getUnsoldPlayers()');
  const unsold = getUnsoldPlayers(mockPlayers, mockAuctionLog);
  if (unsold.length === 2 && unsold[0].name === 'Player B' && unsold[1].name === 'Player D') {
    console.log('✅ PASS: Correctly identified 2 unsold players\n');
    passed++;
  } else {
    console.log('❌ FAIL: Expected 2 unsold players (B, D), got:', unsold.map(p => p.name));
    console.log('Result:', unsold);
    console.log();
    failed++;
  }

  // Test 2: allTeamsMetMinimum - true case
  console.log('Test 2: allTeamsMetMinimum() - TRUE case');
  const allMet = allTeamsMetMinimum(mockTeams, minPlayersPerTeam);
  if (allMet === false) {
    console.log('✅ PASS: Correctly identified that NOT all teams met minimum (Team 2 has 5)\n');
    passed++;
  } else {
    console.log('❌ FAIL: Expected false (Team 2 only has 5 players), got:', allMet);
    console.log();
    failed++;
  }

  // Test 3: allTeamsMetMinimum - false case
  console.log('Test 3: allTeamsMetMinimum() - FALSE case');
  const teamsAllMet = [
    { name: 'Team 1', acquired: 6, balance: 500 },
    { name: 'Team 2', acquired: 6, balance: 600 },
    { name: 'Team 3', acquired: 6, balance: 400 }
  ];
  const allMetTrue = allTeamsMetMinimum(teamsAllMet, minPlayersPerTeam);
  if (allMetTrue === true) {
    console.log('✅ PASS: Correctly identified that all teams met minimum\n');
    passed++;
  } else {
    console.log('❌ FAIL: Expected true (all have ≥6 players), got:', allMetTrue);
    console.log();
    failed++;
  }

  // Test 4: getEligibleDistributionTeams
  console.log('Test 4: getEligibleDistributionTeams()');
  const eligible = getEligibleDistributionTeams(mockTeams, minPlayersPerTeam, maxPlayersPerTeam);
  // Teams with (acquired >= 6) AND (acquired < 12)
  // Team 1: 6 >= 6 ✓, 6 < 12 ✓ → ELIGIBLE
  // Team 2: 5 >= 6 ✗ → NOT ELIGIBLE
  // Team 3: 6 >= 6 ✓, 6 < 12 ✓ → ELIGIBLE
  if (eligible.length === 2 && eligible.map(t => t.name).includes('Team 1') && eligible.map(t => t.name).includes('Team 3')) {
    console.log('✅ PASS: Correctly identified 2 eligible teams (1, 3)\n');
    passed++;
  } else {
    console.log('❌ FAIL: Expected 2 eligible teams (1, 3), got:', eligible.map(t => t.name));
    console.log();
    failed++;
  }

  // Test 5: Distribution workflow
  console.log('Test 5: Distribution eligibility check');
  const canDistribute = getUnsoldPlayers(mockPlayers, mockAuctionLog).length > 0 
    && allTeamsMetMinimum(teamsAllMet, minPlayersPerTeam)
    && getEligibleDistributionTeams(teamsAllMet, minPlayersPerTeam, maxPlayersPerTeam).length > 0;
  
  if (canDistribute === true) {
    console.log('✅ PASS: Distribution is eligible (unsold exist, all teams ≥ min, eligible teams available)\n');
    passed++;
  } else {
    console.log('❌ FAIL: Distribution should be eligible, got false\n');
    failed++;
  }

  // Test 6: Distribution with full teams
  console.log('Test 6: Distribution with full teams');
  const fullTeams = [
    { name: 'Team 1', acquired: 12, balance: 500 },
    { name: 'Team 2', acquired: 6, balance: 600 }
  ];
  const eligibleFull = getEligibleDistributionTeams(fullTeams, minPlayersPerTeam, maxPlayersPerTeam);
  if (eligibleFull.length === 1 && eligibleFull[0].name === 'Team 2') {
    console.log('✅ PASS: Correctly excluded Team 1 (full at 12), included Team 2\n');
    passed++;
  } else {
    console.log('❌ FAIL: Expected only Team 2 eligible, got:', eligibleFull.map(t => t.name));
    console.log();
    failed++;
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log(`📊 Test Results: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(50));

  return failed === 0;
}

// Run tests
const success = runTests();
process.exit(success ? 0 : 1);
