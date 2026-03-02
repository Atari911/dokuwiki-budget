# Changelog

## [5.14.10] - 2026-02-23

### Fixed — Rule delete (×) button does nothing; custom category delete same issue

**Root cause**: both the `.rule-del` and `.custom-cat-del` click handlers were bound with `$root.on(...)`. The rules and custom categories panels open as floating editor windows appended to `document.body` — outside `$root`. jQuery delegated events bound on `$root` never fire for elements outside it. Every other panel action handler (add, save, etc.) correctly uses `$(document).on(...)` — these two were the only exceptions.

**Fix**: changed all three affected handlers (`.rule-del`, `.custom-cat-del`, `.custom-cat-label` change) from `$root.on` to `$(document).on`.

### Updated Files
- `script.js` — 3 handler scope fixes
- `plugin.info.txt`, all files — version bump to 5.14.10

---

## [5.14.9] - 2026-02-23

### Fixed — CC summary shows meaningful Charges / Payments / Balance Owed

When a credit card account is selected in the filter, the three summary cards above the transaction table now show CC-specific labels and values instead of the generic Income/Expense/Balance:

| Generic (all accounts) | CC filter active        |
|------------------------|-------------------------|
| Total Income           | Payments                |
| Total Expenses         | Charges                 |
| Balance                | Balance Owed            |

**Balance Owed** = max(0, Charges − Payments) — the outstanding amount you owe on the card. Shown in red (negative class) when there is a balance, green when fully paid.

When you switch back to All Accounts the labels restore to the generic values automatically.

### Updated Files
- script.js — CC-aware summary calculation and label swap
- lang/en/lang.php — `summary_cc_charges`, `summary_cc_payments`, `summary_cc_balance`
- syntax.php — expose new lang keys
- plugin.info.txt, all files — version bump to 5.14.9

---

## [5.14.8] - 2026-02-23

### Added — Account badges everywhere transactions appear

The 💳 CC badge and new 🏦 bank account badge now appear consistently in all transaction views:

- **Main transaction table** (was already there)
- **Dashboard category detail popup** — each transaction row now shows the account badge
- **Merchant/timeline detail popup** — same
- **Month detail popup** — same

Bank account entries show 🏦; CC entries show 💳. Both show the account name as a tooltip on hover. Shared helper `entryAccountBadge(e)` centralises the logic so all views stay in sync automatically.

### Updated Files
- `script.js` — `entryAccountBadge()`, `acctNameById()` helpers; badge added to all 4 transaction list render sites
- `style.css` — `.entry-acct-badge` added alongside `.entry-card-badge`
- `plugin.info.txt`, all files — version bump to 5.14.8

---

## [5.14.6] - 2026-02-23

### Added — CC-specific transaction type labels

CC transactions now carry a `cc_type` field with specific labels beyond just Income/Expense:

| Label     | Maps to | Triggered by                              |
|-----------|---------|-------------------------------------------|
| Purchase  | Expense | keyword PURCHASE or CHARGE in PDF line    |
| Interest  | Expense | keyword INTEREST                          |
| Fee       | Expense | keyword FEE                               |
| Debit     | Expense | keyword DEBIT (fallback)                  |
| Payment   | Income  | keyword PAYMENT                           |
| Credit    | Income  | keyword CREDIT (fallback)                 |
| Refund    | Income  | keyword REFUND or RETURN                  |

- **PDF import**: keywords are matched against the raw line before falling back to sign-based detection
- **CSV import**: the mapped "Type" column is checked via the same mapping table
- **Transaction table**: type badge shows "Purchase", "Payment", etc. instead of generic "Expense"/"Income" for CC entries
- **PDF preview**: preview table also shows the specific cc_type label
- **Inline edit**: CC entries show a CC-specific type dropdown (Purchase, Interest, Fee, Debit, Payment, Credit, Refund) instead of the plain Income/Expense toggle
- **Persistence**: `cc_type` is stored in the JSON data and round-tripped through save/update/import

### Updated Files
- `script.js` — `mapCcTxType()`, PDF parser, CSV mapper, table row renderer, PDF preview, inline edit type select, `doSaveEdit`
- `action.php` — `cc_type` in `ajaxSave`, `ajaxUpdate`, `ajaxImport`
- `plugin.info.txt`, all files — version bump to 5.14.6

---

## [5.14.5] - 2026-02-23

### Fixed — "Clear before import" now scoped to the selected account only
Previously, checking "Clear existing transactions before importing" wiped **all** transactions regardless of which account was selected. This caused data loss when re-importing a single CC or bank statement while other accounts had data.

**New behaviour**: if an account is selected in the import form, only transactions tagged to that account are removed before the new rows are inserted. Transactions from all other accounts are completely untouched.

If no account is selected, the checkbox falls back to clearing everything (legacy full-clear, now only reachable if you deliberately import with no account selected).

The checkbox label now reads: *"Clear previous transactions for this account before importing (other accounts are unaffected)"*

### Updated Files
- `action.php` — `ajaxImport`: account-scoped clear using `clear_account_id` + `clear_account_field` params
- `script.js` — CSV and PDF import handlers pass `clear_account_id`/`clear_account_field`
- `lang/en/lang.php` — updated `import_clear_first` label
- `plugin.info.txt`, all files — version bump to 5.14.5

---

## [5.14.4] - 2026-02-23

### Added — Diagnostic tools to determine if transactions are missing vs filtered

**"Show all" escape link**: when any filter is active (period, account, search, etc.) and some transactions are hidden, a **Show all** link appears next to the count. Clicking it calls `clearSearchFilters()` and resets all state in one shot — guaranteed to show everything.

**Enhanced count bar**: "Showing X of Y" now also shows a breakdown when filtered: "— 12 CC, 45 bank, 230 untagged in total" so you can immediately see the full picture without opening anything.

**Data Manager entry breakdown**: opening the Data Manager panel now shows "Entry counts (from server): N total • N CC-tagged • N bank-tagged • N untagged". This reads directly from the server file so there's no ambiguity about whether the data exists or is being filtered. Also flags a warning if the JS entry count doesn't match the server count (indicating a reload is needed).

### How to diagnose missing transactions
1. Look at the count bar — does "Y total" match what you expect?
   - If Y is low → data may have been lost; check Data Manager backups to restore
   - If Y is correct but X is low → a filter is hiding them; click **Show all**
2. Open Data Manager → check the entry count breakdown for the authoritative server-side count

### Updated Files
- `script.js` — enhanced count bar with breakdown + Show all link; Data Manager entry breakdown
- `plugin.info.txt`, all files — version bump to 5.14.4

---

## [5.14.3] - 2026-02-23

### Fixed — CRITICAL: No transactions/cards visible at all after 5.14.2
- **Root cause**: a `str_replace` that inserted the new bulk-tag handler in 5.14.1 also consumed the opening line of the `ba-delete-btn` handler (`$(document).on('click', '.ba-delete-btn', function () {`). The handler body was left floating at the wrong scope depth, causing the entire outer jQuery plugin wrapper to close one level too early. Every handler defined after that point was outside the plugin scope and never registered. Result: page rendered but was completely non-functional — no transactions, no dashboard cards, no CC strip.
- **Fix**: restored the missing handler opening line. Script now passes `node --check` with zero errors.

### Updated Files
- `script.js` — restored missing `ba-delete-btn` handler opening
- `plugin.info.txt`, all files — version bump to 5.14.3

---

## [5.14.2] - 2026-02-23

### Fixed — CRITICAL: All non-CC transactions disappearing after CC import

Two separate bugs combined to cause this:

**Bug 1 — `cc:`/`ba:` prefix mismatch (primary cause)**
In v5.14.0, account dropdown options were given prefixed values (`cc:visa_1`, `ba:checking_1`) so the change handler could tell which type was selected. But `cardFilter` stores the raw dropdown `.val()`, which is the prefixed string. `filteredEntries()` then compared `e.card_id !== cardFilter` — i.e. `'visa_1' !== 'cc:visa_1'` — which is always `true`. With `cardFilter` non-empty and nothing matching, **every single transaction was filtered out** (or only ones that happened to have no account at all, depending on path). Fixed by decoding the prefix in the `change` handler (`cardFilter = dec ? dec.id : ''`) and re-encoding it only when writing back to the dropdown. All six call sites where the dropdown and `cardFilter` interacted are now consistent.

**Bug 2 — `loadAll()` not resetting `cardFilter`**
After an import, `loadAll()` refreshes all data and re-renders. But `cardFilter` was never cleared, so if a CC was selected when the import ran, the filter stayed active on the freshly loaded view. Users saw only CC transactions and had no obvious indicator that a filter was still in force. Fixed by adding `cardFilter = ''` inside `loadAll()` so every full reload starts from "All Accounts."

### Updated Files
- `script.js` — 6 call-site fixes for prefix handling, `loadAll` cardFilter reset
- `plugin.info.txt`, all files — version bump to 5.14.2

---

## [5.14.1] - 2026-02-23

### Fixed — Missing transactions after CC import
- **Root cause**: default filter was `'12months'` (set in v5.13.2). Existing checking/savings transactions imported before the last 12 months were silently filtered out. Newly imported CC transactions were all recent and passed. Result: it looked like "only CC transactions exist" but it was actually "only recent transactions visible."
- **Fix**: default filter changed back to `'all'` (All Time). Users can still narrow via the period dropdown.

### Added — Bulk-tag untagged transactions to an account
- Each bank account row in the Accounts panel shows a **"🏷 Tag N untagged"** button when untagged transactions exist. Clicking it assigns all currently-untagged entries to that account in one shot (with confirmation). Ideal for retroactively tagging existing imported checking data.

### Added — Account selector in inline row edit
- When editing a transaction inline (pencil icon), an **Account** dropdown is now shown if any accounts exist. It shows all bank accounts and credit cards in optgroups, pre-selected to the entry's current account. Saving updates both `account_id` / `card_id` correctly and clears the old one.

### Fixed — `ajaxUpdate` now handles `account_id`
- Previously, editing a transaction could only set/clear `card_id`. Now it clears both `card_id` and `account_id` then sets whichever the client sends, so you can reassign a CC transaction to a bank account and vice versa.

### Updated Files
- `script.js` — default filter `'all'`, bulk-tag handler, inline edit account selector, `doSaveEdit` account field handling
- `action.php` — `ajaxBulkTagAccount`, `ajaxUpdate` account_id support, switch case
- `style.css` — `.ba-bulk-tag-btn`, `.edit-account`
- `plugin.info.txt`, all files — version bump to 5.14.1

---

## [5.14.0] - 2026-02-23

### Fixed — Account filter stuck on CC, cannot return to full transaction view
- **Root bug**: `renderCreditCardSelectors()` rebuilt the account dropdown from scratch on every `loadAll()` (triggered after every save/import), but never called `.val(cardFilter)` afterward. So the dropdown visually showed "All Cards" (first option) while `cardFilter` still held the old card ID — the filter appeared cleared but wasn't.
- **Fix**: after rebuilding the dropdown, `$cardFilter.val(cardFilter)` restores the current selection. When `cardFilter` is `''`, this correctly selects "All Accounts".
- `clearSearchFilters()` now also clears `cardFilter = ''`, resets the dropdown `.val('')`, and calls `renderCcStrip()` to deselect the orange chip highlight.

### Feature — All Accounts filter (bank accounts + credit cards)
- **"All Cards" → "All Accounts"**: the account filter dropdown and Accounts panel now encompass both credit cards and bank accounts.
- **Bank Accounts**: new section in the Accounts panel lets you add checking, savings, or other bank accounts (name, type, last 4 digits). Bank account entries use `account_id` field; credit cards keep `card_id` for backward compatibility.
- **Unified filter dropdown**: optgroups separate "Bank Accounts" and "Credit Cards" under a single "All Accounts" selector. Selecting any account (bank or CC) filters the full transaction table, dashboard, and timeline to just that account.
- **Accounts panel button**: renamed from "Cards" to "Accounts" with updated icon.
- **Import / Add form**: account selector now includes both bank accounts and CCs in grouped optgroups. Imported entries are tagged with the correct field (`account_id` vs `card_id`) automatically.
- **Backend**: new `bank_accounts` array in data model; new `save_bank_accounts` AJAX action; `ajaxSave` and `ajaxImport` both handle `account_id`.

### Updated Files
- `action.php` — `bank_accounts` data model, `ajaxSaveBankAccounts`, `account_id` in save/import
- `syntax.php` — Accounts panel HTML with `.ba-section`, button label/icon, new lang key exposure
- `script.js` — `bankAccounts` var, `decodeAccountVal()`, `renderBankAccountsSection()`, unified `renderCreditCardSelectors()`, `cardFilteredEntries()` and `filteredEntries()` handle `account_id`, sync fix in `renderCreditCardSelectors`, `clearSearchFilters` reset
- `style.css` — bank accounts section styles
- `lang/en/lang.php` — `ba_*` strings, "All Accounts" label
- `plugin.info.txt`, all files — version bump to 5.14.0

---

## [5.13.12] - 2026-02-23

### Fixed — Reset button did not clear card filter
- `clearSearchFilters()` was missing `cardFilter = ''`, so clicking Reset after a CC filter still showed only CC transactions.
- Also added `.search-card-filter` dropdown reset and `renderCcStrip()` call so the orange chip highlight is cleared visually at the same time.

### Updated Files
- `script.js` — `clearSearchFilters()` now resets `cardFilter`, card dropdown, and strip highlight
- `plugin.info.txt`, all files — version bump to 5.13.12

---

## [5.13.11] - 2026-02-23

### Fixed — CC transactions incorrectly bypassing date filters
- **Root cause**: the v5.13.7 fix for bare `MM/DD` dates used `skipDateFilter = (cardFilter && e.card_id === cardFilter)` — this bypassed the date filter for **all** card-tagged entries whenever a card was selected, not just those with unparseable dates. So "This Month" would still show CC transactions from last year.
- **Fix**: now checks `isNaN(d.getTime())` first. If the date parses successfully, the full period filter is applied normally. The bypass only fires when the date is genuinely unparseable **and** a card filter is active for that entry — the minimum exception needed for legacy bare-date entries.

### Updated Files
- `script.js` — `filteredEntries()` date filter logic
- `plugin.info.txt`, all files — version bump to 5.13.11

---

## [5.13.10] - 2026-02-23

### Added — Batch PDF Import
- PDF file input now accepts `multiple` files at once
- Files are processed **sequentially** (one at a time) to avoid overwhelming the browser — status shows "Reading 2 of 3: filename…" during processing
- All detected rows from all files are merged into a single preview table
- Each preview row now shows a **File** column with the truncated source filename (full name on hover) so you can tell which statement a transaction came from
- If one file errors (e.g. scanned/image PDF), processing continues with the remaining files and the final status notes how many files had errors in amber
- PDF.js is loaded once before batch processing begins, not per-file

### Updated Files
- `syntax.php` — `multiple` on file input, File column header, new lang key exposure
- `script.js` — batch `processNext()` loop, `_file`/`_fileShort` fields on rows, `renderPdfPreview` file column
- `style.css` — `.pdf-file-cell` styling
- `lang/en/lang.php` — 3 new strings: `import_pdf_col_file`, `import_pdf_parsing_batch`, `import_pdf_found_batch`
- `plugin.info.txt`, all files — version bump to 5.13.10

---

## [5.13.9] - 2026-02-23

### Fixed — Dashboard and timeline chart not updating when card selected
- **Root cause**: `buildNormalizedCatSpending()` and the timeline `tlEntries` filter both iterated over the raw `entries` array directly, completely ignoring `cardFilter`. Only the transaction table rows (`filteredEntries()`) respected the card selection.
- **Fix**: added `cardFilteredEntries()` helper that pre-applies the card filter (or `__no_card__` logic) to `entries`. Used in:
  - `buildNormalizedCatSpending()` — dashboard budget cards and sparklines now show only the selected card's spending
  - Timeline `tlEntries` — the bar chart now shows only card transactions when a card is active
  - Dashboard detail popup transaction list (`buildTxnList`)
  - Dashboard detail popup 36-month extended chart (`catEntries36`)
- Both the strip chip click and the search dropdown `change` already called `render()` → `renderDashboard()`, so no additional trigger changes were needed.

### Updated Files
- `script.js` — `cardFilteredEntries()` helper, 4 callsite fixes
- `plugin.info.txt`, all files — version bump to 5.13.9

---

## [5.13.8] - 2026-02-23

### Fixed
- **Selected credit card chip border**: changed from `#0dcaf0` (cyan/blue) to `#fd7e14` (orange).

### Updated Files
- `style.css` — `.cc-strip-selected` border colour
- `plugin.info.txt`, all files — version bump to 5.13.8

---

## [5.13.7] - 2026-02-23

### Fixed — Card transactions not appearing in search
- **Root cause**: Credit card PDF statements typically show dates as `MM/DD` with no year. `normaliseDate()` only handled 3-part dates — a 2-part `"MM/DD"` fell through and was returned as-is. `new Date("01/15")` is browser-dependent / often `Invalid Date`, causing `isNaN()` to fire in `filteredEntries()`, which then dropped the entry immediately under any time-period filter (including the new default "Last 12 Months").
- **Fix 1 — `normaliseDate`**: added a `p.length === 2` branch that infers the year: uses the current year unless that would put the date more than 7 days in the future (e.g. importing a December statement in January), in which case it uses the previous year.
- **Fix 2 — `filteredEntries`**: when a specific card filter is active, the date-period filter is bypassed for entries already tagged to that card. This ensures transactions that were already imported with malformed dates still appear when explicitly filtering by card, and avoids data loss for anyone who imported before this fix.

### Updated Files
- `script.js` — `normaliseDate` MM/DD year inference, `filteredEntries` card-filter date bypass
- `plugin.info.txt`, all files — version bump to 5.13.7

---

## [5.13.6] - 2026-02-23

### Fixed
- **PDF preview table blank after parsing**: `renderPdfPreview` called `fmtMoney(r.amount)` which does not exist — the correct function is `fmt()`. This threw a `ReferenceError` inside the `forEach`, silently aborting before any rows were appended to the table, even though the "N transactions detected" status message showed correctly (it runs before the render call).

### Updated Files
- `script.js` — `fmtMoney` → `fmt` in `renderPdfPreview`
- `plugin.info.txt`, all files — version bump to 5.13.6

---

## [5.13.5] - 2026-02-23

### Fixed — Import Tab Appearance
- **Tabs visually inverted**: the previous CSS used `background:inherit` (transparent/merged) for the active tab and a raised gray (`#f8f9fa`) for inactive tabs — making the active tab look like the hollow/unselected one. Replaced with an opacity-based approach: inactive tabs are dimmed (`opacity:0.55`), active tab is full opacity with a subtle tinted background highlight, making selection immediately obvious in both light and dark themes.
- **No more hardcoded colors**: uses `rgba` opacity overlays instead of fixed hex values so tabs adapt to any DokuWiki theme.

### Updated Files
- `style.css` — tab CSS rewritten
- `plugin.info.txt`, all files — version bump to 5.13.5

---

## [5.13.4] - 2026-02-23

### Fixed — PDF Import Panel
- **Tab click not working**: event handler was bound to `$root.on(...)` but the import panel is moved into a floating popup window outside `$root` when opened. All PDF and tab event handlers changed to `$(document).on(...)` so they fire regardless of DOM position.
- **Context scoping**: all `$root.find(...)` references inside PDF handlers replaced with `$(this).closest('.budget-import-body').find(...)` so they operate on the correct popup instance.
- **`renderPdfPreview()`** now accepts a `$body` context parameter instead of relying on `$root`.
- **Active tab blue text**: removed `color:#0d6efd` from `.budget-import-tab-active` — tabs now inherit the page text colour.

### Updated Files
- `script.js` — document-level delegation for all PDF/tab handlers, `$body` context scoping
- `style.css` — removed blue colour from active tab
- `plugin.info.txt`, all files — version bump to 5.13.4

---

## [5.13.3] - 2026-02-23

### Added — PDF Statement Import
- New **PDF** tab in the Import panel alongside the existing CSV tab
- Uses **PDF.js 3.11 (cdnjs)** loaded lazily on first PDF selection — no server-side dependencies required
- Text extracted page-by-page with Y/X sort to reconstruct logical reading order
- **Heuristic transaction detection**: lines containing a recognised date pattern and a dollar amount are parsed into rows — handles `MM/DD`, `MM/DD/YY`, `MM/DD/YYYY`, `YYYY-MM-DD`, and month-name formats
- Detected rows shown in a **scrollable preview table** — user can deselect individual rows before importing
- Select/deselect-all checkbox in table header
- "Negative amounts are expenses" toggle (mirrors CSV import)
- "Skip duplicate transactions" checkbox
- **Card tagging** — PDF card selector populated alongside the CSV one when credit cards are configured
- Transactions imported via the same backend `import` AJAX action with `source: 'pdf_import'`
- Graceful error if PDF is image-only (scanned) — text extraction returns no data

### Notes
- PDF parsing works on text-based statements (digital PDFs). Scanned/image PDFs require OCR and are not supported.
- Auto-categorisation uses the same `categorise()` engine as CSV import.

### Updated Files
- `syntax.php` — tabbed import panel HTML, new PDF tab, new lang key exposure
- `script.js` — import tab switcher, `loadPdfJs()`, `extractPdfText()`, `parsePdfTransactions()`, `renderPdfPreview()`, PDF card selector in `renderCreditCardSelectors()`
- `style.css` — import tab styles, PDF preview table styles
- `lang/en/lang.php` — 8 new PDF import strings
- `plugin.info.txt`, all files — version bump to 5.13.3

---

## [5.13.2] - 2026-02-23

### Changed
- **Default search period** changed from "All Time" to "Last 12 Months". The `currentFilter` variable now initialises to `'12months'`, and the period dropdown is synced to match on initial load via `loadAll()`. The "Clear Filters" reset still returns to "All Time" as expected.

### Updated Files
- `script.js` — default filter + dropdown sync on load
- `plugin.info.txt`, `syntax.php`, `style.css`, `lang/en/lang.php` — version bump to 5.13.2

---

## [5.13.1] - 2026-02-23

### Fixed
- **`lang/en/lang.php`**: Replaced JavaScript-style `\u2026` / `\u2191` / `\u2193` Unicode escape sequences with their actual UTF-8 characters (`…`, `↑`, `↓`). PHP single-quoted strings do not interpret `\u` escapes, causing them to render literally in the UI (e.g. the search placeholder showed `Search transactions\u2026`).

### Updated Files
- `lang/en/lang.php` — Unicode escape fix
- `plugin.info.txt`, `syntax.php`, `script.js`, `style.css` — version bump to 5.13.1

---

## [5.13.0] - 2026-02-23

### Added — Credit Card Tracking

A complete credit card management system that tracks balances and utilization separately from your main budget, while keeping all transactions in your normal budget categories.

#### New: Credit Card Manager (`💳 Cards` panel)
- Define credit cards with a **name**, **credit limit**, and optional **last 4 digits**
- Per-card stats: Outstanding balance, Available credit, Credit limit, This month's charges, All-time payments, All-time charged
- Visual **utilization bar** — green < 70%, amber 70–89%, red ≥ 90%
- **Inline editing** of card name, limit, and last-4 without reopening a form
- **Delete** cards (existing transaction tags are preserved in the data)

#### New: Credit Card Summary Strip
- Compact card chips appear between the dashboard and action bar when any card exists
- Each chip shows: card name, outstanding / limit, mini utilization bar, and this month's charges
- **Click a chip** to instantly filter the transaction table to that card's transactions
- Color-coded border: green / amber / red based on utilization threshold

#### New: Transaction Tagging
- **Add Transaction form** grows a card selector when cards are configured; leave blank for no card
- **Import CSV panel** shows a "Tag this import as a credit card statement for:" dropdown — all imported transactions are tagged to the selected card in one click
- Inline edit row preserves existing `card_id` (shown as a `💳` badge in the description column)

#### New: Card Filter
- A `Card` dropdown appears in the search row when cards are configured
- Filter transactions by a specific card across all other active filters

#### Design Notes
- Tagged transactions count **normally toward budget categories** — no double counting
- **Payments**: record a credit card payment as an Income transaction tagged to the card; the amount is subtracted from the outstanding balance
- `card_id` is stored as a plain field on each entry in the JSON data file; backward-compatible with all existing data

#### Updated: Data Manager
- Credit cards included in Full Backup / Restore
- "Credit Cards" section checkbox added to selective restore
- Count shown in Data Summary

#### Updated: action.php
- `credit_cards` key added to data model (`loadAll`, `saveAll`, and migration path)
- New `plugin_budget_save_credit_cards` AJAX action
- `plugin_budget_save`, `plugin_budget_update`, `plugin_budget_import` all accept an optional `card_id` parameter
- `ajaxSaveCreditCards` sanitises IDs (lowercase alphanumeric + underscore), limits, and last-4 digits server-side

---

## [5.12.0] - 2026-02-23

### Cleanup / Code Quality (no behaviour changes)
- **syntax.php**: removed orphan `</div> // .budget-control-area` closing tag left over from summary cards relocation (was generating invalid HTML — an unclosed/extra div)
- **syntax.php**: added `version_info` to `getLangStrings()` — it was used in `render()` but missing from the exported keys array, meaning the version footer string was never passed to JS lang map
- **style.css**: removed dead `.budget-control-area` wrapper rule (the element is no longer used as a layout container since summary cards were moved in 5.11.5)
- **style.css**: removed three dead budget manager rules — `.bm-diff`, `.bm-pct`, `.bm-use-avg` — and their associated `.bm-over-avg` / `.bm-under-avg` colour helpers; none are emitted by JS
- **style.css**: collapsed duplicate adjacent section comments (`/* ── Entry Form */` + `/* ── Form */`) into one
- **lang/en/lang.php**: updated `version_info` string from `v5.11.1` to `v5.12.0`
- **plugin.info.txt**: added `version` field; updated date to 2026-02-23

## [5.11.5] - 2026-02-22

### Changed — Summary Cards Moved Below Search Filters
- Income / Expenses / Balance summary cards now appear directly below the search filter panel and above the transaction table, so they reflect the currently filtered results in context
- Removed from the top control area where they were separated from the data they summarise
- Adjusted margin to `0.5em` top/bottom for clean spacing between the search panel and table

## [5.11.4] - 2026-02-22

### Fixed — Budget Manager Category Column Clipping
- `.bm-cat` now has `flex-shrink:0` so the category label is never compressed by adjacent columns in the flex row
- Added `overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:180px` as a graceful fallback for very long category names

## [5.11.3] - 2026-02-22

### Fixed — Average Line Ignores Months With No Transactions
- `buildDetailChart` average was computed by summing all month values and dividing by the total number of months shown (12 or 24), so a merchant with data in only 6 of 12 months would have an average half of the true value — causing most bars to show as purple (over-average)
- Average line now counts only months that have at least one transaction (`v > 0`)
- Applied consistently in `buildDetailChart` and `buildSparkline`
- Affects: category detail windows, merchant detail windows, dashboard sparklines

## [5.11.2] - 2026-02-22

### Changed — Replaced Drag-Resize Columns With Auto-Fit
- Removed column drag-resize handles (were fragile and fought `table-layout:fixed`)
- `fitColumns()` now auto-sizes all columns to their minimum content width on every table render via `MutationObserver`; description column gets all remaining width
- Added middle-mouse-button panning on the table scroll container
