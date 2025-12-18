# Auction CCL (Vite + React + TypeScript PWA)

This project is a foundation for a local/offline-friendly Auction control center (players, teams, bidding flow) with CSV import/export, resume (JSON snapshot), and progressive enhancement (AI, predictions, trivia, etc.).

Currently, two official plugins are available in the ecosystem:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## Running

Dev:
```
npm install
npm run dev
```
Production build & preview:
```
npm run build
npm run preview
```

## Auction Log Export (CSV)

From the Auction screen you can export:

* Download Resume (CSV): Full state (round, player index, player sequence, team balances + acquired count, and log).
* Download Log (CSV): Flat table of chronological bid outcomes only.

CSV Columns:

| Column     | Description                               |
|------------|-------------------------------------------|
| Sequence   | 1-based chronological order (oldest first)|
| Timestamp  | Local timestamp string when entry added   |
| Player     | Player name                               |
| Team       | Team awarded (blank for Unsold)           |
| Amount     | Bid amount (blank for Unsold)             |
| Status     | Sold or Unsold                            |

Notes:
* The on-screen log stores newest first for UX; export reverses to chronological.
* Escaping follows RFC 4180 (quotes & newlines handled); a UTF-8 BOM is added for Excel compatibility.
* Empty log attempt gives a friendly alert.

## Importing Players / Teams via CSV
Players and Teams can be bulk imported from CSV in the setup screen. The parser is lenient with header names (case/spacing/punctuation) for: name, age, flat, specialization (or role), description, category, balance.

## Resume Flow (CSV)
Uploading a previously downloaded resume CSV restores auction progress (round, current player index, team balances/acquired counts, and log). The file begins with several `__STATE__` rows followed by the log header and entries.

## Player Distribution System

After all teams have met their minimum player quota (default: 6), unsold players can be distributed to teams using the **Distribution** feature.

### How It Works

1. **Eligibility Check**: The "📦 DISTRIBUTE" button appears when:
   - All teams have acquired ≥ `minPlayersPerTeam` (default: 6)
   - Unsold players still exist

2. **Distribution Modal**: Opens with two-phase workflow:
   - **Assignment Phase**: Select team and optional amount for each unsold player
   - **Summary Phase**: Review all pending assignments before confirming

3. **Eligible Teams**: Only teams that meet both criteria are available:
   - Have acquired ≥ `minPlayersPerTeam` (met minimum quota)
   - Have acquired < `maxPlayersPerTeam` (have roster slots available)

4. **Amount Options**:
   - Default: ₹0 (no payment)
   - Custom: Any amount up to team's remaining balance

5. **Confirmation**: All assignments are applied at once, creating proper log entries and updating team balances.

### Example Workflow

1. During auction, reach round where all teams have ≥ 6 players
2. Unsold players remain (e.g., Player X, Player Y)
3. Click "📦 DISTRIBUTE" button
4. Modal shows "Player X" - select "Team A" and confirm
5. Modal auto-advances to "Player Y" - select "Team B" and confirm
6. Review summary showing both pending assignments
7. Click "Confirm Distribution" to apply
8. Auction marked complete, rosters updated

### CSV Integration

Distribution assignments are included in:
- **Resume Export**: Preserves distribution assignments for session resumption
- **Auction Log Export**: Shows all distribution entries with proper categories

### Technical Details

For implementation details, see:
- `DISTRIBUTION_SYSTEM.md` - Complete feature documentation
- `IMPLEMENTATION_SUMMARY.md` - Technical implementation details
- `test-distribution.js` - Unit tests for core logic

Run tests with: `node test-distribution.js`

## Planned Enhancements
* Rich AI suggestions (valuation / bid alerts)
* Sponsor rotation and heatmap overlays
* Offline install prompt polish (PWA)
* Better accessible keyboard flow & ARIA labelling
* Synchronization across host + display screens
* **Distribution Enhancements:**
  - Auto-distribution algorithm (fair team balancing)
  - Bulk assignment operations
  - Undo/reverse completed distributions
  - Distribution templates and presets

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default tseslint.config([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      ...tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      ...tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      ...tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default tseslint.config([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
