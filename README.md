# DokuWiki Budget Plugin

**Version: 2.0.0**

A full-featured budget management plugin for DokuWiki with monthly budget
tracking, auto-categorisation, and CSV import for Golden 1 Credit Union
and other banks.

## Key Features

### Monthly Budget Dashboard
- Set monthly spending limits per category (Groceries, Gas, Utilities, etc.)
- Dashboard cards at the top show remaining balance per category for the selected month
- Progress bars with colour-coded status: green (on track), amber (>75% spent), purple (over budget)
- Month selector to review any past or current month

### Auto-Categorisation Rules
- Keyword-based rules automatically assign imported transactions to categories
- One-click "Auto-Detect Rules" scans your existing transactions and suggests rules
  based on common merchants (Raley's → Groceries, Chevron → Gas, etc.)
- Built-in knowledge of Golden 1 transaction formats
- Fully editable: add, remove, or change any rule

### CSV Import (Golden 1 / Any Bank)
- Upload CSV exports from Golden 1 Credit Union or any bank
- Auto-detects column mapping for Date, Description, Debit, Credit, Type
- Handles Golden 1's negative-debit format automatically
- "Clear existing before import" checkbox to avoid duplicates
- Imported transactions auto-categorised using your rules

### Transaction Management
- Add income/expense entries with category, date, description, amount
- Inline editing and deletion
- Date filtering: this month, this year, custom range
- CSV export of filtered data

## Theme Compatibility

The plugin inherits your DokuWiki template's colour scheme via CSS `inherit`
and `currentColor`. Works on any theme (light or dark) with zero configuration.

## Installation

1. Extract `budget/` to `lib/plugins/` in your DokuWiki installation
2. Add `<budget name="My Budget" currency="$">` to any wiki page
3. Configure defaults in Admin → Configuration → Budget

## Data Model

All data stored as JSON in `data/meta/budget_<id>.json`:

```json
{
  "entries":  [ { "id", "type", "description", "amount", "category", "date", ... } ],
  "budgets":  [ { "cat": "groceries", "limit": 400 }, ... ],
  "rules":    [ { "keyword": "RALEY", "category": "groceries" }, ... ]
}
```

Existing v1.x data (flat array of entries) is automatically migrated on first load.

Budget Plugin v2.0.0
