// AI-powered bid suggestion logic (placeholder)
export function suggestBid(player: unknown, team: unknown, history: unknown[]) {
  // noop references to silence unused param warnings in placeholder
  void player; void team; void history;
  return Math.floor(Math.random() * 100000) + 1000;
}

export function alertOverspending(team: unknown, balance: number, bid: number) {
  void team;
  return bid > balance;
}
