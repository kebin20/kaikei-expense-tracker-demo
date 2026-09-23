<p align="center">
  <img src="docs/kaikei-demo-v3-banner.png" alt="Kaikei V3.0 — Personal finance, made clear" width="100%" />
</p>

# Kaikei Demo V3.0

Kaikei Demo is a safe, standalone showcase of the redesigned Kaikei personal-expense tracker. It lets people explore the V3.0 dashboard, transaction, and budget workflows using fictional 2026 finances—without connecting to the private production ledger or Google Sheet.

[Open the hosted demo](https://kaikei-demo-2026.ktanzyl.chatgpt.site)

> **Demo safety:** every included record is synthetic. Changes are saved only in the current browser using `localStorage` and never sync to the production app, Google Sheets, or another visitor.

## V3.0 redesign

This release brings the public demo in line with the current Kaikei experience:

- A dark navy desktop sidebar and compact mobile navigation.
- The new navy wallet app icon across the interface, favicons, PWA assets, and iOS home-screen sizes.
- A consistent orange action system with accessible navy text.
- Uniform card and control corners, clearer number hierarchy, and roomier responsive layouts.
- Light and dark themes saved on the current device.
- Year and selected-month money-flow views.
- Updated V3.0 metadata and installable-app manifest.

## What you can try

- Review the current balance, monthly spending, monthly income, and net cash flow.
- Compare income and expenses across the available 2026 months or focus on the selected month.
- Browse recent activity and category budget progress.
- Add new income or expense transactions.
- Edit and delete transactions.
- Search transactions by description or category.
- Filter the ledger by income or expense.
- Edit planned amounts for individual budget categories.
- Switch between expense and income budgets.
- Reset the entire demo to its original sample data at any time.
- Switch between light and dark themes.
- Install the responsive interface from Safari or Chrome with the dedicated wallet icon.

## Demo data and persistence

The initial dataset lives in `lib/seed-data.json`. On first load, Kaikei makes a browser-local copy under the storage key `kaikei-demo-ledger-v1`.

```text
Synthetic seed data
        ↓ first visit / reset
Browser localStorage
        ↓
Overview, transactions, and budgets
```

Adding a transaction, editing an entry, deleting an entry, or changing a planned amount updates only that browser-local copy. Refreshing the page preserves the changes on the same device and browser. **Reset demo** replaces them with a fresh copy of the bundled sample data.

Clearing site data or using a different browser starts a separate demo session. There is no user account, shared server database, analytics pipeline, or Google Sheet connection in this demo.

## Demo versus production

| Area              | Demo                        | Production Kaikei                          |
| ----------------- | --------------------------- | ------------------------------------------ |
| Financial records | Fictional sample data       | Owner's private financial data             |
| Persistence       | Browser `localStorage`      | Private Google Sheet with server-side sync |
| Cross-device sync | No                          | Yes, through the Sheet                     |
| Reset button      | Restores the bundled sample | Not provided                               |
| Deployment        | Public Sites project        | Separate owner-only Sites project          |
| Repository        | This demo repository        | Private production repository              |

The two apps have separate source histories, deployments, and storage behavior. No production balance, transaction, category, spreadsheet credential, or Sheet content is included here.

## Design

Kaikei V3.0 uses Ant Design as its interface foundation, extended with a custom orange-and-navy visual system:

- Navy `#102542` for primary surfaces, typography, and income indicators.
- Orange `#F26A21` for actions, expenses, and emphasis.
- A dark navy desktop workspace and translucent mobile bottom navigation.
- Touch-friendly transaction and budget forms.
- A wallet app icon sized for favicons, PWA installation, and iOS home screens.
- Consistent rounded surfaces, typography, spacing, contrast, and focus states.

## Technology

- React 19 and TypeScript
- Vinext and Vite
- Ant Design and Ant Design Icons
- Day.js
- OpenAI Sites hosting
- Web App Manifest, Apple web-app metadata, and Open Graph metadata
- Browser `localStorage` for isolated demo persistence

## Project structure

```text
app/
  globals.css          Responsive Kaikei visual system
  layout.tsx           Metadata, PWA, iOS, and social configuration
  page.tsx             Demo state and immediately rendered overview
  providers.tsx        Ant Design app provider
components/
  transactions-view.tsx  On-demand transaction ledger
  transaction-modal.tsx  On-demand transaction editor
  budget-modal.tsx       On-demand planned-amount editor
lib/
  seed-data.json       Fictional monthly budgets and transactions
  ledger-types.ts      Shared ledger data types
public/
  icons/               App and iOS home-screen icons
  manifest.webmanifest Installable-app manifest
  og.png               Existing social preview image
docs/
  kaikei-demo-v3-banner.png
  kaikei-demo-dashboard.jpg
```

## Local development

### Requirements

- Node.js 22 or newer
- npm

### Start the app

```bash
git clone https://github.com/kebin20/kaikei-expense-tracker-demo.git
cd kaikei-expense-tracker-demo
npm ci
npm run dev
```

Open the local URL shown in the terminal. No environment variables, spreadsheet access, or external credentials are required.

### Quality checks

```bash
npm run lint
npm run build
npx tsc --noEmit --incremental false
```

## Installing on iOS

1. Open the hosted demo in Safari.
2. Tap **Share**.
3. Choose **Add to Home Screen**.
4. Confirm the name **Kaikei Demo**.

The dedicated Apple touch icon is used for the installed shortcut. If iOS shows an older cached icon, remove the shortcut and add it again.

## WebMCP support

Browsers that support WebMCP can use the focused `add_transaction` action to add one fictional income or expense entry. The action validates the date, amount, description, type, and category before updating the same local demo ledger.

## Deployment

The public demo is built and published independently through OpenAI Sites. A deployment contains only the compiled application and synthetic seed data. Production Google Sheet settings and secrets must never be added to this project.

The overview and sample ledger render immediately. Heavier transaction-table and editing controls are split into on-demand browser chunks, so they are downloaded only when a visitor opens those features.

## Privacy notes

- Do not replace the synthetic seed with real financial information.
- Do not add production Google Sheet URLs, secrets, or exported workbook data.
- Browser-local changes remain on the device until the site data is cleared or the demo is reset.
- Use this repository for demonstrations, screenshots, reviews, and portfolio sharing; keep real financial data in the private production project.
