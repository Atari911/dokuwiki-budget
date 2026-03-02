/**
 * DokuWiki Budget Plugin - Client-Side Logic
 * @version 5.14.10
 */
jQuery(function ($) {
    'use strict';
    $('.plugin-budget').each(function () {
        var $root = $(this), config = {};
        try { config = JSON.parse($root.attr('data-config')); } catch (e) { return; }

        var budgetId = config.budgetId, currency = config.currency || '$',
            canEdit = config.canEdit, lang = config.lang || {},
            decimalSep = config.decimalSep || '.', thousandsSep = config.thousandsSep || ',';

        var entries = [], budgetCats = [], rules = [], customCats = [], creditCards = [], bankAccounts = [];
        var defaultExpCats = config.defaultExpCats || [];
        var defaultIncCats = config.defaultIncCats || [];
        var defaultCatLabels = config.defaultCatLabels || {};
        var currentFilter = 'all', filterFrom = '', filterTo = '';
        var searchQuery = '', sortCol = 'date', sortAsc = false;
        var dashMonth = '';
        var cardFilter = ''; // '' = all accounts, or account id to filter to one account

        // ── Utilities ───────────────────────────────────────

        function fmt(n) {
            var f = Math.abs(n).toFixed(2).split('.');
            return (n < 0 ? '-' : '') + currency + f[0].replace(/\B(?=(\d{3})+(?!\d))/g, thousandsSep) + decimalSep + f[1];
        }
        function esc(s) { var d = document.createElement('div'); d.appendChild(document.createTextNode(s)); return d.innerHTML; }

        // Search within both $root and any editor windows attached to body
        function $find(sel) { return $root.find(sel).add($('.editor-win').find(sel)); }

        // Detect the effective page background by probing a temp element
        function getPageColors() {
            var probe = document.createElement('div');
            probe.style.cssText = 'position:absolute;left:-9999px;top:-9999px;width:1px;height:1px;background:inherit;color:inherit;';
            $root[0].appendChild(probe);
            var cs = window.getComputedStyle(probe);
            var bg = cs.backgroundColor;
            var fg = cs.color;
            $root[0].removeChild(probe);
            // If background is transparent, walk up ancestors
            if (!bg || bg === 'transparent' || bg === 'rgba(0, 0, 0, 0)') {
                var el = $root[0].parentElement;
                while (el) {
                    var aBg = window.getComputedStyle(el).backgroundColor;
                    if (aBg && aBg !== 'transparent' && aBg !== 'rgba(0, 0, 0, 0)') { bg = aBg; break; }
                    el = el.parentElement;
                }
            }
            if (!bg || bg === 'transparent' || bg === 'rgba(0, 0, 0, 0)') bg = '#ffffff';
            return { bg: bg, fg: fg };
        }

        // Category label — check custom cats first, then defaults, then lang, then raw id
        function catLabel(c) {
            for (var i = 0; i < customCats.length; i++) {
                if (customCats[i].id === c) return customCats[i].label;
            }
            if (defaultCatLabels[c]) return defaultCatLabels[c];
            return lang['cat_' + c] || c;
        }

        // Get merged list of expense/income categories
        function getAllExpCats() {
            var cats = defaultExpCats.slice();
            customCats.forEach(function (cc) { if (cc.type === 'expense' && cats.indexOf(cc.id) === -1) cats.push(cc.id); });
            return cats;
        }
        function getAllIncCats() {
            var cats = defaultIncCats.slice();
            customCats.forEach(function (cc) { if (cc.type === 'income' && cats.indexOf(cc.id) === -1) cats.push(cc.id); });
            return cats;
        }

        // Build <option> HTML for category selects (used in detail windows)
        function buildCatOptions() {
            var expCats = getAllExpCats(), incCats = getAllIncCats();
            var opts = '<optgroup label="' + esc(lang.lbl_expense || 'Expense') + '">';
            expCats.forEach(function (c) { opts += '<option value="' + esc(c) + '">' + esc(catLabel(c)) + '</option>'; });
            opts += '</optgroup><optgroup label="' + esc(lang.lbl_income || 'Income') + '">';
            incCats.forEach(function (c) { opts += '<option value="' + esc(c) + '">' + esc(catLabel(c)) + '</option>'; });
            opts += '</optgroup>';
            return opts;
        }

        // Rebuild all category <select> dropdowns in the page
        function rebuildCatSelects() {
            var expCats = getAllExpCats(), incCats = getAllIncCats();
            // All selects that need both expense + income groups
            $find('select.budget-input-category, select.budget-rules-new-cat, select.mass-recat-select, select.search-cat-filter').each(function () {
                var $sel = $(this), curVal = $sel.val();
                var isSearchFilter = $sel.hasClass('search-cat-filter');
                var isFormCat = $sel.hasClass('budget-input-category');
                $sel.empty();
                if (isSearchFilter) $sel.append('<option value="">' + esc(lang.all_categories || 'All Categories') + '</option>');
                var $gExp = $('<optgroup>').attr('label', lang.lbl_expense || 'Expense');
                if (isFormCat) $gExp.addClass('budget-cat-expense');
                expCats.forEach(function (c) { $gExp.append('<option value="' + esc(c) + '">' + esc(catLabel(c)) + '</option>'); });
                $sel.append($gExp);
                var $gInc = $('<optgroup>').attr('label', lang.lbl_income || 'Income');
                if (isFormCat) $gInc.addClass('budget-cat-income');
                incCats.forEach(function (c) { $gInc.append('<option value="' + esc(c) + '">' + esc(catLabel(c)) + '</option>'); });
                $sel.append($gInc);
                if (curVal) $sel.val(curVal);
            });
            // Budget manager — expense only
            $find('select.budget-manage-new-cat').each(function () {
                var $sel = $(this), curVal = $sel.val();
                $sel.empty();
                expCats.forEach(function (c) { $sel.append('<option value="' + esc(c) + '">' + esc(catLabel(c)) + '</option>'); });
                if (curVal) $sel.val(curVal);
            });
        }
        function showMsg(text, type) {
            $root.find('.budget-msg').remove();
            var $m = $('<div>').addClass('budget-msg budget-msg-' + (type || 'success')).text(text);
            $root.find('.budget-dashboard').before($m);
            setTimeout(function () { $m.fadeOut(300, function () { $m.remove(); }); }, 4000);
        }
        function ajax(action, data, cb) {
            data.call = 'plugin_budget_' + action;
            data.budget_id = budgetId;
            data.page_id = config.pageId;
            $.post(DOKU_BASE + 'lib/exe/ajax.php', data, function (r) {
                if (typeof r === 'string') try { r = JSON.parse(r); } catch (e) { r = { success: false }; }
                cb(r);
            }).fail(function () { cb({ success: false, error: 'Network error' }); });
        }

        // ── Month-boundary normalization ──────────────────────
        //
        // Recurring payments near month boundaries (e.g. rent posted on
        // the 1st–4th or 28th–31st) can cause charts to show doubled-up
        // months and skipped months. This function detects those cases
        // and virtually shifts boundary transactions to the empty
        // adjacent month so charts look correct.
        //
        // Input:  array of entries, array of YYYY-MM month strings
        // Output: { totals: {ym: amount}, adjusted: true/false }
        //
        // Works per-merchant so a rent payment on Jan 2 doesn't affect
        // a grocery run on Jan 2.

        function normalizeMonthlySpending(txns, monthsList) {
            // Build a set for quick month lookup
            var monthSet = {};
            monthsList.forEach(function (ym) { monthSet[ym] = true; });

            // Helper: get prior and next YYYY-MM
            function adjMonth(ym, offset) {
                var p = ym.split('-');
                var d = new Date(parseInt(p[0]), parseInt(p[1]) - 1 + offset, 1);
                return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2);
            }

            // Group by normalized merchant
            var groups = {};
            txns.forEach(function (t) {
                if (!t.date) return;
                var key = t.description.toUpperCase().replace(/[0-9#\-\/\.]+/g, '').replace(/\s+/g, ' ').trim();
                if (!key) key = '_';
                if (!groups[key]) groups[key] = [];
                groups[key].push(t);
            });

            // Raw totals first
            var totals = {};
            txns.forEach(function (t) {
                if (!t.date) return;
                var ym = t.date.substring(0, 7);
                totals[ym] = (totals[ym] || 0) + t.amount;
            });

            // For each merchant group, look for boundary shifts
            for (var key in groups) {
                var g = groups[key];
                if (g.length < 2) continue; // need multiple txns to detect pattern

                // Bucket by month with individual dates
                var byMonth = {};
                g.forEach(function (t) {
                    var ym = t.date.substring(0, 7);
                    if (!byMonth[ym]) byMonth[ym] = [];
                    byMonth[ym].push(t);
                });

                // Check months with 2+ txns from this merchant
                for (var ym in byMonth) {
                    if (byMonth[ym].length < 2) continue;

                    var prev = adjMonth(ym, -1);
                    var next = adjMonth(ym, 1);
                    var prevEmpty = !byMonth[prev] || byMonth[prev].length === 0;
                    var nextEmpty = !byMonth[next] || byMonth[next].length === 0;

                    if (!prevEmpty && !nextEmpty) continue; // both neighbours have txns, no shift needed

                    // Sort transactions by day
                    var sorted = byMonth[ym].slice().sort(function (a, b) {
                        return a.date.localeCompare(b.date);
                    });

                    // Check earliest txn — could belong to prior month?
                    if (prevEmpty && monthSet[prev]) {
                        var earliest = sorted[0];
                        var day = parseInt(earliest.date.substring(8, 10));
                        if (day <= 4) {
                            // Shift this one transaction to prior month
                            totals[ym] = (totals[ym] || 0) - earliest.amount;
                            totals[prev] = (totals[prev] || 0) + earliest.amount;
                            // Update byMonth so we don't double-shift
                            byMonth[ym] = byMonth[ym].filter(function (t) { return t !== earliest; });
                            if (!byMonth[prev]) byMonth[prev] = [];
                            byMonth[prev].push(earliest);
                            continue; // one shift per month per merchant
                        }
                    }

                    // Check latest txn — could belong to next month?
                    if (nextEmpty && monthSet[next]) {
                        var latest = sorted[sorted.length - 1];
                        var day2 = parseInt(latest.date.substring(8, 10));
                        if (day2 >= 28) {
                            totals[ym] = (totals[ym] || 0) - latest.amount;
                            totals[next] = (totals[next] || 0) + latest.amount;
                            byMonth[ym] = byMonth[ym].filter(function (t) { return t !== latest; });
                            if (!byMonth[next]) byMonth[next] = [];
                            byMonth[next].push(latest);
                        }
                    }
                }
            }

            // Clean up any negative rounding
            for (var ym2 in totals) {
                if (totals[ym2] < 0.005) totals[ym2] = 0;
            }

            return totals;
        }

        // Build normalized monthly spending for ALL categories at once
        // Returns: { cat: { ym: amount } }
        // Returns entries pre-filtered by the active account filter (if any).
        // Handles both credit card entries (card_id) and bank account entries (account_id).
        function cardFilteredEntries() {
            if (!cardFilter) return entries;
            if (cardFilter === '__no_card__') return entries.filter(function (e) { return !e.card_id && !e.account_id; });
            return entries.filter(function (e) { return e.card_id === cardFilter || e.account_id === cardFilter; });
        }


        // Decode a prefixed account selector value (e.g. 'cc:visa_1' or 'ba:checking_1')
        // Returns {field: 'card_id'|'account_id', id: '...'} or null

        // Map CC-specific transaction type strings to income/expense.
        // Returns { type: 'income'|'expense', ccType: 'Payment'|'Purchase'|'Interest'|... }
        // ccType is stored on the entry so the UI can display the specific label.
        function mapCcTxType(txType, fallback) {
            var t = (txType || '').toUpperCase().trim();
            if (t === 'PURCHASE'  || t === 'CHARGE')  return { type: 'expense', ccType: 'Purchase'  };
            if (t === 'INTEREST'                    )  return { type: 'expense', ccType: 'Interest'  };
            if (t === 'FEE'                         )  return { type: 'expense', ccType: 'Fee'        };
            if (t === 'DEBIT'                       )  return { type: 'expense', ccType: 'Debit'      };
            if (t === 'PAYMENT'                     )  return { type: 'income',  ccType: 'Payment'    };
            if (t === 'REFUND'   || t === 'RETURN'  )  return { type: 'income',  ccType: 'Refund'     };
            if (t === 'CREDIT'                      )  return { type: 'income',  ccType: 'Credit'     };
            return { type: fallback, ccType: '' };
        }

        function decodeAccountVal(val) {
            if (!val) return null;
            if (val.indexOf('ba:') === 0) return { field: 'account_id', id: val.slice(3) };
            if (val.indexOf('cc:') === 0) return { field: 'card_id',    id: val.slice(3) };
            // Legacy: bare id treated as card_id for backward compat
            return { field: 'card_id', id: val };
        }

        function buildNormalizedCatSpending(monthsList) {
            // Group entries by category — respects active card filter
            var byCat = {};
            cardFilteredEntries().forEach(function (e) {
                if (e.type !== 'expense' || !e.date) return;
                var cat = e.category || 'other_expense';
                if (!byCat[cat]) byCat[cat] = [];
                byCat[cat].push(e);
            });

            var result = {};
            for (var cat in byCat) {
                result[cat] = normalizeMonthlySpending(byCat[cat], monthsList);
            }
            return result;
        }

        // ── Merchant knowledge base (shared by categorise + auto-detect) ──

        var guessMap = {
            // Groceries
            'RALEY': 'groceries', "RALEY'S": 'groceries', 'SAFEWAY': 'groceries', 'SPROUTS': 'groceries',
            'SAVEMART': 'groceries', 'COSTCO': 'groceries', 'HELLOFRESH': 'groceries',
            'TRADER JOE': 'groceries', 'WHOLE FOODS': 'groceries', 'WINCO': 'groceries',
            'GROCERY OUTLET': 'groceries', 'FOOD MAXX': 'groceries', 'ALDI': 'groceries',
            'WALMART': 'groceries', 'TARGET': 'groceries', 'FOOD 4': 'groceries',
            'SMART & FINAL': 'groceries', 'LUCKY': 'groceries', 'BOUNTIFUL': 'groceries',
            'VONS': 'groceries', 'ALBERTSON': 'groceries', 'KROGER': 'groceries',

            // Dining / fast food
            'IN-N-OUT': 'dining', 'CHICK-FIL': 'dining', 'MOUNTAIN MIKE': 'dining',
            'RAMEN': 'dining', 'RESTAURANT': 'dining', 'EPPIES': 'dining',
            'TACO BELL': 'dining', 'MCDONALDS': 'dining', "MCDONALD'S": 'dining',
            'BURGER KING': 'dining', 'WENDYS': 'dining', "WENDY'S": 'dining',
            'JACK IN THE': 'dining', 'JACK IN BOX': 'dining',
            'SUBWAY': 'dining', 'CHIPOTLE': 'dining', 'PANDA EXPRESS': 'dining',
            'POPEYES': 'dining', 'KFC': 'dining', 'PIZZA HUT': 'dining',
            'DOMINO': 'dining', 'PAPA JOHN': 'dining', 'LITTLE CAESAR': 'dining',
            'WINGSTOP': 'dining', 'FIVE GUYS': 'dining', 'SONIC DRIVE': 'dining',
            'DAIRY QUEEN': 'dining', 'CARLS JR': 'dining',
            'DEL TACO': 'dining', 'EL POLLO': 'dining', 'RAISING CANE': 'dining',
            'STARBUCKS': 'dining', 'DUNKIN': 'dining', 'DUTCH BROS': 'dining',
            'DENNY': 'dining', 'IHOP': 'dining', 'WAFFLE HOUSE': 'dining',
            'APPLEBEE': 'dining', 'OLIVE GARDEN': 'dining', 'RED LOBSTER': 'dining',
            'CHILI': 'dining', 'OUTBACK': 'dining', 'CRACKER BARREL': 'dining',
            'HONG KONG WOK': 'dining', 'NEW CHINA': 'dining', 'WOK': 'dining',
            'SUSHI': 'dining', 'THAI': 'dining', 'PIZZA': 'dining',
            'GRILL': 'dining', 'CAFE': 'dining', 'DELI': 'dining',
            'DOORDASH': 'dining', 'GRUBHUB': 'dining', 'UBER EATS': 'dining',
            'JCS SACRAMENTO': 'dining', 'COME N GO': 'dining',

            // Gas stations (amount-aware: _gas_station resolved at runtime)
            'CHEVRON': '_gas_station', 'SHELL': '_gas_station', 'ARCO': '_gas_station',
            'FLYING J': '_gas_station', 'MAVERIK': '_gas_station',
            'VALERO': '_gas_station', 'EXXON': '_gas_station', 'MOBIL': '_gas_station',
            'MARATHON': '_gas_station', 'CIRCLE K': '_gas_station', 'PILOT': '_gas_station',
            'LOVES': '_gas_station', "LOVE'S": '_gas_station', 'MURPHY': '_gas_station',
            'SPEEDWAY': '_gas_station', 'WAWA': '_gas_station', 'QUIKTRIP': '_gas_station',
            'RACETRAC': '_gas_station', 'SHEETZ': '_gas_station', 'CASEY': '_gas_station',
            'SINCLAIR': '_gas_station', 'CONOCO': '_gas_station', 'PHILLIPS': '_gas_station',
            'SUNOCO': '_gas_station', 'CITGO': '_gas_station', 'BP ': '_gas_station',
            'PETRO': '_gas_station', '7-ELEVEN': '_gas_station', 'AM PM': '_gas_station',
            'AMPM': '_gas_station', 'LUCKY GAS': '_gas_station',

            // Transport (non-gas)
            'UBER': 'transport', 'LYFT': 'transport', 'PARKING': 'transport',
            'CITYOFSAC': 'transport',

            // Shopping
            'AMAZON': 'shopping', 'AMZN': 'shopping', 'HOME DEPOT': 'shopping',
            'LOWES': 'shopping', 'BEST BUY': 'shopping', 'SOAP KORNER': 'shopping',

            // Subscriptions
            'NETFLIX': 'subscriptions', 'SPOTIFY': 'subscriptions', 'PATREON': 'subscriptions',
            'HULU': 'subscriptions', 'PRIME VIDEO': 'subscriptions', 'AMAZON PRIME': 'subscriptions',
            'ANTHROPIC': 'subscriptions', 'CLAUDE': 'subscriptions',
            'OPENAI': 'subscriptions', 'CHATGPT': 'subscriptions',
            'DIGITALOCEAN': 'subscriptions', 'NYTIMES': 'subscriptions',
            'APPLE.COM': 'subscriptions', 'APPLECARD': 'subscriptions',
            'YOUTUBE': 'subscriptions', 'DISNEY': 'subscriptions', 'HBO': 'subscriptions',
            'PARAMOUNT': 'subscriptions', 'PEACOCK': 'subscriptions',

            // ATM / Cash
            'ATM': 'atm', 'ATMRC': 'atm', 'ATMNW': 'atm', 'ATMDNS': 'atm',
            'ATM FEE': 'atm', 'CASH BACK': 'atm',

            // Transfers
            'ZELLE': 'transfers', 'TRANSFER': 'transfers', 'VENMO': 'transfers',
            'CASHAPP': 'transfers', 'ONLINE TRANSFER': 'transfers',

            // Utilities
            'PG&E': 'utilities', 'SMUD': 'utilities', 'COMCAST': 'utilities',
            'VZWRLSS': 'utilities', 'VERIZON': 'utilities', 'T-MOBILE': 'utilities',
            'AT&T': 'utilities', 'XFINITY': 'utilities', 'SPECTRUM': 'utilities',

            // Housing
            'RENT': 'housing', 'RIVERFRONT': 'housing', 'AGI*RENTER': 'housing',
            'MORTGAGE': 'housing', 'STORE ROTE SELF': 'housing',

            // Healthcare
            'WALGREENS': 'healthcare', 'CVS': 'healthcare', 'KP NCAL': 'healthcare',
            'KAISER': 'healthcare', 'PHARMACY': 'healthcare',

            // Personal
            'BROHAM': 'personal', 'VAPE': 'personal', 'SMOKE': 'personal',
            'TOBACCO': 'personal', 'REAL DEAL SMOKE': 'personal',

            // Income
            'ASPEN': 'salary', 'PAYROLL': 'salary', 'DIRECT-PAY': 'salary',
            'DEPOSIT': 'deposit',

            // Tax
            'FRANCHISE TAX': 'other_expense',
        };

        // Gas station keywords that need amount-aware categorisation
        var gasStationPatterns = [
            'CHEVRON','SHELL','ARCO','FLYING J','MAVERIK','VALERO','EXXON','MOBIL',
            'MARATHON','CIRCLE K','PILOT','LOVES',"LOVE'S",'MURPHY','SPEEDWAY','WAWA',
            'QUIKTRIP','RACETRAC','SHEETZ','CASEY','SINCLAIR','CONOCO','PHILLIPS',
            'SUNOCO','CITGO','BP ','PETRO','7-ELEVEN','AM PM','AMPM','LUCKY GAS'
        ];

        function categorise(desc, amount) {
            if (!desc) return 'other_expense';
            var upper = desc.toUpperCase();

            // 1) Gas stations FIRST — amount determines gas vs food
            for (var g = 0; g < gasStationPatterns.length; g++) {
                if (upper.indexOf(gasStationPatterns[g]) !== -1) {
                    return (amount || 0) > 50 ? 'gas' : 'dining';
                }
            }

            // 2) User-defined rules
            var lower = desc.toLowerCase();
            for (var i = 0; i < rules.length; i++) {
                if (lower.indexOf(rules[i].keyword.toLowerCase()) !== -1) return rules[i].category;
            }

            // 3) Built-in guessMap (non-gas entries)
            for (var pattern in guessMap) {
                if (upper.indexOf(pattern) !== -1) {
                    var cat = guessMap[pattern];
                    if (cat === '_gas_station') {
                        // Shouldn't reach here since checked above, but safety net
                        return (amount || 0) > 50 ? 'gas' : 'dining';
                    }
                    return cat;
                }
            }
            return 'other_expense';
        }

        // ── Filter + Search + Sort ──────────────────────────

        var searchTypeFilter = '', searchCatFilter = '', searchMinAmt = null, searchMaxAmt = null;
        var tlSelectedMonth = null; // timeline zoom: null = show all, 'YYYY-MM' = zoomed
        var tlSelectedDay = null;   // day zoom: null = show month days, 'YYYY-MM-DD' = hourly

        function filteredEntries() {
            var now = new Date(), yr = now.getFullYear(), mo = now.getMonth();
            var out = entries.filter(function (e) {
                // Time period filter
                if (currentFilter !== 'all') {
                    var d = new Date(e.date);
                    // Only bypass the date filter if the date is unparseable (e.g. bare MM/DD
                    // stored before v5.13.7) AND a card filter is active for this entry —
                    // otherwise apply the period filter normally.
                    var badDate = isNaN(d.getTime());
                    var isCardEntry = (cardFilter && cardFilter !== '__no_card__' && (e.card_id === cardFilter || e.account_id === cardFilter));
                    if (badDate && isCardEntry) {
                        // Can't evaluate date — let it through so card view still shows it
                    } else {
                        if (badDate) return false;
                        if (currentFilter === 'month' && !(d.getFullYear() === yr && d.getMonth() === mo)) return false;
                        if (currentFilter === '60days') { var c60 = new Date(); c60.setDate(c60.getDate() - 60); if (d < c60) return false; }
                        if (currentFilter === '90days') { var c90 = new Date(); c90.setDate(c90.getDate() - 90); if (d < c90) return false; }
                        if (currentFilter === '12months') { var c12 = new Date(); c12.setFullYear(c12.getFullYear() - 1); if (d < c12) return false; }
                        if (currentFilter === 'custom') {
                            if (filterFrom && d < new Date(filterFrom)) return false;
                            if (filterTo && d > new Date(filterTo)) return false;
                        }
                    }
                }
                // Text search
                if (searchQuery) {
                    var q = searchQuery.toLowerCase();
                    var hay = ((e.description || '') + ' ' + catLabel(e.category) + ' ' + (e.type || '') + ' ' + (e.date || '')).toLowerCase();
                    if (hay.indexOf(q) === -1) return false;
                }
                // Type filter
                if (searchTypeFilter && e.type !== searchTypeFilter) return false;
                // Category filter
                if (searchCatFilter && e.category !== searchCatFilter) return false;
                // Amount range
                if (searchMinAmt !== null && e.amount < searchMinAmt) return false;
                if (searchMaxAmt !== null && e.amount > searchMaxAmt) return false;
                // Timeline month zoom
                if (tlSelectedMonth && e.date && e.date.substring(0, 7) !== tlSelectedMonth) return false;
                // Timeline day zoom
                if (tlSelectedDay && e.date && e.date.substring(0, 10) !== tlSelectedDay) return false;
                // Account filter (credit cards use card_id, bank accounts use account_id)
                if (cardFilter) {
                    if (cardFilter === '__no_card__') {
                        if (e.card_id || e.account_id) return false;
                    } else {
                        if (e.card_id !== cardFilter && e.account_id !== cardFilter) return false;
                    }
                }
                return true;
            });

            out.sort(function (a, b) {
                var va, vb;
                if (sortCol === 'date') { va = a.date || ''; vb = b.date || ''; }
                else if (sortCol === 'type') { va = a.type || ''; vb = b.type || ''; }
                else if (sortCol === 'category') { va = catLabel(a.category); vb = catLabel(b.category); }
                else if (sortCol === 'description') { va = (a.description || '').toLowerCase(); vb = (b.description || '').toLowerCase(); }
                else if (sortCol === 'amount') { va = a.amount || 0; vb = b.amount || 0; }
                else { va = a.date || ''; vb = b.date || ''; }

                if (sortCol === 'amount') {
                    return sortAsc ? va - vb : vb - va;
                }
                var cmp = String(va).localeCompare(String(vb));
                return sortAsc ? cmp : -cmp;
            });

            return out;
        }

        function updateSearchResults() {
            var results = filteredEntries();
            var totalInc = 0, totalExp = 0;
            results.forEach(function (e) {
                if (e.type === 'income') totalInc += e.amount;
                else totalExp += e.amount;
            });

            var hasFilters = searchQuery || searchTypeFilter || searchCatFilter || searchMinAmt !== null || searchMaxAmt !== null;
            var statsText = '';
            if (hasFilters || currentFilter !== 'all') {
                statsText = results.length + ' transaction' + (results.length !== 1 ? 's' : '');
                if (totalInc > 0 && totalExp > 0) {
                    statsText += ' — Income: ' + fmt(totalInc) + '  Expenses: ' + fmt(totalExp) + '  Net: ' + fmt(totalInc - totalExp);
                } else if (totalInc > 0) {
                    statsText += ' — Total: ' + fmt(totalInc);
                } else if (totalExp > 0) {
                    statsText += ' — Total: ' + fmt(totalExp);
                }
                if (results.length > 0) {
                    var dates = results.map(function (e) { return e.date || ''; }).filter(function (d) { return d; }).sort();
                    if (dates.length > 0) {
                        statsText += '  (' + dates[0] + ' to ' + dates[dates.length - 1] + ')';
                    }
                }
            }
            $root.find('.search-results-stats').text(statsText);

            // Timeline mini chart
            var $tl = $root.find('.search-timeline');

            // For the timeline, we need ALL matching entries (ignoring tlSelectedMonth)
            // so the overview chart always shows the full picture
            var tlEntries = cardFilteredEntries().filter(function (e) {
                if (currentFilter !== 'all') {
                    var d = new Date(e.date);
                    if (isNaN(d.getTime())) return false;
                    var now2 = new Date(), yr2 = now2.getFullYear(), mo2 = now2.getMonth();
                    if (currentFilter === 'month' && !(d.getFullYear() === yr2 && d.getMonth() === mo2)) return false;
                    if (currentFilter === '60days') { var c60 = new Date(); c60.setDate(c60.getDate() - 60); if (d < c60) return false; }
                    if (currentFilter === '90days') { var c90 = new Date(); c90.setDate(c90.getDate() - 90); if (d < c90) return false; }
                    if (currentFilter === '12months') { var c12 = new Date(); c12.setFullYear(c12.getFullYear() - 1); if (d < c12) return false; }
                    if (currentFilter === 'custom') {
                        if (filterFrom && d < new Date(filterFrom)) return false;
                        if (filterTo && d > new Date(filterTo)) return false;
                    }
                }
                if (searchQuery) {
                    var q2 = searchQuery.toLowerCase();
                    var hay2 = ((e.description || '') + ' ' + catLabel(e.category) + ' ' + (e.type || '') + ' ' + (e.date || '')).toLowerCase();
                    if (hay2.indexOf(q2) === -1) return false;
                }
                if (searchTypeFilter && e.type !== searchTypeFilter) return false;
                if (searchCatFilter && e.category !== searchCatFilter) return false;
                if (searchMinAmt !== null && e.amount < searchMinAmt) return false;
                if (searchMaxAmt !== null && e.amount > searchMaxAmt) return false;
                return true;
            });

            if (tlEntries.length < 2 && !tlSelectedMonth && !tlSelectedDay) { $tl.empty(); return; }

            var shortMonthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
            var chartW = 800, labelH = 18, barArea, svg, legendHtml;

            if (tlSelectedDay) {
                // ── LEVEL 3: DAY DETAIL — transaction list grouped by category ──
                var dayTxns = [];
                tlEntries.forEach(function (e) {
                    if (e.date && e.date.substring(0, 10) === tlSelectedDay) dayTxns.push(e);
                });

                var dayDate = new Date(tlSelectedDay + 'T12:00:00');
                var dayLabel = dayDate.toLocaleDateString('default', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

                var html = '<div class="tl-day-detail">';
                html += '<div class="tl-day-header">';
                html += '<strong>' + esc(dayLabel) + '</strong>';
                html += '<span class="tl-day-nav">';
                html += '<a href="#" class="tl-zoom-up" data-level="day">&larr; Back to ' + esc(shortMonthNames[parseInt(tlSelectedMonth.split('-')[1]) - 1]) + '</a>';
                html += ' &middot; <a href="#" class="tl-zoom-out">Overview</a>';
                html += '</span></div>';

                if (dayTxns.length === 0) {
                    html += '<p class="tl-day-empty">No transactions on this day.</p>';
                } else {
                    // Group by category
                    var catGroups = {};
                    var dayTotalInc = 0, dayTotalExp = 0;
                    dayTxns.forEach(function (t) {
                        var cat = t.category || 'other_expense';
                        if (!catGroups[cat]) catGroups[cat] = { txns: [], total: 0, type: t.type };
                        catGroups[cat].txns.push(t);
                        catGroups[cat].total += t.amount;
                        if (t.type === 'income') dayTotalInc += t.amount;
                        else dayTotalExp += t.amount;
                    });

                    var groupKeys = Object.keys(catGroups).sort(function (a, b) {
                        var at = catGroups[a].type, bt = catGroups[b].type;
                        if (at !== bt) return at === 'expense' ? -1 : 1;
                        return catGroups[b].total - catGroups[a].total;
                    });

                    // Compact summary
                    var dayNet = dayTotalInc - dayTotalExp;
                    html += '<div class="tl-day-summary">';
                    if (dayTotalExp > 0) html += '<span>Spent: <strong style="color:#9d00e6;">' + fmt(dayTotalExp) + '</strong></span>';
                    if (dayTotalInc > 0) html += '<span>Earned: <strong style="color:#28a745;">' + fmt(dayTotalInc) + '</strong></span>';
                    html += '<span>Net: <strong style="color:' + (dayNet >= 0 ? '#28a745' : '#9d00e6') + ';">' + fmt(dayNet) + '</strong></span>';
                    html += '</div>';

                    groupKeys.forEach(function (cat) {
                        var g = catGroups[cat];
                        var isInc = g.type === 'income';
                        html += '<div class="tl-day-group">';
                        html += '<div class="tl-day-gh"><span style="color:' + (isInc ? '#28a745' : '#9d00e6') + ';">' + esc(catLabel(cat)) + '</span><span class="tl-day-gt">' + (isInc ? '+' : '-') + fmt(g.total) + '</span></div>';
                        g.txns.forEach(function (t) {
                            html += '<div class="tl-day-txn" data-desc="' + esc(t.description) + '" data-cat="' + esc(cat) + '">';
                            html += '<span class="tl-day-td">' + esc(t.description) + '</span>';
                            html += '<span class="tl-day-ta" style="color:' + (isInc ? '#28a745' : '#9d00e6') + ';">' + (isInc ? '+' : '-') + fmt(t.amount) + '</span>';
                            html += '</div>';
                        });
                        html += '</div>';
                    });
                }
                html += '</div>';
                $tl.html(html);

            } else if (tlSelectedMonth) {
                // ── LEVEL 2: DAILY VIEW for a single month ──
                var daysInMonth = new Date(parseInt(tlSelectedMonth.split('-')[0]), parseInt(tlSelectedMonth.split('-')[1]), 0).getDate();
                var dayData = {};
                for (var di = 1; di <= daysInMonth; di++) {
                    var dayKey = tlSelectedMonth + '-' + ('0' + di).slice(-2);
                    dayData[dayKey] = { inc: 0, exp: 0, txns: [] };
                }
                tlEntries.forEach(function (e) {
                    if (!e.date || e.date.substring(0, 7) !== tlSelectedMonth) return;
                    var dk = e.date.substring(0, 10);
                    if (!dayData[dk]) dayData[dk] = { inc: 0, exp: 0, txns: [] };
                    if (e.type === 'income') dayData[dk].inc += e.amount;
                    else dayData[dk].exp += e.amount;
                    dayData[dk].txns.push(e);
                });

                var dayKeys = Object.keys(dayData).sort();
                var dn = dayKeys.length;
                var dChartH = 75;
                barArea = dChartH - labelH;
                var dPad = 4, dBarW = (chartW - dPad * 2) / dn, dGap = Math.max(1, dBarW * 0.1);
                var dMaxVal = 1;
                dayKeys.forEach(function (dk) {
                    var dd = dayData[dk];
                    if (dd.exp > dMaxVal) dMaxVal = dd.exp;
                    if (dd.inc > dMaxVal) dMaxVal = dd.inc;
                });

                var dSvg = '<svg class="search-timeline-svg tl-daily" viewBox="0 0 ' + chartW + ' ' + dChartH + '" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">';
                for (var dii = 0; dii < dn; dii++) {
                    var dk = dayKeys[dii];
                    var dd = dayData[dk];
                    var dx = dPad + dii * dBarW;
                    var dbw = dBarW - dGap;
                    var dayNum = parseInt(dk.split('-')[2]);

                    if (dd.exp > 0) {
                        var deh = (dd.exp / dMaxVal) * (barArea - 2);
                        dSvg += '<rect x="' + dx.toFixed(1) + '" y="' + (barArea - deh).toFixed(1) + '" width="' + (dbw / 2).toFixed(1) + '" height="' + deh.toFixed(1) + '" fill="#9d00e6" opacity="0.65" rx="0.5" style="pointer-events:none;" />';
                    }
                    if (dd.inc > 0) {
                        var dih = (dd.inc / dMaxVal) * (barArea - 2);
                        dSvg += '<rect x="' + (dx + dbw / 2).toFixed(1) + '" y="' + (barArea - dih).toFixed(1) + '" width="' + (dbw / 2).toFixed(1) + '" height="' + dih.toFixed(1) + '" fill="#28a745" opacity="0.65" rx="0.5" style="pointer-events:none;" />';
                    }

                    // Clickable hitbox
                    var ttParts = [];
                    if (dd.exp > 0) ttParts.push('Exp: ' + fmt(dd.exp));
                    if (dd.inc > 0) ttParts.push('Inc: ' + fmt(dd.inc));
                    if (dd.txns.length > 0) ttParts.push(dd.txns.length + ' txn' + (dd.txns.length > 1 ? 's' : ''));
                    dSvg += '<rect class="tl-day-bar" data-day="' + esc(dk) + '" x="' + dx.toFixed(1) + '" y="0" width="' + dbw.toFixed(1) + '" height="' + barArea + '" fill="transparent" style="cursor:pointer;"><title>' + esc(dk) + (ttParts.length ? ': ' + ttParts.join(', ') : '') + '</title></rect>';

                    // Day number labels — all days shown, bold weekends
                    var dayDate = new Date(dk + 'T12:00:00');
                    var isWeekend = dayDate.getDay() === 0 || dayDate.getDay() === 6;
                    dSvg += '<text x="' + (dx + dbw / 2).toFixed(1) + '" y="' + (dChartH - 3) + '" font-size="7" fill="currentColor" text-anchor="middle" opacity="' + (isWeekend ? '0.9' : '0.65') + '" font-weight="' + (isWeekend ? '700' : '400') + '">' + dayNum + '</text>';
                }
                dSvg += '</svg>';

                var sp2 = tlSelectedMonth.split('-');
                var mName = new Date(parseInt(sp2[0]), parseInt(sp2[1]) - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' });
                var dLegend = '<div class="search-tl-legend">';
                dLegend += '<span class="search-tl-leg"><span class="search-tl-dot" style="background:#9d00e6;"></span>Expenses</span>';
                dLegend += '<span class="search-tl-leg"><span class="search-tl-dot" style="background:#28a745;"></span>Income</span>';
                dLegend += '<span class="search-tl-sel">Daily: <strong>' + esc(mName) + '</strong> <a href="#" class="tl-zoom-out">(back to overview)</a></span>';
                dLegend += '</div>';

                $tl.html(dSvg + dLegend);

            } else {
                // ── LEVEL 1: OVERVIEW — daily if short range, monthly if long ──
                // Determine date span of filtered entries
                var minDateStr = null, maxDateStr = null;
                tlEntries.forEach(function (e) {
                    if (!e.date) return;
                    var ds = e.date.substring(0, 10);
                    if (!minDateStr || ds < minDateStr) minDateStr = ds;
                    if (!maxDateStr || ds > maxDateStr) maxDateStr = ds;
                });
                if (!minDateStr) { $tl.empty(); return; }

                var spanDays = Math.round((new Date(maxDateStr + 'T12:00:00') - new Date(minDateStr + 'T12:00:00')) / 86400000) + 1;
                var useDailyRes = spanDays <= 93; // ≤~3 months → daily bars

                if (useDailyRes) {
                    // ── DAILY RESOLUTION OVERVIEW ──
                    var dayBuckets = {};
                    tlEntries.forEach(function (e) {
                        if (!e.date) return;
                        var dk = e.date.substring(0, 10);
                        if (!dayBuckets[dk]) dayBuckets[dk] = { inc: 0, exp: 0 };
                        if (e.type === 'income') dayBuckets[dk].inc += e.amount;
                        else dayBuckets[dk].exp += e.amount;
                    });

                    // Build continuous day range
                    var allDays = [];
                    var cur = new Date(minDateStr + 'T12:00:00');
                    var end = new Date(maxDateStr + 'T12:00:00');
                    while (cur <= end) {
                        allDays.push(cur.getFullYear() + '-' + ('0' + (cur.getMonth() + 1)).slice(-2) + '-' + ('0' + cur.getDate()).slice(-2));
                        cur.setDate(cur.getDate() + 1);
                    }

                    var dn = allDays.length;
                    var dChartH = 65;
                    barArea = dChartH - labelH;
                    var dPad = 4, dBarW = (chartW - dPad * 2) / dn, dGap = Math.max(0.5, dBarW * 0.08);
                    var dMax = 1;
                    allDays.forEach(function (dk) {
                        var b = dayBuckets[dk] || { inc: 0, exp: 0 };
                        if (b.exp > dMax) dMax = b.exp;
                        if (b.inc > dMax) dMax = b.inc;
                    });

                    svg = '<svg class="search-timeline-svg tl-daily" viewBox="0 0 ' + chartW + ' ' + dChartH + '" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">';
                    for (var dri = 0; dri < dn; dri++) {
                        var dk = allDays[dri];
                        var b = dayBuckets[dk] || { inc: 0, exp: 0 };
                        var dx = dPad + dri * dBarW;
                        var dbw = dBarW - dGap;

                        if (b.exp > 0) {
                            var deh = (b.exp / dMax) * (barArea - 2);
                            svg += '<rect x="' + dx.toFixed(1) + '" y="' + (barArea - deh).toFixed(1) + '" width="' + (dbw / 2).toFixed(1) + '" height="' + deh.toFixed(1) + '" fill="#9d00e6" opacity="0.6" rx="0.5" style="pointer-events:none;" />';
                        }
                        if (b.inc > 0) {
                            var dih = (b.inc / dMax) * (barArea - 2);
                            svg += '<rect x="' + (dx + dbw / 2).toFixed(1) + '" y="' + (barArea - dih).toFixed(1) + '" width="' + (dbw / 2).toFixed(1) + '" height="' + dih.toFixed(1) + '" fill="#28a745" opacity="0.6" rx="0.5" style="pointer-events:none;" />';
                        }

                        // Clickable hitbox → zoom into day detail
                        var ttParts = [];
                        if (b.exp > 0) ttParts.push('Exp: ' + fmt(b.exp));
                        if (b.inc > 0) ttParts.push('Inc: ' + fmt(b.inc));
                        svg += '<rect class="tl-day-bar" data-day="' + esc(dk) + '" x="' + dx.toFixed(1) + '" y="0" width="' + dbw.toFixed(1) + '" height="' + barArea + '" fill="transparent" style="cursor:pointer;"><title>' + esc(dk) + (ttParts.length ? ': ' + ttParts.join(', ') : '') + '</title></rect>';

                        // Day labels
                        var dayD = new Date(dk + 'T12:00:00');
                        var dayNum = dayD.getDate();
                        var isWeekend = dayD.getDay() === 0 || dayD.getDay() === 6;
                        var isFirst = dayNum === 1;
                        // Label strategy: 1st of month always labeled with month name, otherwise every N days
                        var labelEveryD = dn <= 31 ? 1 : (dn <= 62 ? 2 : 3);
                        if (isFirst) {
                            svg += '<text x="' + (dx + dbw / 2).toFixed(1) + '" y="' + (dChartH - 3) + '" font-size="7" fill="currentColor" text-anchor="middle" opacity="0.9" font-weight="700">' + shortMonthNames[dayD.getMonth()] + '</text>';
                        } else if (dri % labelEveryD === 0) {
                            svg += '<text x="' + (dx + dbw / 2).toFixed(1) + '" y="' + (dChartH - 3) + '" font-size="6.5" fill="currentColor" text-anchor="middle" opacity="' + (isWeekend ? '0.8' : '0.55') + '" font-weight="' + (isWeekend ? '600' : '400') + '">' + dayNum + '</text>';
                        }
                    }
                    svg += '</svg>';

                    legendHtml = '<div class="search-tl-legend">';
                    legendHtml += '<span class="search-tl-leg"><span class="search-tl-dot" style="background:#9d00e6;"></span>Expenses</span>';
                    legendHtml += '<span class="search-tl-leg"><span class="search-tl-dot" style="background:#28a745;"></span>Income</span>';
                    legendHtml += '</div>';

                    $tl.html(svg + legendHtml);

                } else {
                    // ── MONTHLY RESOLUTION OVERVIEW ──
                    var months = {};
                    var minYM = null, maxYM = null;
                    tlEntries.forEach(function (e) {
                        if (!e.date) return;
                        var ym = e.date.substring(0, 7);
                        if (!months[ym]) months[ym] = { inc: 0, exp: 0 };
                        if (e.type === 'income') months[ym].inc += e.amount;
                        else months[ym].exp += e.amount;
                        if (!minYM || ym < minYM) minYM = ym;
                        if (!maxYM || ym > maxYM) maxYM = ym;
                    });

                    var allMonths = [];
                    var sp = minYM.split('-'), startY = parseInt(sp[0]), startM = parseInt(sp[1]);
                    var ep = maxYM.split('-'), endY = parseInt(ep[0]), endM = parseInt(ep[1]);
                    var totalMonths = (endY - startY) * 12 + (endM - startM) + 1;
                    if (totalMonths > 60) totalMonths = 60;
                    for (var tmi = 0; tmi < totalMonths; tmi++) {
                        var td = new Date(startY, startM - 1 + tmi, 1);
                        allMonths.push(td.getFullYear() + '-' + ('0' + (td.getMonth() + 1)).slice(-2));
                    }

                    var n = allMonths.length;
                    var mChartH = 60;
                    barArea = mChartH - labelH;
                    var pad = 4, barW = (chartW - pad * 2) / n, gap = Math.max(1, barW * 0.1);
                    var maxVal = 1;
                    allMonths.forEach(function (ym) {
                        var d = months[ym] || { inc: 0, exp: 0 };
                        if (d.exp > maxVal) maxVal = d.exp;
                        if (d.inc > maxVal) maxVal = d.inc;
                    });

                    svg = '<svg class="search-timeline-svg tl-monthly" viewBox="0 0 ' + chartW + ' ' + mChartH + '" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">';
                    for (var ti = 0; ti < n; ti++) {
                        var ym = allMonths[ti];
                        var d = months[ym] || { inc: 0, exp: 0 };
                        var x = pad + ti * barW;
                        var bw = barW - gap;

                        svg += '<rect class="tl-bar" data-month="' + esc(ym) + '" x="' + x.toFixed(1) + '" y="0" width="' + bw.toFixed(1) + '" height="' + barArea + '" fill="transparent" style="cursor:pointer;"><title>Click: ' + esc(ym) + '</title></rect>';

                        if (d.exp > 0) {
                            var eh = (d.exp / maxVal) * (barArea - 2);
                            svg += '<rect x="' + x.toFixed(1) + '" y="' + (barArea - eh).toFixed(1) + '" width="' + (bw / 2).toFixed(1) + '" height="' + eh.toFixed(1) + '" fill="#9d00e6" opacity="0.6" rx="0.5" style="pointer-events:none;" />';
                        }
                        if (d.inc > 0) {
                            var ih = (d.inc / maxVal) * (barArea - 2);
                            svg += '<rect x="' + (x + bw / 2).toFixed(1) + '" y="' + (barArea - ih).toFixed(1) + '" width="' + (bw / 2).toFixed(1) + '" height="' + ih.toFixed(1) + '" fill="#28a745" opacity="0.6" rx="0.5" style="pointer-events:none;" />';
                        }

                        var mIdx = parseInt(ym.split('-')[1]) - 1;
                        var moLabel = shortMonthNames[mIdx];
                        var isJan = mIdx === 0;
                        if (isJan || ti === 0) {
                            moLabel = shortMonthNames[mIdx] + ' \u2019' + ym.split('-')[0].slice(-2);
                        }
                        var labelEvery = n <= 12 ? 1 : (n <= 24 ? 2 : 3);
                        if (ti % labelEvery === 0 || isJan) {
                            svg += '<text x="' + (x + bw / 2).toFixed(1) + '" y="' + (mChartH - 3) + '" font-size="' + (n <= 18 ? '8' : '7') + '" fill="currentColor" text-anchor="middle" opacity="' + (isJan ? '0.9' : '0.65') + '" font-weight="' + (isJan ? '700' : '400') + '">' + esc(moLabel) + '</text>';
                        }
                    }
                    svg += '</svg>';

                    legendHtml = '<div class="search-tl-legend">';
                    legendHtml += '<span class="search-tl-leg"><span class="search-tl-dot" style="background:#9d00e6;"></span>Expenses</span>';
                    legendHtml += '<span class="search-tl-leg"><span class="search-tl-dot" style="background:#28a745;"></span>Income</span>';
                    legendHtml += '</div>';

                    $tl.html(svg + legendHtml);
                }
            }
        }

        // ── Dashboard ───────────────────────────────────────

        function populateMonthSelect() {
            var $sel = $root.find('.budget-dash-month'), months = {};
            entries.forEach(function (e) { if (e.date) months[e.date.substring(0, 7)] = true; });
            var keys = Object.keys(months).sort().reverse();
            var now = new Date(), cur = now.getFullYear() + '-' + ('0' + (now.getMonth() + 1)).slice(-2);
            if (keys.indexOf(cur) === -1) keys.unshift(cur);
            $sel.empty();
            keys.forEach(function (ym) {
                var p = ym.split('-');
                var lbl = new Date(parseInt(p[0]), parseInt(p[1]) - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' });
                $sel.append('<option value="' + ym + '"' + (ym === cur ? ' selected' : '') + '>' + esc(lbl) + '</option>');
            });
            dashMonth = $sel.val() || cur;
        }

        function renderDashboard() {
            var $cards = $root.find('.budget-dash-cards'), $empty = $root.find('.budget-dash-empty');
            $cards.empty();
            if (budgetCats.length === 0) { $empty.show(); return; }
            $empty.hide();

            // Build list of 12 months ending at dashMonth
            var dp = dashMonth.split('-');
            var endY = parseInt(dp[0]), endM = parseInt(dp[1]);
            var months12 = [];
            for (var mi = 11; mi >= 0; mi--) {
                var d12 = new Date(endY, endM - 1 - mi, 1);
                months12.push(d12.getFullYear() + '-' + ('0' + (d12.getMonth() + 1)).slice(-2));
            }
            var priorMonth = months12[months12.length - 2]; // month before dashMonth

            // Accumulate spending per category per month (with boundary normalization)
            var monthSpending = buildNormalizedCatSpending(months12);

            budgetCats.forEach(function (bc) {
                var catData = monthSpending[bc.cat] || {};
                var spent = catData[dashMonth] || 0;
                var prior = catData[priorMonth] || 0;
                var rem = bc.limit - spent;
                var pct = bc.limit > 0 ? Math.min((spent / bc.limit) * 100, 100) : 0;
                var over = rem < 0, cls = over ? 'over' : (pct > 75 ? 'warn' : 'ok');

                // Trend arrow
                var trendHtml = '';
                if (prior > 0 || spent > 0) {
                    var diff = spent - prior;
                    if (diff < 0) {
                        trendHtml = '<span class="dash-trend dash-trend-down" title="' + fmt(Math.abs(diff)) + ' less than last month">&#9660; ' + fmt(Math.abs(diff)) + '</span>';
                    } else if (diff > 0) {
                        trendHtml = '<span class="dash-trend dash-trend-up" title="' + fmt(diff) + ' more than last month">&#9650; ' + fmt(diff) + '</span>';
                    } else {
                        trendHtml = '<span class="dash-trend dash-trend-flat" title="Same as last month">&#9644; same</span>';
                    }
                }

                // Build 12-month sparkline SVG bar chart
                var vals = months12.map(function (ym) { return catData[ym] || 0; });
                var sparkHtml = buildSparkline(vals, bc.limit, months12);

                var h = '<div class="budget-dash-card ' + cls + '" data-cat="' + esc(bc.cat) + '" title="Click for details" draggable="true" data-idx="' + $cards.children().length + '">';
                h += '<div class="dash-card-top"><span class="dash-card-cat">' + esc(catLabel(bc.cat)) + '</span>';
                h += '<span class="dash-card-remaining ' + (over ? 'negative' : 'positive') + '">' + fmt(rem) + '</span></div>';
                h += '<div class="dash-card-bar"><div class="dash-card-fill" style="width:' + pct + '%"></div></div>';
                h += '<div class="dash-card-bottom"><span>' + fmt(spent) + ' / ' + fmt(bc.limit) + '</span>';
                if (over) h += '<span class="dash-card-over">' + esc(lang.dash_over_budget || 'Over budget!') + '</span>';
                h += '</div>';
                h += '<div class="dash-card-trend-row">';
                if (trendHtml) h += trendHtml;
                h += sparkHtml;
                h += '</div>';
                h += '</div>';

                // Store data for detail popup
                var $card = $(h);
                $card.data('detail', {
                    cat: bc.cat,
                    label: catLabel(bc.cat),
                    limit: bc.limit,
                    spent: spent,
                    remaining: rem,
                    prior: prior,
                    months12: months12,
                    vals: vals,
                    catData: catData
                });
                $cards.append($card);
            });
        }

        // ── Dashboard card drag-and-drop reordering ─────────

        var dragSrcIdx = null;

        $root.on('dragstart', '.budget-dash-card', function (e) {
            dragSrcIdx = parseInt($(this).attr('data-idx'));
            $(this).addClass('dash-card-dragging');
            e.originalEvent.dataTransfer.effectAllowed = 'move';
            e.originalEvent.dataTransfer.setData('text/plain', dragSrcIdx);
        });

        $root.on('dragend', '.budget-dash-card', function () {
            $(this).removeClass('dash-card-dragging');
            $root.find('.dash-card-dragover').removeClass('dash-card-dragover');
        });

        $root.on('dragover', '.budget-dash-card', function (e) {
            e.preventDefault();
            e.originalEvent.dataTransfer.dropEffect = 'move';
            $root.find('.dash-card-dragover').removeClass('dash-card-dragover');
            $(this).addClass('dash-card-dragover');
        });

        $root.on('dragleave', '.budget-dash-card', function () {
            $(this).removeClass('dash-card-dragover');
        });

        $root.on('drop', '.budget-dash-card', function (e) {
            e.preventDefault();
            $(this).removeClass('dash-card-dragover');
            var dropIdx = parseInt($(this).attr('data-idx'));
            if (dragSrcIdx === null || dragSrcIdx === dropIdx) return;

            // Reorder budgetCats array
            var item = budgetCats.splice(dragSrcIdx, 1)[0];
            budgetCats.splice(dropIdx, 0, item);

            // Save new order and re-render
            ajax('save_budgets', { budgets: JSON.stringify(budgetCats) }, function (r) {
                if (!r.success) showMsg(lang.msg_error_save || 'Save failed', 'error');
            });
            renderDashboard();
            dragSrcIdx = null;
        });

        /**
         * Build an inline SVG sparkline bar chart.
         * Green bars = under budget limit, purple bars = over budget.
         * Thin dashed line = budget limit (high water mark).
         * Bars have data-tip for custom tooltip on hover.
         */
        function buildSparkline(values, limit, labels) {
            var w = 120, h = 36, pad = 1;
            var maxVal = limit;
            for (var i = 0; i < values.length; i++) { if (values[i] > maxVal) maxVal = values[i]; }
            if (maxVal === 0) maxVal = 1;
            var barW = (w - pad * 2) / values.length;
            var gap = 1;

            var svg = '<svg class="dash-sparkline" viewBox="0 0 ' + w + ' ' + h + '" xmlns="http://www.w3.org/2000/svg">';

            // Budget limit line
            var limY = h - ((limit / maxVal) * (h - 4)) - 2;
            if (limY < 1) limY = 1;
            svg += '<line x1="' + pad + '" y1="' + limY.toFixed(1) + '" x2="' + (w - pad) + '" y2="' + limY.toFixed(1) + '" stroke="currentColor" stroke-width="0.7" stroke-dasharray="2,1.5" opacity="0.4" />';

            for (var b = 0; b < values.length; b++) {
                var val = values[b];
                var barH = maxVal > 0 ? (val / maxVal) * (h - 4) : 0;
                if (val > 0 && barH < 1) barH = 1;
                var x = pad + b * barW + gap / 2;
                var y = h - barH - 2;
                var fill = val > limit ? '#9d00e6' : '#28a745';
                var opacity = (b === values.length - 1) ? '1' : '0.6';
                var lbl = labels[b] || '';
                var lblParts = lbl.split('-');
                var monthName = lblParts.length === 2
                    ? new Date(parseInt(lblParts[0]), parseInt(lblParts[1]) - 1, 1).toLocaleString('default', { month: 'short', year: 'numeric' })
                    : lbl;
                var tipText = monthName + ': ' + fmt(val);
                svg += '<rect class="spark-bar" x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + (barW - gap).toFixed(1) + '" height="' + barH.toFixed(1) + '" fill="' + fill + '" opacity="' + opacity + '" rx="0.5" data-tip="' + esc(tipText) + '" />';
            }

            svg += '</svg>';
            return svg;
        }

        // ── Custom sparkline tooltip ────────────────────────

        var $sparkTip = $('<div class="spark-tooltip"></div>').appendTo('body').hide();

        $root.on('mouseenter', '.spark-bar', function (e) {
            var tip = $(this).attr('data-tip');
            if (!tip) return;
            $sparkTip.text(tip).show();
        });
        $root.on('mousemove', '.spark-bar', function (e) {
            $sparkTip.css({ left: e.pageX + 10, top: e.pageY - 28 });
        });
        $root.on('mouseleave', '.spark-bar', function () {
            $sparkTip.hide();
        });

        // ═══════ DETAIL POPUP WINDOWS ═══════════════════════

        var detailZIndex = 10000;

        $root.on('click', '.budget-dash-card', function (e) {
            // Don't open if clicking inside sparkline
            if ($(e.target).closest('.dash-sparkline').length) return;
            var detail = $(this).data('detail');
            if (!detail) return;
            openDetailWindow(detail);
        });

        /**
         * Build a detail-view bar chart SVG.
         * @param {Array} values - spending per month
         * @param {number} limit - budget limit (0 for no budget line)
         * @param {Array} labels - YYYY-MM labels per bar
         * @param {Object} opts - optional {barClass, color}
         */
        function buildDetailChart(values, limit, labels, opts) {
            opts = opts || {};
            var n = values.length;
            var compact = opts.compact || false;
            var chartW = Math.max(440, n * (compact ? 20 : 16));
            var chartH = compact ? 100 : 160;
            var chartPad = compact ? 30 : 40;
            var chartArea = chartH - (compact ? 22 : 30);
            var barW = (chartW - chartPad * 2) / n, gapL = Math.max(1, 3 - n * 0.05);

            var avg = 0;
            var avgN = 0;
            for (var ai = 0; ai < n; ai++) { if (values[ai] > 0) { avg += values[ai]; avgN++; } }
            avg = avgN > 0 ? avg / avgN : 0;

            var maxVal = limit > 0 ? limit : avg;
            for (var mi = 0; mi < n; mi++) { if (values[mi] > maxVal) maxVal = values[mi]; }
            if (avg > maxVal) maxVal = avg;
            if (maxVal === 0) maxVal = 1;

            var svg = '<svg class="detail-chart" viewBox="0 0 ' + chartW + ' ' + chartH + '" xmlns="http://www.w3.org/2000/svg">';

            var lineFontSize = compact ? '6' : '8';

            // Budget line
            if (limit > 0) {
                var limY = chartH - ((limit / maxVal) * chartArea) - 10;
                svg += '<line x1="' + chartPad + '" y1="' + limY.toFixed(1) + '" x2="' + (chartW - chartPad) + '" y2="' + limY.toFixed(1) + '" stroke="currentColor" stroke-width="1" stroke-dasharray="4,3" opacity="0.4" />';
                svg += '<text x="' + (chartW - chartPad + 4) + '" y="' + (limY + 4).toFixed(1) + '" font-size="' + lineFontSize + '" fill="currentColor" opacity="0.5">Budget</text>';
            }

            // Average line
            var avgY = chartH - ((avg / maxVal) * chartArea) - 10;
            svg += '<line x1="' + chartPad + '" y1="' + avgY.toFixed(1) + '" x2="' + (chartW - chartPad) + '" y2="' + avgY.toFixed(1) + '" stroke="#ffa53d" stroke-width="1" stroke-dasharray="2,2" opacity="0.6" />';
            svg += '<text x="' + (chartW - chartPad + 4) + '" y="' + (avgY + 4).toFixed(1) + '" font-size="' + lineFontSize + '" fill="#ffa53d" opacity="0.7">Avg ' + esc(fmt(avg)) + '</text>';

            // Show year separators for extended charts
            var prevYear = '';
            for (var b = 0; b < n; b++) {
                var val = values[b];
                var barH = maxVal > 0 ? (val / maxVal) * chartArea : 0;
                if (val > 0 && barH < 2) barH = 2;
                var x = chartPad + b * barW + gapL / 2;
                var y = chartH - barH - 10;
                var defaultFill = limit > 0 ? (val > limit ? '#9d00e6' : '#28a745') : (val > avg * 1.5 ? '#9d00e6' : (opts.color || '#28a745'));
                var fill = defaultFill;
                var opac = (b === n - 1) ? '1' : '0.65';
                var lblP = labels[b].split('-');
                var yr = lblP[0];
                var mAbbr = new Date(parseInt(lblP[0]), parseInt(lblP[1]) - 1, 1).toLocaleString('default', { month: 'short' });
                var tipT = mAbbr + ' ' + yr + ': ' + fmt(val);
                var barCls = 'spark-bar' + (opts.barClass ? ' ' + opts.barClass : '');

                svg += '<rect class="' + barCls + '" x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + (barW - gapL).toFixed(1) + '" height="' + barH.toFixed(1) + '" fill="' + fill + '" opacity="' + opac + '" rx="1" data-tip="' + esc(tipT) + '" data-month="' + esc(labels[b]) + '" />';

                // Month label — show year on January or first bar
                var showLabel = mAbbr;
                if (yr !== prevYear && b > 0) {
                    // Year separator line
                    svg += '<line x1="' + x.toFixed(1) + '" y1="0" x2="' + x.toFixed(1) + '" y2="' + (chartH - 12) + '" stroke="currentColor" stroke-width="0.5" opacity="0.15" />';
                    showLabel = mAbbr + ' \'' + yr.slice(-2);
                }
                prevYear = yr;

                var fontSize = compact ? '5' : (n > 24 ? '5.5' : '7');
                svg += '<text x="' + (x + (barW - gapL) / 2).toFixed(1) + '" y="' + (chartH - 1) + '" font-size="' + fontSize + '" fill="currentColor" text-anchor="middle" opacity="0.55">' + esc(showLabel) + '</text>';

                if (val > 0 && !compact && n <= 24) {
                    svg += '<text x="' + (x + (barW - gapL) / 2).toFixed(1) + '" y="' + (y - 2).toFixed(1) + '" font-size="7" fill="' + fill + '" text-anchor="middle" font-weight="600">' + esc(fmt(val)) + '</text>';
                }
            }
            svg += '</svg>';
            return svg;
        }

        function openDetailWindow(d) {
            detailZIndex++;
            var winId = 'detail-' + d.cat + '-' + Date.now();
            var endY = parseInt(dashMonth.split('-')[0]), endM = parseInt(dashMonth.split('-')[1]);

            // Build 12-month chart
            var svg = buildDetailChart(d.vals, d.limit, d.months12, { barClass: 'detail-bar' });

            // Transaction list — initially shows dashMonth
            var catOpts = buildCatOptions();

            function buildTxnList(ym) {
                var txns = cardFilteredEntries().filter(function (e) {
                    return e.type === 'expense' && e.category === d.cat && e.date && e.date.substring(0, 7) === ym;
                }).sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });
                var ymParts = ym.split('-');
                var monthLabel = new Date(parseInt(ymParts[0]), parseInt(ymParts[1]) - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' });
                var h2 = '<div class="detail-txns-header">' + esc(monthLabel) + ' &mdash; ' + txns.length + ' transaction' + (txns.length !== 1 ? 's' : '') + ' &mdash; ' + fmt(txns.reduce(function (s, t) { return s + t.amount; }, 0)) + '</div>';
                h2 += '<div class="detail-txns-scroll"><table>';
                h2 += '<thead><tr><th style="width:90px;">Date</th><th>Description</th><th style="width:80px;">Amount</th><th style="width:100px;">Category</th></tr></thead>';
                if (txns.length === 0) {
                    h2 += '<tr><td colspan="4" style="text-align:center;opacity:0.5;padding:1em;">No transactions this month</td></tr>';
                } else {
                    txns.forEach(function (t) {
                        h2 += '<tr class="detail-txn-row" data-id="' + esc(t.id) + '" data-desc="' + esc(t.description) + '">';
                        h2 += '<td>' + esc(t.date) + '</td><td class="detail-txn-desc">' + entryAccountBadge(t) + esc(t.description) + '</td><td class="detail-txn-amt">' + fmt(t.amount) + '</td>';
                        h2 += '<td class="detail-txn-cat"><select class="detail-recat-select">' + catOpts + '</select></td>';
                    });
                }
                h2 += '</table></div>';
                // Set selected values after render via data attribute
                return { html: h2, txns: txns };
            }

            function renderTxnList(ym) {
                var result = buildTxnList(ym);
                $win.find('.detail-txns').html(result.html);
                // Set selected category on each dropdown
                result.txns.forEach(function (t) {
                    $win.find('.detail-txn-row[data-id="' + t.id + '"] .detail-recat-select').val(t.category);
                });
            }

            var txnHtml = '<div class="detail-txns"></div>';

            // Stats summary
            var avg12 = 0, avg12n = 0;
            d.vals.forEach(function (v) { if (v > 0) { avg12 += v; avg12n++; } });
            avg12 = avg12n > 0 ? avg12 / avg12n : 0;
            var max12 = Math.max.apply(null, d.vals);
            var min12 = Math.min.apply(null, d.vals.filter(function (v) { return v > 0; }));
            if (!isFinite(min12)) min12 = 0;

            var statsHtml = '<div class="detail-stats">';
            statsHtml += '<div class="detail-stat"><span class="detail-stat-label">12-mo avg</span><span class="detail-stat-val">' + fmt(avg12) + '</span></div>';
            statsHtml += '<div class="detail-stat"><span class="detail-stat-label">12-mo high</span><span class="detail-stat-val">' + fmt(max12) + '</span></div>';
            statsHtml += '<div class="detail-stat"><span class="detail-stat-label">12-mo low</span><span class="detail-stat-val">' + fmt(min12) + '</span></div>';
            statsHtml += '<div class="detail-stat"><span class="detail-stat-label">Budget</span><span class="detail-stat-val">' + fmt(d.limit) + '/mo</span></div>';
            statsHtml += '</div>';

            // Build extended chart: 12 current months (top, clickable) + 24 prior months (bottom, reference)
            var months36 = [];
            for (var mi36 = 35; mi36 >= 0; mi36--) {
                var d36 = new Date(endY, endM - 1 - mi36, 1);
                months36.push(d36.getFullYear() + '-' + ('0' + (d36.getMonth() + 1)).slice(-2));
            }
            var catEntries36 = cardFilteredEntries().filter(function (e) { return e.type === 'expense' && e.category === d.cat && e.date; });
            var catData36 = normalizeMonthlySpending(catEntries36, months36);

            var prior24 = months36.slice(0, 24);
            var valsPrior24 = prior24.map(function (ym) { return catData36[ym] || 0; });
            var valsCur12 = d.months12.map(function (ym) { return catData36[ym] || 0; });

            var extTopSvg = buildDetailChart(valsCur12, d.limit, d.months12, { barClass: 'detail-bar' });
            var extBotSvg = buildDetailChart(valsPrior24, d.limit, prior24, { compact: true, barClass: 'detail-bar' });
            var extSvg = '<div class="ext-chart-section"><div class="ext-chart-label">Current 12 Months</div>' + extTopSvg + '</div>' +
                '<div class="ext-chart-section ext-chart-prior"><div class="ext-chart-label">Prior 24 Months</div>' + extBotSvg + '</div>';

            // Build window
            var html = '<div class="budget-detail-win" id="' + winId + '" style="z-index:' + detailZIndex + '">';
            html += '<div class="detail-win-titlebar">';
            html += '<span class="detail-win-title">' + esc(d.label) + '</span>';
            html += '<div class="detail-win-btns">';
            html += '<button class="detail-win-print" title="Print">&#128438;</button>';
            html += '<button class="detail-win-maximize" title="Maximize">&#9744;</button>';
            html += '<button class="detail-win-close" title="Close">&times;</button>';
            html += '</div>';
            html += '</div>';
            html += '<div class="detail-win-body">';
            html += '<div class="detail-win-left">';
            html += statsHtml;
            html += '<div class="detail-chart-wrap detail-chart-normal">' + svg + '</div>';
            html += '<div class="detail-chart-wrap detail-chart-extended" style="display:none;">' + extSvg + '</div>';
            html += '</div>';
            html += '<div class="detail-win-right">';
            html += txnHtml;
            html += '</div>';
            html += '</div></div>';

            var $win = $(html).appendTo('body');
            var pageColors = getPageColors();
            $win[0].style.setProperty('background-color', pageColors.bg, 'important');
            $win[0].style.setProperty('color', pageColors.fg, 'important');

            // State tracking
            var winState = {
                snapped: false, // false, 'left', 'right', 'max'
                restore: null   // {top, left, width, height} before snap
            };

            function saveRestoreState() {
                if (!winState.restore) {
                    var r = $win[0].getBoundingClientRect();
                    winState.restore = { top: r.top, left: r.left, width: r.width, height: r.height };
                }
            }

            function restoreWin() {
                $win.removeClass('detail-win-snapped-left detail-win-snapped-right detail-win-maximized');
                if (winState.restore) {
                    $win.css({
                        top: winState.restore.top, left: winState.restore.left,
                        width: winState.restore.width, height: winState.restore.height
                    });
                }
                winState.snapped = false;
                winState.restore = null;
                // Swap back to 12-month chart
                $win.find('.detail-chart-extended').hide();
                $win.find('.detail-chart-normal').show();
            }

            function snapLeft() {
                saveRestoreState();
                $win.removeClass('detail-win-snapped-right detail-win-maximized').addClass('detail-win-snapped-left');
                $win.css({ top: 0, left: 0, width: '50vw', height: '100vh' });
                winState.snapped = 'left';
            }

            function snapRight() {
                saveRestoreState();
                $win.removeClass('detail-win-snapped-left detail-win-maximized').addClass('detail-win-snapped-right');
                $win.css({ top: 0, left: '50vw', width: '50vw', height: '100vh' });
                winState.snapped = 'right';
            }

            function maximizeWin() {
                saveRestoreState();
                $win.removeClass('detail-win-snapped-left detail-win-snapped-right').addClass('detail-win-maximized');
                $win.css({ top: 0, left: 0, width: '100vw', height: '100vh' });
                winState.snapped = 'max';
                // Swap to extended 36-month chart
                $win.find('.detail-chart-normal').hide();
                $win.find('.detail-chart-extended').show();
            }

            // Position: center of viewport, offset for cascading (desktop only)
            var isMobile = window.innerWidth <= 768;
            if (!isMobile) {
                var openCount = $('.budget-detail-win').length;
                var vpW = $(window).width(), vpH = $(window).height();
                var winW = 480, winH = 450;
                var baseLeft = Math.max(10, (vpW - winW) / 2 + (openCount - 1) * 30);
                var baseTop = Math.max(10, (vpH - winH) / 3 + (openCount - 1) * 30);
                $win.css({ top: baseTop, left: baseLeft, width: winW, height: winH });
            }

            // On mobile, lock body scroll while window is open
            if (isMobile) { document.body.style.overflow = 'hidden'; }

            // Close
            $win.find('.detail-win-close').on('click', function (e) {
                e.stopPropagation();
                $win.remove();
                if (isMobile && !$('.budget-detail-win').length) { document.body.style.overflow = ''; }
            }).on('mousedown', function (e) { e.stopPropagation(); });

            // Maximize / restore button
            $win.find('.detail-win-maximize').on('click', function (e) {
                e.stopPropagation();
                if (winState.snapped === 'max') { restoreWin(); }
                else { maximizeWin(); }
            }).on('mousedown', function (e) { e.stopPropagation(); });

            // Bring to front on click
            $win.on('mousedown', function () {
                detailZIndex++;
                $(this).css('z-index', detailZIndex);
            });

            // Double-click titlebar: cycle snap states
            // First double-click → snap left. If another window exists snapped left, snap right instead.
            // If already snapped → restore.
            $win.find('.detail-win-titlebar').on('dblclick', function (e) {
                if ($(e.target).closest('.detail-win-btns').length) return;
                e.preventDefault();
                if (winState.snapped) {
                    restoreWin();
                    return;
                }
                // Check if any other window is already snapped left
                var otherSnappedLeft = false;
                $('.budget-detail-win').not($win).each(function () {
                    if ($(this).hasClass('detail-win-snapped-left')) otherSnappedLeft = true;
                });
                if (otherSnappedLeft) { snapRight(); }
                else { snapLeft(); }
            });

            // Draggable titlebar — unsnap on drag
            $win.find('.detail-win-titlebar').on('mousedown', function (e) {
                if ($(e.target).closest('.detail-win-btns').length) return;
                e.preventDefault();
                var rect = $win[0].getBoundingClientRect();
                var ox = e.clientX - rect.left;
                var oy = e.clientY - rect.top;
                var dragged = false;
                function onMove(ev) {
                    if (!dragged && winState.snapped) {
                        // Unsnap: restore size but follow cursor
                        var rw = winState.restore ? winState.restore.width : 480;
                        var rh = winState.restore ? winState.restore.height : 450;
                        $win.removeClass('detail-win-snapped-left detail-win-snapped-right detail-win-maximized');
                        $win.css({ width: rw, height: rh });
                        ox = rw / 2; // center cursor on restored width
                        oy = 15;
                        winState.snapped = false;
                        winState.restore = null;
                        dragged = true;
                    }
                    dragged = true;
                    $win.css({ left: ev.clientX - ox, top: ev.clientY - oy });
                }
                function onUp() {
                    $(document).off('mousemove', onMove).off('mouseup', onUp);
                }
                $(document).on('mousemove', onMove).on('mouseup', onUp);
            });

            // Click a bar to switch the transaction list to that month
            $win.on('click', '.detail-bar', function () {
                var ym = $(this).attr('data-month');
                if (!ym) return;
                $win.find('.detail-bar').attr('opacity', '0.45');
                $(this).attr('opacity', '1');
                renderTxnList(ym);
            });

            // Highlight the current month bar on open + render initial txns
            $win.find('.detail-bar[data-month="' + dashMonth + '"]').attr('opacity', '1');
            renderTxnList(dashMonth);

            // Re-categorise a single transaction from the dropdown
            $win.on('change', '.detail-recat-select', function (e) {
                e.stopPropagation();
                var $row = $(this).closest('.detail-txn-row');
                var entryId = $row.data('id');
                var newCat = $(this).val();
                if (!entryId || !newCat) return;

                // Update in-memory
                for (var ei = 0; ei < entries.length; ei++) {
                    if (entries[ei].id === entryId) { entries[ei].category = newCat; break; }
                }

                // Save to server
                ajax('recategorise', { updates: JSON.stringify([{ id: entryId, category: newCat }]) }, function (r) {
                    if (r.success) {
                        $row.addClass('detail-txn-recatted');
                        setTimeout(function () { $row.removeClass('detail-txn-recatted'); }, 1200);
                        // Refresh main view
                        render();
                    } else {
                        showMsg(lang.msg_error_save || 'Save failed', 'error');
                    }
                });
            });

            // Click a transaction row to drill into that merchant (but not on the select)
            $win.on('click', '.detail-txn-row', function (e) {
                if ($(e.target).closest('.detail-recat-select').length) return;
                var desc = $(this).data('desc');
                if (!desc) return;
                openMerchantWindow(desc, d.cat);
            });
        }

        // ═══════ MERCHANT DETAIL WINDOW ═════════════════════

        function extractMerchant(desc) {
            // Try to extract merchant name from description
            var m = desc.match(/@ (.+?)(?:\s+0\s|$)/);
            var name = m ? m[1].trim() : desc.replace(/Withdrawal\s*/i, '').replace(/-ACH.*$/i, '').trim();
            name = name.replace(/[#*]\S+/g, '').replace(/\s{2,}/g, ' ').trim();
            var words = name.split(/\s+/).slice(0, 3).join(' ');
            return words.length >= 3 ? words : name;
        }

        function openMerchantWindow(desc, cat) {
            detailZIndex++;
            var merchant = extractMerchant(desc);
            var merchantUpper = merchant.toUpperCase();
            var winId = 'merchant-' + Date.now();

            // Find all transactions matching this merchant
            var allTxns = entries.filter(function (e) {
                if (!e.description) return false;
                var em = extractMerchant(e.description).toUpperCase();
                return em === merchantUpper;
            }).sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });

            if (allTxns.length === 0) return;

            // Build 12-month history for this merchant
            var dp = dashMonth.split('-');
            var endY = parseInt(dp[0]), endM = parseInt(dp[1]);
            // Build 36-month range (superset), 12-month is the tail
            var mMonths36 = [];
            for (var mi36 = 35; mi36 >= 0; mi36--) {
                var dm36 = new Date(endY, endM - 1 - mi36, 1);
                mMonths36.push(dm36.getFullYear() + '-' + ('0' + (dm36.getMonth() + 1)).slice(-2));
            }
            var months12 = mMonths36.slice(-12);

            var monthTotals = normalizeMonthlySpending(allTxns, mMonths36);
            var monthCounts = {};
            allTxns.forEach(function (t) {
                var ym = t.date ? t.date.substring(0, 7) : '';
                if (!ym) return;
                monthCounts[ym] = (monthCounts[ym] || 0) + 1;
            });

            var vals = months12.map(function (ym) { return monthTotals[ym] || 0; });
            var totalAll = allTxns.reduce(function (s, t) { return s + t.amount; }, 0);
            var avgPerTxn = allTxns.length > 0 ? totalAll / allTxns.length : 0;
            var avg12 = 0, avg12n = 0;
            vals.forEach(function (v) { if (v > 0) { avg12 += v; avg12n++; } });
            avg12 = avg12n > 0 ? avg12 / avg12n : 0;
            var maxVal = avg12;
            for (var vi = 0; vi < vals.length; vi++) { if (vals[vi] > maxVal) maxVal = vals[vi]; }
            if (maxVal === 0) maxVal = 1;

            // Build chart
            var svg = buildDetailChart(vals, 0, months12, { color: '#28a745', barClass: 'detail-bar' });

            // Extended chart: 12 current (top) + 24 prior (bottom)
            var mPrior24 = mMonths36.slice(0, 24);
            var mValsPrior24 = mPrior24.map(function (ym) { return monthTotals[ym] || 0; });
            var extTopSvg = buildDetailChart(vals, 0, months12, { color: '#28a745', barClass: 'detail-bar' });
            var extBotSvg = buildDetailChart(mValsPrior24, 0, mPrior24, { color: '#28a745', compact: true, barClass: 'detail-bar' });
            var extSvg = '<div class="ext-chart-section"><div class="ext-chart-label">Current 12 Months</div>' + extTopSvg + '</div>' +
                '<div class="ext-chart-section ext-chart-prior"><div class="ext-chart-label">Prior 24 Months</div>' + extBotSvg + '</div>';

            // Stats
            var max12v = Math.max.apply(null, vals);
            var min12v = Math.min.apply(null, vals.filter(function (v) { return v > 0; }));
            if (!isFinite(min12v)) min12v = 0;
            var firstDate = allTxns.length > 0 ? allTxns[allTxns.length - 1].date : '';
            var lastDate = allTxns.length > 0 ? allTxns[0].date : '';

            var statsHtml = '<div class="detail-stats">';
            statsHtml += '<div class="detail-stat"><span class="detail-stat-label">Total</span><span class="detail-stat-val">' + fmt(totalAll) + '</span></div>';
            statsHtml += '<div class="detail-stat"><span class="detail-stat-label">Avg / txn</span><span class="detail-stat-val">' + fmt(avgPerTxn) + '</span></div>';
            statsHtml += '<div class="detail-stat"><span class="detail-stat-label">Transactions</span><span class="detail-stat-val">' + allTxns.length + '</span></div>';
            statsHtml += '<div class="detail-stat"><span class="detail-stat-label">12-mo avg</span><span class="detail-stat-val">' + fmt(avg12) + '/mo</span></div>';
            statsHtml += '</div>';

            // Transaction list — all time, scrollable (group recat at top)
            var mCatOpts = buildCatOptions();
            var curCat = allTxns.length > 0 ? (allTxns[0].category || 'other_expense') : 'other_expense';
            var txnListHtml = '<div class="detail-txns">';
            txnListHtml += '<div class="detail-txns-header">All Transactions &mdash; ' + allTxns.length + ' total &mdash; ' + esc(firstDate) + ' to ' + esc(lastDate) + '</div>';
            txnListHtml += '<div class="merchant-recat-bar">';
            txnListHtml += '<label>Category for all ' + allTxns.length + ' transactions:</label>';
            txnListHtml += '<select class="merchant-recat-select">' + mCatOpts + '</select>';
            txnListHtml += '<button class="merchant-recat-apply button">Apply to All</button>';
            txnListHtml += '</div>';
            txnListHtml += '<div class="detail-txns-scroll"><table>';
            txnListHtml += '<thead><tr><th style="width:90px;">Date</th><th>Description</th><th style="width:80px;">Amount</th></tr></thead>';
            allTxns.forEach(function (t) {
                txnListHtml += '<tr class="detail-txn-row" data-id="' + esc(t.id) + '">';
                txnListHtml += '<td>' + esc(t.date) + '</td><td class="detail-txn-desc">' + entryAccountBadge(t) + esc(t.description) + '</td><td class="detail-txn-amt">' + fmt(t.amount) + '</td>';
                txnListHtml += '</tr>';
            });
            txnListHtml += '</table></div></div>';

            // Build window with left/right panels
            var html = '<div class="budget-detail-win merchant-detail-win" id="' + winId + '" style="z-index:' + detailZIndex + '">';
            html += '<div class="detail-win-titlebar">';
            html += '<span class="detail-win-title">' + esc(merchant) + ' &mdash; ' + esc(catLabel(cat)) + '</span>';
            html += '<div class="detail-win-btns">';
            html += '<button class="detail-win-print" title="Print">&#128438;</button>';
            html += '<button class="detail-win-maximize" title="Maximize">&#9744;</button>';
            html += '<button class="detail-win-close" title="Close">&times;</button>';
            html += '</div></div>';
            html += '<div class="detail-win-body">';
            html += '<div class="detail-win-left">';
            html += statsHtml;
            html += '<div class="detail-chart-wrap detail-chart-normal">' + svg + '</div>';
            html += '<div class="detail-chart-wrap detail-chart-extended" style="display:none;">' + extSvg + '</div>';
            html += '</div>';
            html += '<div class="detail-win-right">';
            html += txnListHtml;
            html += '</div>';
            html += '</div></div>';

            var $mwin = $(html).appendTo('body');
            var mPageColors = getPageColors();
            $mwin[0].style.setProperty('background-color', mPageColors.bg, 'important');
            $mwin[0].style.setProperty('color', mPageColors.fg, 'important');

            // On mobile, lock body scroll
            var mIsMobile = window.innerWidth <= 768;
            if (mIsMobile) { document.body.style.overflow = 'hidden'; }

            // Position offset from parent (desktop only)
            if (!mIsMobile) {
                var openCount = $('.budget-detail-win').length;
                var vpW = $(window).width(), vpH = $(window).height();
                var mW = 480, mH = 450;
                var mLeft = Math.max(10, (vpW - mW) / 2 + (openCount - 1) * 30);
                var mTop = Math.max(10, (vpH - mH) / 3 + (openCount - 1) * 30);
                $mwin.css({ top: mTop, left: mLeft, width: mW, height: mH });
            }

            // Window management — reuse same patterns
            var mState = { snapped: false, restore: null };

            function mSaveRestore() {
                if (!mState.restore) { var r = $mwin[0].getBoundingClientRect(); mState.restore = { top: r.top, left: r.left, width: r.width, height: r.height }; }
            }
            function mRestore() {
                $mwin.removeClass('detail-win-snapped-left detail-win-snapped-right detail-win-maximized');
                if (mState.restore) $mwin.css({ top: mState.restore.top, left: mState.restore.left, width: mState.restore.width, height: mState.restore.height });
                mState.snapped = false; mState.restore = null;
                $mwin.find('.detail-chart-extended').hide();
                $mwin.find('.detail-chart-normal').show();
            }

            $mwin.find('.detail-win-close').on('click', function (e) { e.stopPropagation(); $mwin.remove(); if (mIsMobile && !$('.budget-detail-win').length) { document.body.style.overflow = ''; } }).on('mousedown', function (e) { e.stopPropagation(); });
            $mwin.find('.detail-win-maximize').on('click', function (e) {
                e.stopPropagation();
                if (mState.snapped === 'max') { mRestore(); }
                else {
                    mSaveRestore();
                    $mwin.removeClass('detail-win-snapped-left detail-win-snapped-right').addClass('detail-win-maximized');
                    $mwin.css({ top: 0, left: 0, width: '100vw', height: '100vh' });
                    mState.snapped = 'max';
                    $mwin.find('.detail-chart-normal').hide();
                    $mwin.find('.detail-chart-extended').show();
                }
            }).on('mousedown', function (e) { e.stopPropagation(); });
            $mwin.on('mousedown', function () { detailZIndex++; $(this).css('z-index', detailZIndex); });

            $mwin.find('.detail-win-titlebar').on('dblclick', function (e) {
                if ($(e.target).closest('.detail-win-btns').length) return;
                e.preventDefault();
                if (mState.snapped) { mRestore(); return; }
                var otherLeft = false;
                $('.budget-detail-win').not($mwin).each(function () { if ($(this).hasClass('detail-win-snapped-left')) otherLeft = true; });
                mSaveRestore();
                if (otherLeft) { $mwin.removeClass('detail-win-snapped-left detail-win-maximized').addClass('detail-win-snapped-right'); $mwin.css({ top: 0, left: '50vw', width: '50vw', height: '100vh' }); mState.snapped = 'right'; }
                else { $mwin.removeClass('detail-win-snapped-right detail-win-maximized').addClass('detail-win-snapped-left'); $mwin.css({ top: 0, left: 0, width: '50vw', height: '100vh' }); mState.snapped = 'left'; }
            });

            $mwin.find('.detail-win-titlebar').on('mousedown', function (e) {
                if ($(e.target).closest('.detail-win-btns').length) return;
                e.preventDefault();
                var rect = $mwin[0].getBoundingClientRect();
                var ox = e.clientX - rect.left, oy = e.clientY - rect.top, dragged = false;
                function onMove(ev) {
                    if (!dragged && mState.snapped) {
                        var rw = mState.restore ? mState.restore.width : 480, rh = mState.restore ? mState.restore.height : 450;
                        $mwin.removeClass('detail-win-snapped-left detail-win-snapped-right detail-win-maximized').css({ width: rw, height: rh });
                        ox = rw / 2; oy = 15; mState.snapped = false; mState.restore = null; dragged = true;
                    }
                    dragged = true;
                    $mwin.css({ left: ev.clientX - ox, top: ev.clientY - oy });
                }
                function onUp() { $(document).off('mousemove', onMove).off('mouseup', onUp); }
                $(document).on('mousemove', onMove).on('mouseup', onUp);
            });

            // ── Bar click → filter transactions to that month ──
            var mCurrentFilter = null; // null = show all
            function renderMerchantTxns(filterYm) {
                mCurrentFilter = filterYm;
                var txns = filterYm
                    ? allTxns.filter(function (t) { return t.date && t.date.substring(0, 7) === filterYm; })
                    : allTxns;
                var header = '';
                if (filterYm) {
                    var fp = filterYm.split('-');
                    var monthName = new Date(parseInt(fp[0]), parseInt(fp[1]) - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' });
                    header = '<div class="detail-txns-header">' + esc(monthName) + ' &mdash; ' + txns.length + ' transaction' + (txns.length !== 1 ? 's' : '') + ' &mdash; ' + fmt(txns.reduce(function (s, t) { return s + t.amount; }, 0));
                    header += ' <a href="#" class="merchant-show-all">(show all)</a></div>';
                } else {
                    header = '<div class="detail-txns-header">All Transactions &mdash; ' + txns.length + ' total &mdash; ' + esc(firstDate) + ' to ' + esc(lastDate) + '</div>';
                }
                var rows = '';
                if (txns.length === 0) {
                    rows = '<tr><td colspan="3" style="text-align:center;opacity:0.5;padding:1em;">No transactions this month</td></tr>';
                } else {
                    txns.forEach(function (t) {
                        rows += '<tr class="detail-txn-row" data-id="' + esc(t.id) + '">';
                        rows += '<td>' + esc(t.date) + '</td><td class="detail-txn-desc">' + entryAccountBadge(t) + esc(t.description) + '</td><td class="detail-txn-amt">' + fmt(t.amount) + '</td>';
                        rows += '</tr>';
                    });
                }
                $mwin.find('.detail-txns-header').replaceWith(header);
                $mwin.find('.detail-txns-scroll table').html(rows);

                // Update bar highlights
                $mwin.find('.detail-bar').attr('opacity', filterYm ? '0.45' : '0.75');
                if (filterYm) {
                    $mwin.find('.detail-bar[data-month="' + filterYm + '"]').attr('opacity', '1');
                }
            }

            $mwin.on('click', '.detail-bar', function () {
                var ym = $(this).data('month');
                if (mCurrentFilter === ym) {
                    renderMerchantTxns(null); // toggle back to all
                } else {
                    renderMerchantTxns(ym);
                }
            });

            $mwin.on('click', '.merchant-show-all', function (e) {
                e.preventDefault();
                renderMerchantTxns(null);
            });

            // Set initial category on group selector
            $mwin.find('.merchant-recat-select').val(curCat);

            // Apply to All — re-categorise every transaction for this merchant
            $mwin.on('click', '.merchant-recat-apply', function () {
                var newCat = $mwin.find('.merchant-recat-select').val();
                if (!newCat) return;

                var updates = [];
                allTxns.forEach(function (t) {
                    if (t.category !== newCat) {
                        updates.push({ id: t.id, category: newCat });
                        // Update in-memory
                        for (var ei = 0; ei < entries.length; ei++) {
                            if (entries[ei].id === t.id) { entries[ei].category = newCat; break; }
                        }
                    }
                });

                if (updates.length === 0) {
                    showMsg(lang.cat_already_in || 'All transactions already in this category.', 'error');
                    return;
                }

                ajax('recategorise', { updates: JSON.stringify(updates) }, function (r) {
                    if (r.success) {
                        // Flash all rows
                        $mwin.find('.detail-txn-row').addClass('detail-txn-recatted');
                        setTimeout(function () { $mwin.find('.detail-txn-row').removeClass('detail-txn-recatted'); }, 1200);
                        // Update title bar category label
                        $mwin.find('.detail-win-title').html(esc(merchant) + ' &mdash; ' + esc(catLabel(newCat)));
                        showMsg((lang.moved_to || '%d transaction(s) moved to %s.').replace('%d', updates.length).replace('%s', catLabel(newCat)));
                        render();
                    } else {
                        showMsg(lang.msg_error_save || 'Save failed', 'error');
                    }
                });
            });
        }

        // ── Render entries + summary ────────────────────────

        function render() {
            var visible = filteredEntries();
            var $tbody = $root.find('.budget-tbody'),
                $noEnt = $root.find('.budget-no-entries'),
                $noRes = $root.find('.budget-no-results'),
                $count = $root.find('.budget-showing-count');

            $tbody.empty();
            $noEnt.hide(); $noRes.hide();

            if (entries.length === 0) {
                $noEnt.show();
            } else if (visible.length === 0) {
                $noRes.show();
            } else {
                visible.forEach(function (e) {
                    var rc = 'entry-' + esc(e.type), badge = 'badge-' + esc(e.type);
                    var tl = e.cc_type ? esc(e.cc_type) : (e.type === 'income' ? esc(lang.lbl_income || 'Income') : esc(lang.lbl_expense || 'Expense'));
                    var pfx = e.type === 'income' ? '+' : '-';
                    var h = '<tr class="' + rc + '" data-id="' + esc(e.id) + '">';
                    if (massEditMode) h += '<td class="col-cb"><input type="checkbox" class="mass-cb" /></td>';
                    h += '<td>' + esc(e.date || '') + '</td>';
                    h += '<td><span class="budget-type-badge ' + badge + '">' + tl + '</span></td>';
                    h += '<td>' + esc(catLabel(e.category)) + '</td>';
                    // Description cell with optional card badge
                    h += '<td class="col-desc" title="' + esc(e.description) + '" data-desc="' + esc(e.description) + '" data-cat="' + esc(e.category) + '">' + entryAccountBadge(e) + esc(e.description) + '</td>';
                    h += '<td class="col-amount">' + pfx + fmt(e.amount) + '</td>';
                    if (canEdit) {
                        h += '<td class="budget-actions">';
                        h += '<button class="budget-btn-edit" title="' + esc(lang.btn_edit || 'Edit') + '">&#9998;</button>';
                        h += '<button class="budget-btn-del" title="' + esc(lang.btn_delete || 'Delete') + '">&#10005;</button>';
                        h += '</td>';
                    }
                    h += '</tr>';
                    $tbody.append(h);
                });
            }

            // Count display — always shows raw total so user can diagnose filter issues
            var ccTagged  = entries.filter(function(e){ return !!e.card_id; }).length;
            var baTagged  = entries.filter(function(e){ return !!e.account_id; }).length;
            var untagged  = entries.length - ccTagged - baTagged;
            var isFiltered = visible.length < entries.length;
            var countText = (lang.showing_count || 'Showing %d of %d transactions')
                .replace('%d', visible.length).replace('%d', entries.length);
            if (entries.length > 0 && isFiltered) {
                countText += ' \u2014 ';
                var parts = [];
                if (ccTagged)  parts.push(ccTagged + ' CC');
                if (baTagged)  parts.push(baTagged + ' bank');
                if (untagged)  parts.push(untagged + ' untagged');
                if (parts.length) countText += parts.join(', ') + ' in total';
            }
            $count.text(countText);
            // Show a "Show all" link when any filter is active so user can always get back
            $root.find('.budget-show-all-link').remove();
            if (isFiltered) {
                var $link = $('<a href="#" class="budget-show-all-link" style="margin-left:0.7em;font-size:0.85em;opacity:0.7;">Show all</a>');
                $link.on('click', function(ev) {
                    ev.preventDefault();
                    clearSearchFilters();
                    tlSelectedMonth = null; tlSelectedDay = null;
                    render();
                });
                $count.after($link);
            }

            // Summary (filtered) — use CC-specific labels/calc when a CC account is filtered
            var ti = 0, te = 0;
            visible.forEach(function (e) { if (e.type === 'income') ti += e.amount; else te += e.amount; });
            var bal = ti - te;

            // Check if the active filter is a credit card account
            var isCcFilter = cardFilter && creditCards.some(function(cc) { return cc.id === cardFilter; });

            if (isCcFilter) {
                // CC context: charges (expense) / payments (income) / balance owed (charges - payments)
                var charged  = te;   // expense-type entries = purchases/interest/fees
                var payments = ti;   // income-type entries  = payments/credits/refunds
                var owed     = Math.max(0, charged - payments);
                $root.find('.budget-card-income .budget-card-label').text(lang.summary_cc_payments || 'Payments');
                $root.find('.budget-card-expense .budget-card-label').text(lang.summary_cc_charges  || 'Charges');
                $root.find('.budget-card-balance .budget-card-label').text(lang.summary_cc_balance  || 'Balance Owed');
                $root.find('[data-field="total-income"]').text('+' + fmt(payments));
                $root.find('[data-field="total-expense"]').text(fmt(charged));
                $root.find('[data-field="total-balance"]').text(fmt(owed))
                    .removeClass('positive negative').addClass(owed <= 0 ? 'positive' : 'negative');
            } else {
                // Standard context: restore generic labels in case they were swapped
                $root.find('.budget-card-income .budget-card-label').text(lang.summary_total_income    || 'Total Income');
                $root.find('.budget-card-expense .budget-card-label').text(lang.summary_total_expenses || 'Total Expenses');
                $root.find('.budget-card-balance .budget-card-label').text(lang.summary_balance        || 'Balance');
                $root.find('[data-field="total-income"]').text('+' + fmt(ti));
                $root.find('[data-field="total-expense"]').text('-' + fmt(te));
                $root.find('[data-field="total-balance"]').text(fmt(bal))
                    .removeClass('positive negative').addClass(bal >= 0 ? 'positive' : 'negative');
            }

            renderDashboard();
            updateSearchResults();
        }

        // ── Sort headers ────────────────────────────────────

        $root.on('click', '.sortable', function (e) {

            var col = $(this).data('sort');
            if (sortCol === col) { sortAsc = !sortAsc; } else { sortCol = col; sortAsc = true; }
            // Update sort icons
            $root.find('.sortable .sort-icon').text('');
            $(this).find('.sort-icon').text(sortAsc ? '\u25B2' : '\u25BC');
            render();
        });

        // ── Search ──────────────────────────────────────────

        // Prevent DokuWiki form submission when pressing Enter inside plugin inputs
        $root.on('keydown', 'input, select', function (e) {
            if (e.key === 'Enter' || e.keyCode === 13) {
                e.preventDefault();
                e.stopPropagation();
                // If it's the search box, trigger search immediately
                if ($(this).hasClass('budget-search')) {
                    clearTimeout(searchTimer);
                    searchQuery = $(this).val();
                    render();
                }
                return false;
            }
        });

        var searchTimer;
        $root.on('input', '.budget-search', function () {
            var val = $(this).val();
            clearTimeout(searchTimer);
            searchTimer = setTimeout(function () {
                searchQuery = val;
                // Auto-switch to "All" when typing a search to avoid confusion
                if (val && currentFilter === 'month') {
                    currentFilter = 'all';
                    $root.find('.budget-filter-period').val('all');
                }
                render();
            }, 200);
        });

        // Type filter
        $root.on('change', '.search-type-filter', function () {
            searchTypeFilter = $(this).val();
            tlSelectedMonth = null;
            tlSelectedDay = null;
            render();
        });

        // Category filter
        $root.on('change', '.search-cat-filter', function () {
            searchCatFilter = $(this).val();
            tlSelectedMonth = null;
            tlSelectedDay = null;
            render();
        });

        // Amount range
        $root.on('input', '.search-min-amt', function () {
            var v = parseFloat($(this).val());
            searchMinAmt = isNaN(v) ? null : v;
            clearTimeout(searchTimer);
            searchTimer = setTimeout(function () { render(); }, 300);
        });
        $root.on('input', '.search-max-amt', function () {
            var v = parseFloat($(this).val());
            searchMaxAmt = isNaN(v) ? null : v;
            clearTimeout(searchTimer);
            searchTimer = setTimeout(function () { render(); }, 300);
        });

        // Clear all filters
        $root.on('click', '.search-clear', function () {
            clearSearchFilters();
            tlSelectedMonth = null;
            tlSelectedDay = null;
            render();
        });

        // Timeline bar click — zoom into month
        // Helper: clear all search/filter UI and state
        function clearSearchFilters() {
            searchQuery = '';
            searchTypeFilter = '';
            searchCatFilter = '';
            searchMinAmt = null;
            searchMaxAmt = null;
            currentFilter = 'all';
            cardFilter = '';
            $root.find('.budget-search').val('');
            $root.find('.search-type-filter').val('');
            $root.find('.search-cat-filter').val('');
            $root.find('.search-card-filter').val('');
            $root.find('.search-min-amt').val('');
            $root.find('.search-max-amt').val('');
            $root.find('.budget-filter-period').val('all');
            $root.find('.budget-filter-custom').hide();
            renderCcStrip(); // deselect any highlighted card chip
        }

        $root.on('click', '.tl-bar', function () {
            var ym = $(this).attr('data-month');
            if (tlSelectedMonth === ym) {
                tlSelectedMonth = null;
            } else {
                tlSelectedMonth = ym;
            }
            tlSelectedDay = null;
            render();
        });

        // Timeline day bar click — zoom into day detail
        $root.on('click', '.tl-day-bar', function () {
            var day = $(this).attr('data-day');
            if (tlSelectedDay === day) {
                tlSelectedDay = null;
            } else {
                tlSelectedDay = day;
                // Ensure month is set for back-navigation
                if (!tlSelectedMonth) tlSelectedMonth = day.substring(0, 7);
            }
            render();
        });

        // Timeline zoom-out link (back to overview)
        $root.on('click', '.tl-zoom-out', function (e) {
            e.preventDefault();
            tlSelectedMonth = null;
            tlSelectedDay = null;
            render();
        });

        // Timeline zoom-up link (back one level)
        $root.on('click', '.tl-zoom-up', function (e) {
            e.preventDefault();
            // Always go back to the overview
            tlSelectedDay = null;
            tlSelectedMonth = null;
            render();
        });

        // Day detail — click a transaction to open its merchant window
        $root.on('click', '.tl-day-txn', function () {
            var desc = $(this).data('desc');
            var cat = $(this).data('cat');
            if (desc) openMerchantWindow(desc, cat);
        });

        // ═══════ MASS EDIT ════════════════════════════════════

        var massEditMode = false;

        $root.on('click', '.mass-edit-toggle', function () {
            massEditMode = !massEditMode;
            $(this).toggleClass('mass-edit-active', massEditMode);
            $root.find('.mass-edit-bar').toggle(massEditMode);
            $root.find('.budget-table').toggleClass('mass-edit-on', massEditMode);
            $root.find('.col-cb-header').toggle(massEditMode);
            if (!massEditMode) {
                $root.find('.mass-cb').prop('checked', false);
                $root.find('.mass-select-all, .mass-select-all-head').prop('checked', false);
                updateMassCount();
            }
            render();
        });

        // Select all — sync both checkboxes
        $root.on('change', '.mass-select-all, .mass-select-all-head', function () {
            var checked = $(this).is(':checked');
            $root.find('.mass-select-all, .mass-select-all-head').prop('checked', checked);
            $root.find('.budget-tbody .mass-cb').prop('checked', checked);
            updateMassCount();
        });

        // Individual checkbox
        $root.on('change', '.budget-tbody .mass-cb', function () {
            updateMassCount();
        });

        function getSelectedIds() {
            var ids = [];
            $root.find('.budget-tbody .mass-cb:checked').each(function () {
                ids.push($(this).closest('tr').data('id'));
            });
            return ids;
        }

        function updateMassCount() {
            var ids = getSelectedIds();
            $root.find('.mass-count').text((lang.mass_selected || '%d selected').replace('%d', ids.length));
            $root.find('.mass-action-btns button').prop('disabled', ids.length === 0);
        }

        // Mass delete
        $root.on('click', '.mass-delete', function () {
            var ids = getSelectedIds();
            if (ids.length === 0) return;
            if (!confirm((lang.mass_delete_confirm || 'Delete %d transaction(s)? This cannot be undone.').replace('%d', ids.length))) return;
            var remaining = ids.length;
            ids.forEach(function (id) {
                ajax('delete', { entry_id: id }, function (r) {
                    remaining--;
                    if (r.success) entries = entries.filter(function (e) { return e.id !== id; });
                    if (remaining === 0) {
                        showMsg((lang.mass_deleted || '%d deleted').replace('%d', ids.length));
                        render();
                    }
                });
            });
        });

        // Mass re-categorize
        $root.on('click', '.mass-recat-apply', function () {
            var ids = getSelectedIds();
            var newCat = $root.find('.mass-recat-select').val();
            if (ids.length === 0 || !newCat) return;
            var remaining = ids.length;
            ids.forEach(function (id) {
                var entry = entries.find(function (e) { return e.id === id; });
                if (!entry) { remaining--; return; }
                ajax('update', {
                    entry_id: id,
                    type: entry.type,
                    description: entry.description,
                    amount: entry.amount,
                    category: newCat,
                    date: entry.date
                }, function (r) {
                    remaining--;
                    if (r.success) {
                        var idx = entries.findIndex(function (e) { return e.id === id; });
                        if (idx !== -1) entries[idx].category = newCat;
                    }
                    if (remaining === 0) {
                        showMsg((lang.mass_recategorized || '%d re-categorized').replace('%d', ids.length));
                        render();
                    }
                });
            });
        });

        // Mass change type
        $root.on('click', '.mass-type-apply', function () {
            var ids = getSelectedIds();
            var newType = $root.find('.mass-type-select').val();
            if (ids.length === 0 || !newType) return;
            var remaining = ids.length;
            ids.forEach(function (id) {
                var entry = entries.find(function (e) { return e.id === id; });
                if (!entry) { remaining--; return; }
                ajax('update', {
                    entry_id: id,
                    type: newType,
                    description: entry.description,
                    amount: entry.amount,
                    category: entry.category,
                    date: entry.date
                }, function (r) {
                    remaining--;
                    if (r.success) {
                        var idx = entries.findIndex(function (e) { return e.id === id; });
                        if (idx !== -1) entries[idx].type = newType;
                    }
                    if (remaining === 0) {
                        showMsg((lang.mass_updated || '%d updated').replace('%d', ids.length));
                        render();
                    }
                });
            });
        });

        // ── Load ────────────────────────────────────────────

        var incomeTags = [];

        function loadAll() {
            ajax('load', {}, function (resp) {
                if (resp.success && resp.data) {
                    entries = resp.data.entries || [];
                    budgetCats = resp.data.budgets || [];
                    rules = resp.data.rules || [];
                    customCats = resp.data.custom_cats || [];
                    incomeTags = resp.data.income_tags || [];
                    creditCards = resp.data.credit_cards || [];
                    bankAccounts = resp.data.bank_accounts || [];
                    cardFilter = ''; // Always reset account filter on full reload so all transactions show
                } else {
                    entries = []; budgetCats = []; rules = []; customCats = []; incomeTags = []; creditCards = []; bankAccounts = [];
                    cardFilter = '';
                }
                try { rebuildCatSelects(); } catch(e) { console.error('rebuildCatSelects:', e); }
                try { populateMonthSelect(); } catch(e) { console.error('populateMonthSelect:', e); }
                try { render(); } catch(e) { console.error('render:', e); }
                try { renderBudgetManager(); } catch(e) { console.error('renderBudgetManager:', e); }
                try { renderRulesManager(); } catch(e) { console.error('renderRulesManager:', e); }
                try { renderCustomCatsManager(); } catch(e) { console.error('renderCustomCatsManager:', e); }
                try { renderIncomeManager(); } catch(e) { console.error('renderIncomeManager:', e); }
                try { renderCreditCardSelectors(); } catch(e) { console.error('renderCreditCardSelectors:', e); }
                try { renderBankAccountsSection(); } catch(e) { console.error('renderBankAccountsSection:', e); }
                try { renderCcStrip(); } catch(e) { console.error('renderCcStrip:', e); }
                // Sync period dropdown to currentFilter (default: 12months)
                $root.find('.budget-filter-period').val(currentFilter);
                if (entries.length === 0 && canEdit) {
                    checkForRecoverableBudgets();
                }
            });
        }

        // ── Budget recovery ─────────────────────────────────

        function checkForRecoverableBudgets() {
            ajax('list_budgets', {}, function (resp) {
                if (!resp.success || !resp.budgets || resp.budgets.length === 0) return;
                // Filter out the current budget and empty ones
                var others = resp.budgets.filter(function (b) {
                    return b.budgetId !== budgetId && b.entries > 0;
                });
                if (others.length === 0) return;
                showRecoveryBanner(others);
            });
        }

        function showRecoveryBanner(budgets) {
            $root.find('.budget-recovery').remove();
            var h = '<div class="budget-recovery">';
            h += '<div class="budget-recovery-header">';
            h += '<strong>' + esc(lang.recovery_title || 'Previous budget data found') + '</strong>';
            h += '<p>' + esc(lang.recovery_help || 'It looks like you renamed this budget. Your data still exists under the old name. Select one to restore:') + '</p>';
            h += '</div>';
            h += '<div class="budget-recovery-list">';
            budgets.forEach(function (b) {
                h += '<div class="budget-recovery-item">';
                h += '<span class="recovery-name">' + esc(b.name) + '</span>';
                h += '<span class="recovery-info">' + b.entries + ' transactions</span>';
                h += '<button class="budget-recovery-restore button" data-old-id="' + esc(b.budgetId) + '">';
                h += esc(lang.recovery_restore || 'Restore') + '</button>';
                h += '</div>';
            });
            h += '</div></div>';
            $root.find('.budget-title').after(h);
        }

        $root.on('click', '.budget-recovery-restore', function () {
            var oldId = $(this).data('old-id');
            ajax('rename_budget', { old_id: oldId, new_id: budgetId }, function (r) {
                if (r.success) {
                    $root.find('.budget-recovery').remove();
                    showMsg(lang.recovery_done || 'Budget data restored!');
                    loadAll();
                } else {
                    showMsg((r.error || 'Restore failed'), 'error');
                }
            });
        });

        // ── Type toggle ─────────────────────────────────────

        $(document).on('change', '.budget-input-type', function () {
            var v = $(this).val(), $c = $(this).closest('.budget-form').find('.budget-input-category');
            if (v === 'income') { $c.find('.budget-cat-income').show(); $c.find('.budget-cat-expense').hide(); $c.val($c.find('.budget-cat-income option:first').val()); }
            else { $c.find('.budget-cat-income').hide(); $c.find('.budget-cat-expense').show(); $c.val($c.find('.budget-cat-expense option:first').val()); }
        });
        // Trigger initial state
        $root.find('.budget-input-type').trigger('change');
        $root.find('.budget-input-date').val(new Date().toISOString().slice(0, 10));

        // ── Add entry ───────────────────────────────────────

        $(document).on('click', '.budget-btn-add', function () {
            var $form = $(this).closest('.budget-form');
            var desc = $.trim($form.find('.budget-input-desc').val()),
                amount = parseFloat($form.find('.budget-input-amount').val()),
                type = $form.find('.budget-input-type').val(),
                cat = $form.find('.budget-input-category').val(),
                date = $form.find('.budget-input-date').val();
            if (!desc) { showMsg(lang.msg_error_desc || 'Enter a description', 'error'); return; }
            if (isNaN(amount) || amount <= 0) { showMsg(lang.msg_error_amount || 'Enter a valid amount', 'error'); return; }
            var acctVal = $form.find('.budget-input-card').val() || '';
            var acctDec = decodeAccountVal(acctVal);
            var saveParams = { type: type, description: desc, amount: amount, category: cat, date: date };
            if (acctDec) saveParams[acctDec.field] = acctDec.id;
            ajax('save', saveParams, function (r) {
                if (r.success) {
                    entries.push(r.entry); populateMonthSelect(); render();
                    showMsg(lang.msg_saved || 'Saved');
                    $form.find('.budget-input-desc').val('');
                    $form.find('.budget-input-amount').val('');
                } else showMsg(lang.msg_error_save || 'Save failed', 'error');
            });
        });

        // ── Click description in table → show popover with full text + copy + merchant link ──

        var $descPopover = null;

        function closeDescPopover() {
            if ($descPopover) { $descPopover.remove(); $descPopover = null; }
        }

        // Close popover when clicking outside
        $(document).on('mousedown', function (e) {
            if ($descPopover && !$(e.target).closest('.desc-popover').length && !$(e.target).closest('.col-desc').length) {
                closeDescPopover();
            }
        });

        $root.on('click', '.col-desc', function (e) {
            // If user is selecting text, don't interfere
            if (window.getSelection().toString().length > 0) return;

            var $cell = $(this);
            var desc = $cell.data('desc');
            var cat = $cell.data('cat');
            if (!desc) return;

            // Close any existing popover
            closeDescPopover();

            // Build popover
            var pageColors = getPageColors();
            var popHtml = '<div class="desc-popover">';
            popHtml += '<div class="desc-pop-text" title="' + esc(lang.click_to_copy || 'Click to copy') + '">' + esc(desc) + '</div>';
            popHtml += '<div class="desc-pop-actions">';
            popHtml += '<button class="desc-pop-copy button" title="' + esc(lang.click_to_copy || 'Click to copy') + '">&#128203; ' + esc(lang.click_to_copy || 'Copy') + '</button>';
            popHtml += '<button class="desc-pop-merchant button" title="' + esc(lang.desc_open_merchant || 'Open merchant details') + '">&#128269; ' + esc(lang.desc_open_merchant || 'Merchant') + '</button>';
            popHtml += '</div></div>';

            $descPopover = $(popHtml).appendTo('body');
            $descPopover.css({ 'background-color': pageColors.bg, 'color': pageColors.fg });

            // Position below the cell
            var cellRect = $cell[0].getBoundingClientRect();
            var popW = Math.min(380, window.innerWidth - 20);
            var left = cellRect.left;
            if (left + popW > window.innerWidth - 10) left = window.innerWidth - popW - 10;
            if (left < 5) left = 5;
            $descPopover.css({
                top: cellRect.bottom + window.scrollY + 4,
                left: left,
                width: popW
            });

            // Select text in popover for easy copy
            $descPopover.find('.desc-pop-text').on('click', function () {
                var range = document.createRange();
                range.selectNodeContents(this);
                var sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(range);
            });

            // Copy button
            $descPopover.find('.desc-pop-copy').on('click', function () {
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(desc).then(function () {
                        showMsg(lang.copied || 'Copied!');
                        closeDescPopover();
                    });
                } else {
                    // Fallback: select the text
                    var range = document.createRange();
                    range.selectNodeContents($descPopover.find('.desc-pop-text')[0]);
                    var sel = window.getSelection();
                    sel.removeAllRanges();
                    sel.addRange(range);
                    try { document.execCommand('copy'); showMsg(lang.copied || 'Copied!'); }
                    catch (ex) { /* user can manually copy */ }
                }
            });

            // Merchant button
            $descPopover.find('.desc-pop-merchant').on('click', function () {
                closeDescPopover();
                openMerchantWindow(desc, cat);
            });
        });

        // ── Auto-fit column widths ───────────────────────────────
        // All columns are sized to their minimum content width.
        // The description column fills all remaining space.
        // Runs after every render() via MutationObserver on tbody.

        (function () {
            function fitColumns() {
                var tbl = $root.find('.budget-table')[0];
                if (!tbl) return;
                var ths = tbl.querySelectorAll('thead th');
                if (!ths.length) return;

                // Temporarily switch to auto layout so the browser computes natural widths
                tbl.style.width = 'auto';
                tbl.style.tableLayout = 'auto';
                for (var i = 0; i < ths.length; i++) ths[i].style.width = '';

                // Force layout, then snapshot each column's natural width
                var colWidths = [];
                for (var i = 0; i < ths.length; i++) {
                    colWidths.push(ths[i].offsetWidth);
                }

                // Switch back to fixed layout, table fills container
                tbl.style.tableLayout = 'fixed';
                tbl.style.width = '100%';

                // Apply snapshotted widths to all columns except description,
                // which gets no width and stretches to fill remaining space
                for (var i = 0; i < ths.length; i++) {
                    if (ths[i].classList.contains('col-desc-header')) {
                        ths[i].style.width = '';
                    } else {
                        ths[i].style.width = colWidths[i] + 'px';
                    }
                }
            }

            var tbody = $root.find('.budget-tbody')[0];
            if (tbody) {
                new MutationObserver(fitColumns).observe(tbody, { childList: true });
            }
        })();

        // ── Middle-mouse-button panning for table scroll container ──

        (function () {
            var scrollEl = $root.find('.budget-table-scroll')[0];
            if (!scrollEl) return;
            var panning = false, panStartX = 0, panStartY = 0, scrollStartX = 0, scrollStartY = 0;

            scrollEl.addEventListener('mousedown', function (e) {
                if (e.button !== 1) return; // middle button only
                e.preventDefault();
                panning = true;
                panStartX = e.clientX;
                panStartY = e.clientY;
                scrollStartX = scrollEl.scrollLeft;
                scrollStartY = scrollEl.scrollTop;
                scrollEl.style.cursor = 'grabbing';
                document.addEventListener('mousemove', onPanMove);
                document.addEventListener('mouseup', onPanUp);
            });

            function onPanMove(e) {
                if (!panning) return;
                scrollEl.scrollLeft = scrollStartX - (e.clientX - panStartX);
                scrollEl.scrollTop = scrollStartY - (e.clientY - panStartY);
            }

            function onPanUp(e) {
                if (e.button !== 1) return;
                panning = false;
                scrollEl.style.cursor = '';
                document.removeEventListener('mousemove', onPanMove);
                document.removeEventListener('mouseup', onPanUp);
            }
        })();

        // ── Set sticky header background ──────────────────────

        (function () {
            var colors = getPageColors();
            $root.find('.budget-table th').css('background-color', colors.bg);
        })();

        // ── Delete entry ────────────────────────────────────

        $root.on('click', '.budget-btn-del', function () {
            var id = $(this).closest('tr').data('id');
            if (!confirm(lang.msg_confirm_delete || 'Delete this entry?')) return;
            ajax('delete', { entry_id: id }, function (r) {
                if (r.success) { entries = entries.filter(function (e) { return e.id !== id; }); render(); showMsg(lang.msg_deleted || 'Deleted'); }
                else showMsg(lang.msg_error_delete || 'Delete failed', 'error');
            });
        });

        // ── Edit entry ──────────────────────────────────────

        function doSaveEdit($tr, id) {
            var acctVal = $tr.find('.edit-account').val() || '';
            var acctDec = decodeAccountVal(acctVal);
            var $editType = $tr.find('.edit-type');
            var editCcType = $editType.find('option:selected').data('cc-type') || '';
            var nd = {
                entry_id: id, type: $editType.val(), cc_type: editCcType,
                description: $.trim($tr.find('.edit-desc').val()),
                amount: parseFloat($tr.find('.edit-amount').val()),
                category: $.trim($tr.find('.edit-cat').val()),
                date: $tr.find('.edit-date').val(),
                card_id: '', account_id: ''   // clear both; will be set below
            };
            if (acctDec) { nd[acctDec.field] = acctDec.id; }
            if (!nd.description || isNaN(nd.amount) || nd.amount <= 0) { showMsg(lang.invalid_data || 'Invalid data', 'error'); return; }
            ajax('update', nd, function (r) {
                if (r.success) {
                    for (var j = 0; j < entries.length; j++) {
                        if (entries[j].id === id) {
                            entries[j].type = nd.type; entries[j].description = nd.description;
                            entries[j].amount = nd.amount; entries[j].category = nd.category; entries[j].date = nd.date;
                            if (nd.cc_type) entries[j].cc_type = nd.cc_type; else delete entries[j].cc_type;
                            if (acctDec) { delete entries[j].card_id; delete entries[j].account_id; entries[j][acctDec.field] = acctDec.id; }
                            else { delete entries[j].card_id; delete entries[j].account_id; }
                            break;
                        }
                    }
                    render(); showMsg(lang.msg_saved || 'Saved');
                } else showMsg(lang.msg_error_save || 'Save failed', 'error');
            });
        }

        $root.on('click', '.budget-btn-edit', function () {
            var $tr = $(this).closest('tr'), id = $tr.data('id');
            var entry = null;
            for (var i = 0; i < entries.length; i++) { if (entries[i].id === id) { entry = entries[i]; break; } }
            if (!entry || $tr.hasClass('budget-edit-row')) return;
            $tr.addClass('budget-edit-row');
            var orig = $tr.html();
            // Determine current account value for the selector
            var curAcctVal = '';
            if (entry.card_id) curAcctVal = 'cc:' + entry.card_id;
            else if (entry.account_id) curAcctVal = 'ba:' + entry.account_id;

            var h = '<td><input type="date" class="edit-date" value="' + esc(entry.date || '') + '" /></td>';
            h += '<td><select class="edit-type">';
            if (entry.card_id) {
                // CC entry: show specific CC transaction types
                var ccTypes = [
                    { v: 'expense', cc: 'Purchase',  label: 'Purchase'  },
                    { v: 'expense', cc: 'Interest',  label: 'Interest'  },
                    { v: 'expense', cc: 'Fee',       label: 'Fee'       },
                    { v: 'expense', cc: 'Debit',     label: 'Debit'     },
                    { v: 'income',  cc: 'Payment',   label: 'Payment'   },
                    { v: 'income',  cc: 'Credit',    label: 'Credit'    },
                    { v: 'income',  cc: 'Refund',    label: 'Refund'    },
                ];
                ccTypes.forEach(function(opt) {
                    var sel = (entry.cc_type === opt.cc || (!entry.cc_type && entry.type === opt.v && opt === ccTypes[0])) ? ' selected' : '';
                    h += '<option value="' + opt.v + '" data-cc-type="' + opt.cc + '"' + sel + '>' + esc(opt.label) + '</option>';
                });
            } else {
                h += '<option value="income"' + (entry.type === 'income' ? ' selected' : '') + '>' + esc(lang.lbl_income || 'Income') + '</option>';
                h += '<option value="expense"' + (entry.type === 'expense' ? ' selected' : '') + '>' + esc(lang.lbl_expense || 'Expense') + '</option>';
            }
            h += '</select></td>';
            h += '<td><input type="text" class="edit-cat" value="' + esc(entry.category || '') + '" /></td>';
            h += '<td><input type="text" class="edit-desc" value="' + esc(entry.description || '') + '" /></td>';
            h += '<td><input type="number" class="edit-amount" step="0.01" min="0" value="' + entry.amount + '" /></td>';
            // Account selector (only shown when accounts exist)
            h += '<td>';
            if (creditCards.length > 0 || bankAccounts.length > 0) {
                h += '<select class="edit-account">';
                h += '<option value="">' + esc(lang.cc_filter_all && lang.cc_tag_add || 'No account') + '</option>';
                if (bankAccounts.length > 0) {
                    h += '<optgroup label="' + esc(lang.ba_title || 'Bank Accounts') + '">';
                    bankAccounts.forEach(function(a) {
                        var lbl = a.name + (a.last4 ? ' …' + a.last4 : '');
                        var v = 'ba:' + a.id;
                        h += '<option value="' + esc(v) + '"' + (curAcctVal === v ? ' selected' : '') + '>' + esc(lbl) + '</option>';
                    });
                    h += '</optgroup>';
                }
                if (creditCards.length > 0) {
                    h += '<optgroup label="' + esc(lang.cc_title || 'Credit Cards') + '">';
                    creditCards.forEach(function(cc) {
                        var lbl = cc.name + (cc.last4 ? ' …' + cc.last4 : '');
                        var v = 'cc:' + cc.id;
                        h += '<option value="' + esc(v) + '"' + (curAcctVal === v ? ' selected' : '') + '>' + esc(lbl) + '</option>';
                    });
                    h += '</optgroup>';
                }
                h += '</select>';
            } else {
                h += '<input type="hidden" class="edit-account" value="" />';
            }
            h += '</td>';
            h += '<td class="budget-actions">';
            h += '<button class="budget-btn-save-edit button" title="' + esc(lang.btn_save || 'Save') + '">&#10003; ' + esc(lang.btn_save || 'Save') + '</button>';
            h += '<button class="budget-btn-cancel-edit" title="' + esc(lang.btn_cancel || 'Cancel') + '">&#10007;</button>';
            h += '</td>';
            $tr.html(h);
            $tr.find('.budget-btn-cancel-edit').on('click', function () { $tr.html(orig).removeClass('budget-edit-row'); });
            $tr.find('.budget-btn-save-edit').on('click', function () { doSaveEdit($tr, id); });
            // Enter key saves, Escape cancels
            $tr.find('input, select').on('keydown', function (ev) {
                if (ev.key === 'Enter' || ev.keyCode === 13) { ev.preventDefault(); doSaveEdit($tr, id); }
                if (ev.key === 'Escape' || ev.keyCode === 27) { ev.preventDefault(); $tr.html(orig).removeClass('budget-edit-row'); }
            });
        });

        // ── Filters ─────────────────────────────────────────

        $root.find('.budget-filter-period').on('change', function () {
            currentFilter = $(this).val();
            tlSelectedMonth = null;
            tlSelectedDay = null;
            if (currentFilter === 'custom') $root.find('.budget-filter-custom').show();
            else { $root.find('.budget-filter-custom').hide(); render(); }
        });
        $root.find('.budget-filter-apply').on('click', function () {
            filterFrom = $root.find('.budget-filter-from').val();
            filterTo = $root.find('.budget-filter-to').val();
            render();
        });
        $root.find('.budget-dash-month').on('change', function () { dashMonth = $(this).val(); renderDashboard(); });

        // ── CSV Export ──────────────────────────────────────

        $root.find('.budget-btn-export').on('click', function () {
            var vis = filteredEntries(); if (vis.length === 0) return;
            var rows = [['Date', 'Type', 'Category', 'Description', 'Amount'].join(',')];
            vis.forEach(function (e) {
                rows.push(['"' + (e.date || '').replace(/"/g, '""') + '"', '"' + (e.type || '') + '"',
                    '"' + (e.category || '') + '"', '"' + (e.description || '').replace(/"/g, '""') + '"',
                    e.type === 'income' ? e.amount : -e.amount].join(','));
            });
            var blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
            var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'budget_' + budgetId + '.csv';
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
        });

        // ═══════ BUDGET MANAGER ═════════════════════════════

        // ── Compute 12-month averages per expense category ──

        function getCatAverages() {
            var now = new Date();
            var months = [];
            for (var mi = 11; mi >= 0; mi--) {
                var dm = new Date(now.getFullYear(), now.getMonth() - mi, 1);
                months.push(dm.getFullYear() + '-' + ('0' + (dm.getMonth() + 1)).slice(-2));
            }

            // Use normalized spending data
            var normSpending = buildNormalizedCatSpending(months);

            var avgs = {}, variances = {};
            for (var cat in normSpending) {
                var catData = normSpending[cat];
                var total = 0;
                var monthVals = months.map(function (ym) { return catData[ym] || 0; });
                monthVals.forEach(function (v) { total += v; });
                var mean = total / 12;
                avgs[cat] = mean;
                var sumSqDiff = 0;
                monthVals.forEach(function (v) { sumSqDiff += (v - mean) * (v - mean); });
                variances[cat] = Math.sqrt(sumSqDiff / 12);
            }
            return { avgs: avgs, variances: variances };
        }


        // ═══════ BUDGET MANAGER + PLANNER ═════════════════════

        function renderBudgetManager() {
            var $l = $find('.budget-manage-list'); $l.empty();
            var stats = getCatAverages();

            budgetCats.forEach(function (bc, idx) {
                var avg = stats.avgs[bc.cat] || 0;
                var locked = bc.locked || false;

                var h = '<div class="budget-manage-row' + (locked ? ' bm-locked' : '') + '" data-idx="' + idx + '">';
                h += '<button class="bm-lock" title="' + (locked ? 'Unlock' : 'Lock — keeps this amount fixed when balancing') + '">' + (locked ? '&#128274;' : '&#128275;') + '</button>';
                h += '<span class="bm-cat">' + esc(catLabel(bc.cat)) + '</span>';
                h += '<span class="bm-avg" title="12-month average">avg ' + fmt(avg) + '</span>';
                h += '<input type="number" class="bm-limit" step="0.01" min="0" value="' + bc.limit + '"' + (locked ? ' disabled' : '') + ' />';
                h += '<button class="bm-del" title="Remove">&#10005;</button>';
                h += '</div>';
                $l.append(h);
            });

            updateBreakdown();
        }

        function updateBreakdown() {
            var income = parseFloat($find('.bp-income-input').val()) || 0;
            var savings = parseFloat($find('.bp-savings-input').val()) || 0;
            var lockedTotal = 0, unlockedTotal = 0;
            budgetCats.forEach(function (bc) {
                if (bc.locked) lockedTotal += bc.limit;
                else unlockedTotal += bc.limit;
            });
            var totalBudget = lockedTotal + unlockedTotal;
            var remaining = income - savings - totalBudget;

            var $bd = $find('.bp-breakdown');
            if (income <= 0) {
                $bd.html('<span class="bp-hint">Enter your monthly income and savings goal, then click <strong>Balance Budget</strong>.</span>');
                return;
            }

            var barParts = [];
            var pctLocked = (lockedTotal / income * 100);
            var pctUnlocked = (unlockedTotal / income * 100);
            var pctSavings = (savings / income * 100);

            barParts.push('<div class="bp-bar-seg bp-bar-locked" style="width:' + Math.min(pctLocked, 100) + '%"></div>');
            barParts.push('<div class="bp-bar-seg bp-bar-flex" style="width:' + Math.min(pctUnlocked, 100) + '%"></div>');
            barParts.push('<div class="bp-bar-seg bp-bar-savings" style="width:' + Math.min(pctSavings, 100) + '%"></div>');

            var html = '<div class="bp-bar">' + barParts.join('') + '</div>';
            html += '<div class="bp-bar-legend">';
            html += '<span class="bp-leg"><span class="bp-leg-dot bp-bar-locked"></span>Fixed: ' + fmt(lockedTotal) + '</span>';
            html += '<span class="bp-leg"><span class="bp-leg-dot bp-bar-flex"></span>Flexible: ' + fmt(unlockedTotal) + '</span>';
            html += '<span class="bp-leg"><span class="bp-leg-dot bp-bar-savings"></span>Savings: ' + fmt(savings) + '</span>';
            if (remaining > 0.01) html += '<span class="bp-leg bp-leg-remaining">Unallocated: ' + fmt(remaining) + '</span>';
            else if (remaining < -0.01) html += '<span class="bp-leg bp-leg-over">Over by: ' + fmt(Math.abs(remaining)) + '</span>';
            html += '</div>';
            $bd.html(html);
        }

        // ── Auto-detect paycheck income ─────────────────────

        $(document).on('click', '.bp-detect-income', function () {
            var now = new Date();
            var months = [];
            for (var mi = 11; mi >= 0; mi--) {
                var dm = new Date(now.getFullYear(), now.getMonth() - mi, 1);
                months.push(dm.getFullYear() + '-' + ('0' + (dm.getMonth() + 1)).slice(-2));
            }

            var groups = {};
            entries.forEach(function (e) {
                if (e.type !== 'income' || !e.date) return;
                var ym = e.date.substring(0, 7);
                if (months.indexOf(ym) === -1) return;
                var key = e.description.toUpperCase().replace(/[0-9#\-\/\.]+/g, '').replace(/\s+/g, ' ').trim();
                if (!key) key = 'UNKNOWN';
                if (!groups[key]) groups[key] = [];
                groups[key].push({ amount: e.amount, month: ym, desc: e.description });
            });

            var candidates = [];
            for (var key in groups) {
                var g = groups[key];
                var monthAmts = {};
                g.forEach(function (e) { monthAmts[e.month] = (monthAmts[e.month] || 0) + e.amount; });
                var monthKeys = Object.keys(monthAmts);
                if (monthKeys.length < 3) continue;

                var vals = monthKeys.map(function (m) { return monthAmts[m]; });
                var sum = 0;
                vals.forEach(function (v) { sum += v; });
                var mean = sum / vals.length;
                var sumSq = 0;
                vals.forEach(function (v) { sumSq += (v - mean) * (v - mean); });
                var stddev = Math.sqrt(sumSq / vals.length);
                var cv = mean > 0 ? stddev / mean : 999;

                candidates.push({ key: key, mean: mean, stddev: stddev, cv: cv, months: monthKeys.length, sample: g[0].desc });
            }

            if (candidates.length === 0) {
                showMsg(lang.bp_no_recurring || 'No recurring income found in the last 12 months.', 'error');
                return;
            }

            candidates.sort(function (a, b) {
                if (b.months !== a.months) return b.months - a.months;
                return a.cv - b.cv;
            });

            var paycheck = candidates[0];
            var monthlyIncome = Math.round(paycheck.mean * 100) / 100;
            $find('.bp-income-input').val(monthlyIncome);

            var $detail = $find('.bp-income-detail');
            var detailHtml = '<div class="bp-income-detected">';
            detailHtml += '<strong>Detected:</strong> ' + esc(paycheck.sample);
            detailHtml += ' &mdash; ' + fmt(monthlyIncome) + '/mo';
            detailHtml += ' (' + paycheck.months + ' of 12 months)';
            if (candidates.length > 1) {
                detailHtml += '<br><small>Other income excluded (reimbursements, variable): ';
                var others = [];
                for (var ci = 1; ci < Math.min(candidates.length, 4); ci++) {
                    others.push(esc(candidates[ci].sample) + ' ~' + fmt(candidates[ci].mean) + '/mo');
                }
                detailHtml += others.join(', ') + '</small>';
            }
            detailHtml += '</div>';
            $detail.html(detailHtml);

            updateBreakdown();
            showMsg((lang.bp_detected || 'Paycheck detected: %s/mo').replace('%s', fmt(monthlyIncome)));
        });

        // ── Live updates ────────────────────────────────────

        $(document).on('input', '.bp-income-input, .bp-savings-input', function () {
            updateBreakdown();
        });

        $(document).on('input', '.bm-limit', function () {
            var idx = $(this).closest('.budget-manage-row').data('idx');
            var val = parseFloat($(this).val()) || 0;
            if (budgetCats[idx]) budgetCats[idx].limit = val;
            updateBreakdown();
        });

        // ── Lock toggle ─────────────────────────────────────

        $(document).on('click', '.bm-lock', function () {
            var idx = $(this).closest('.budget-manage-row').data('idx');
            if (budgetCats[idx]) budgetCats[idx].locked = !budgetCats[idx].locked;
            renderBudgetManager();
        });

        // ── Balance Budget ──────────────────────────────────
        //
        // How it works:
        //   income - savings - locked totals = what's left for unlocked categories
        //   Distribute that remainder among unlocked categories proportional
        //   to their 12-month spending averages.
        //   If impossible, show alert.

        $(document).on('click', '.bp-balance', function () {
            var income = parseFloat($find('.bp-income-input').val()) || 0;
            var savings = parseFloat($find('.bp-savings-input').val()) || 0;
            var $alert = $find('.bp-alert');

            if (income <= 0) {
                $alert.html('<div class="bp-alert-err">Enter your monthly income first. Click <strong>Detect from Paychecks</strong> to auto-fill.</div>');
                return;
            }

            var stats = getCatAverages();

            // Auto-add categories with spending but no budget
            for (var cat in stats.avgs) {
                if (stats.avgs[cat] > 5 && !budgetCats.some(function (b) { return b.cat === cat; })) {
                    budgetCats.push({ cat: cat, limit: 0 });
                }
            }

            // Calculate locked total
            var lockedTotal = 0;
            budgetCats.forEach(function (bc) {
                if (bc.locked) lockedTotal += bc.limit;
            });

            var available = income - savings - lockedTotal;

            if (available < 0) {
                $alert.html('<div class="bp-alert-err">' +
                    '<strong>Cannot balance.</strong> Your fixed expenses (' + fmt(lockedTotal) +
                    ') + savings goal (' + fmt(savings) + ') = ' + fmt(lockedTotal + savings) +
                    ', which exceeds your income of ' + fmt(income) + '.' +
                    '<br>You need to either reduce savings, unlock/reduce a fixed expense, or increase income by ' +
                    '<strong>' + fmt(Math.abs(available)) + '</strong>.' +
                    '</div>');
                renderBudgetManager();
                return;
            }

            // Distribute available budget among unlocked categories by average spending
            var unlockedAvgTotal = 0;
            budgetCats.forEach(function (bc) {
                if (!bc.locked) unlockedAvgTotal += (stats.avgs[bc.cat] || 0);
            });

            if (unlockedAvgTotal > 0) {
                budgetCats.forEach(function (bc) {
                    if (bc.locked) return;
                    var avg = stats.avgs[bc.cat] || 0;
                    bc.limit = Math.round((avg / unlockedAvgTotal) * available * 100) / 100;
                });
            } else {
                // No history — even split
                var unlocked = budgetCats.filter(function (bc) { return !bc.locked; });
                var even = unlocked.length > 0 ? available / unlocked.length : 0;
                unlocked.forEach(function (bc) { bc.limit = Math.round(even * 100) / 100; });
            }

            // Check if any unlocked category got a budget well below its average (warning)
            var warnings = [];
            budgetCats.forEach(function (bc) {
                if (bc.locked) return;
                var avg = stats.avgs[bc.cat] || 0;
                if (avg > 0 && bc.limit < avg * 0.7) {
                    warnings.push(catLabel(bc.cat) + ': budget ' + fmt(bc.limit) + ' is ' + Math.round((1 - bc.limit / avg) * 100) + '% below your average of ' + fmt(avg));
                }
            });

            // Show result
            if (warnings.length > 0) {
                $alert.html('<div class="bp-alert-warn">' +
                    '<strong>Budget balanced</strong>, but some categories are tight:' +
                    '<ul>' + warnings.map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') + '</ul>' +
                    'Consider reducing savings or locking fewer categories.' +
                    '</div>');
            } else {
                $alert.html('<div class="bp-alert-ok">' +
                    '<strong>Budget balanced!</strong> ' + fmt(income) +
                    ' income &minus; ' + fmt(savings) + ' savings &minus; ' + fmt(lockedTotal) +
                    ' fixed = ' + fmt(available) + ' distributed across flexible categories.' +
                    '</div>');
            }

            renderBudgetManager();
            showMsg(lang.bp_save_reminder || 'Budget balanced. Click Save to keep these amounts.');
        });

        // ── Add / Delete / Save ─────────────────────────────

        $(document).on('click', '.budget-manage-add-btn', function () {
            var cat = $find('.budget-manage-new-cat').val(),
                lim = parseFloat($find('.budget-manage-new-limit').val()) || 0;
            if (lim <= 0) return;
            if (budgetCats.some(function (b) { return b.cat === cat; })) { showMsg(lang.bp_cat_already_exists || 'Category already has a budget', 'error'); return; }
            budgetCats.push({ cat: cat, limit: lim });
            renderBudgetManager();
            $find('.budget-manage-new-limit').val('');
        });

        $(document).on('click', '.bm-del', function () {
            budgetCats.splice($(this).closest('.budget-manage-row').data('idx'), 1);
            renderBudgetManager();
        });

        $(document).on('click', '.budget-manage-save', function () {
            $find('.budget-manage-row').each(function () {
                var idx = $(this).data('idx'), val = parseFloat($(this).find('.bm-limit').val()) || 0;
                if (budgetCats[idx]) budgetCats[idx].limit = val;
            });
            ajax('save_budgets', { budgets: JSON.stringify(budgetCats) }, function (r) {
                if (r.success) { showMsg(lang.budgets_saved || 'Saved.'); renderDashboard(); }
                else showMsg(lang.msg_error_save || 'Save failed', 'error');
            });
        });


        // ═══════ INCOME MANAGER ═══════════════════════════════

        function renderIncomeManager() {
            var now = new Date();
            var months = [];
            for (var mi = 11; mi >= 0; mi--) {
                var dm = new Date(now.getFullYear(), now.getMonth() - mi, 1);
                months.push(dm.getFullYear() + '-' + ('0' + (dm.getMonth() + 1)).slice(-2));
            }

            // Gather all income entries
            var allIncome = entries.filter(function (e) { return e.type === 'income' && e.date; });
            if (allIncome.length === 0) {
                $find('.income-chart-wrap, .income-summary-bar, .income-sources, .income-payroll-detail, .income-reimbursements').empty();
                $find('.income-sources').html('<p style="opacity:0.5;font-size:0.88em;">No income transactions found.</p>');
                return;
            }

            // ── 12-month income trend chart ─────────────
            var monthTotals = {};
            allIncome.forEach(function (e) {
                var ym = e.date.substring(0, 7);
                monthTotals[ym] = (monthTotals[ym] || 0) + e.amount;
            });
            var chartVals = months.map(function (ym) { return monthTotals[ym] || 0; });
            var chartSvg = buildDetailChart(chartVals, 0, months, { color: '#007bff' });
            $find('.income-chart-wrap').html('<div class="income-chart-title">Monthly Income — 12 Months</div>' + chartSvg);

            // ── Summary bar ─────────────────────────────
            var total12 = 0; chartVals.forEach(function (v) { total12 += v; });
            var avg12 = total12 / 12;
            var curMonth = months[months.length - 1];
            var curTotal = monthTotals[curMonth] || 0;
            var prevMonth = months[months.length - 2];
            var prevTotal = monthTotals[prevMonth] || 0;
            var moChange = prevTotal > 0 ? ((curTotal - prevTotal) / prevTotal * 100).toFixed(1) : '—';

            var sumHtml = '<div class="income-sum-cards">';
            sumHtml += '<div class="income-sum-card"><div class="income-sum-label">This Month</div><div class="income-sum-val">' + fmt(curTotal) + '</div></div>';
            sumHtml += '<div class="income-sum-card"><div class="income-sum-label">12-Mo Average</div><div class="income-sum-val">' + fmt(avg12) + '</div></div>';
            sumHtml += '<div class="income-sum-card"><div class="income-sum-label">12-Mo Total</div><div class="income-sum-val">' + fmt(total12) + '</div></div>';
            sumHtml += '<div class="income-sum-card"><div class="income-sum-label">Mo/Mo Change</div><div class="income-sum-val ' + (curTotal >= prevTotal ? 'positive' : 'negative') + '">' + (moChange !== '—' ? moChange + '%' : '—') + '</div></div>';
            sumHtml += '</div>';
            $find('.income-summary-bar').html(sumHtml);

            // ── Income Sources ──────────────────────────
            // Group by normalised description
            var groups = {};
            allIncome.forEach(function (e) {
                var key = e.description.toUpperCase().replace(/[0-9#\-\/\.]+/g, '').replace(/\s+/g, ' ').trim();
                if (!key) key = 'OTHER';
                if (!groups[key]) groups[key] = { txns: [], sample: e.description, key: key };
                groups[key].txns.push(e);
            });

            // Analyse each source
            var sources = [];
            for (var key in groups) {
                var g = groups[key];
                var total = 0, byMonth = {};
                g.txns.forEach(function (t) {
                    total += t.amount;
                    var ym = t.date.substring(0, 7);
                    byMonth[ym] = (byMonth[ym] || 0) + t.amount;
                });
                var monthKeys = Object.keys(byMonth);
                var vals = monthKeys.map(function (m) { return byMonth[m]; });
                var mean = total / Math.max(monthKeys.length, 1);
                var sumSq = 0;
                vals.forEach(function (v) { sumSq += (v - mean) * (v - mean); });
                var stddev = Math.sqrt(sumSq / Math.max(vals.length, 1));
                var cv = mean > 0 ? stddev / mean : 999;

                // Detect raises: find sustained changes in amount
                var raises = [];
                var sortedMonths = monthKeys.sort();
                var prevAmt = null;
                for (var si = 0; si < sortedMonths.length; si++) {
                    var amt = byMonth[sortedMonths[si]];
                    if (prevAmt !== null && Math.abs(amt - prevAmt) > prevAmt * 0.02 && amt > prevAmt) {
                        // Check if the new amount persists (next month same or higher)
                        var nextAmt = si + 1 < sortedMonths.length ? byMonth[sortedMonths[si + 1]] : amt;
                        if (nextAmt >= amt * 0.98) {
                            raises.push({
                                month: sortedMonths[si],
                                from: prevAmt,
                                to: amt,
                                pct: ((amt - prevAmt) / prevAmt * 100).toFixed(1)
                            });
                        }
                    }
                    prevAmt = amt;
                }

                // Get tag for this source
                var tag = '';
                incomeTags.forEach(function (t) { if (t.key === key) tag = t.tag; });

                sources.push({
                    key: key,
                    sample: g.sample,
                    total: total,
                    count: g.txns.length,
                    months: monthKeys.length,
                    mean: mean,
                    cv: cv,
                    stddev: stddev,
                    raises: raises,
                    latest: g.txns.sort(function (a, b) { return b.date.localeCompare(a.date); })[0].amount,
                    tag: tag,
                    isPayroll: cv < 0.15 && monthKeys.length >= 3,
                    isReimbursement: tag === 'reimbursement' || (cv > 0.4 && monthKeys.length >= 2)
                });
            }

            sources.sort(function (a, b) { return b.total - a.total; });

            // Render sources table
            var sHtml = '<div class="income-section-title">' + esc(lang.income_sources || 'Income Sources') + '</div>';
            sHtml += '<table class="income-sources-table"><tr>';
            sHtml += '<th>Source</th><th>Type</th><th class="amt">Latest</th><th class="amt">Monthly Avg</th><th>Months</th><th>Consistency</th><th class="amt">12-Mo Total</th>';
            sHtml += '</tr>';

            var tagOptions = '<option value="">—</option><option value="payroll">Payroll</option><option value="reimbursement">Reimbursement</option><option value="bonus">Bonus</option><option value="freelance">Freelance</option><option value="investment">Investment</option><option value="other">Other</option>';

            sources.forEach(function (src) {
                var consistency = src.cv < 0.05 ? 'Very consistent' : (src.cv < 0.15 ? 'Consistent' : (src.cv < 0.4 ? 'Variable' : 'Irregular'));
                var consCls = src.cv < 0.15 ? 'inc-consistent' : (src.cv < 0.4 ? 'inc-variable' : 'inc-irregular');
                var autoType = src.isPayroll ? 'payroll' : (src.isReimbursement ? 'reimbursement' : '');
                var selTag = src.tag || autoType;

                sHtml += '<tr class="income-source-row" data-key="' + esc(src.key) + '">';
                sHtml += '<td class="inc-src-name">' + esc(src.sample);
                if (src.raises.length > 0) {
                    var lastRaise = src.raises[src.raises.length - 1];
                    sHtml += ' <span class="inc-raise-badge" title="Raise detected ' + esc(lastRaise.month) + ': ' + fmt(lastRaise.from) + ' &#8594; ' + fmt(lastRaise.to) + '">&#9650; +' + lastRaise.pct + '%</span>';
                }
                sHtml += '</td>';
                sHtml += '<td><select class="inc-tag-select">' + tagOptions.replace('value="' + selTag + '"', 'value="' + selTag + '" selected') + '</select></td>';
                sHtml += '<td class="amt">' + fmt(src.latest) + '</td>';
                sHtml += '<td class="amt">' + fmt(src.mean) + '</td>';
                sHtml += '<td>' + src.months + ' / 12</td>';
                sHtml += '<td><span class="inc-cons ' + consCls + '">' + consistency + '</span></td>';
                sHtml += '<td class="amt">' + fmt(src.total) + '</td>';
                sHtml += '</tr>';
            });
            sHtml += '</table>';
            $find('.income-sources').html(sHtml);

            // ── Payroll Detail ──────────────────────────
            var payrollSources = sources.filter(function (s) { return (s.tag || (s.isPayroll ? 'payroll' : '')) === 'payroll'; });

            if (payrollSources.length > 0) {
                var pHtml = '<div class="income-section-title">' + esc(lang.income_payroll || 'Payroll Analysis') + '</div>';

                payrollSources.forEach(function (ps) {
                    pHtml += '<div class="income-payroll-card">';
                    pHtml += '<div class="ipc-header"><strong>' + esc(ps.sample) + '</strong>';
                    pHtml += '<span class="ipc-current">Current: ' + fmt(ps.latest) + '/mo</span></div>';

                    // Raise history
                    if (ps.raises.length > 0) {
                        pHtml += '<div class="ipc-raises"><div class="ipc-subtitle">Raise History</div>';
                        pHtml += '<table class="ipc-raise-table"><tr><th>Date</th><th class="amt">From</th><th class="amt">To</th><th class="amt">Change</th></tr>';
                        ps.raises.forEach(function (r) {
                            pHtml += '<tr><td>' + esc(r.month) + '</td><td class="amt">' + fmt(r.from) + '</td><td class="amt">' + fmt(r.to) + '</td>';
                            pHtml += '<td class="amt positive">+' + fmt(r.to - r.from) + ' (+' + r.pct + '%)</td></tr>';
                        });
                        pHtml += '</table></div>';
                    }

                    // Projected annual
                    var annual = ps.latest * 12;
                    pHtml += '<div class="ipc-annual">Projected annual: <strong>' + fmt(annual) + '</strong></div>';
                    pHtml += '</div>';
                });
                $find('.income-payroll-detail').html(pHtml);
            } else {
                $find('.income-payroll-detail').html('');
            }

            // ── Reimbursements ──────────────────────────
            var reimbSources = sources.filter(function (s) { return (s.tag || (s.isReimbursement ? 'reimbursement' : '')) === 'reimbursement'; });

            if (reimbSources.length > 0) {
                var rHtml = '<div class="income-section-title">' + esc(lang.income_reimburse || 'Reimbursements') + '</div>';
                rHtml += '<p class="inc-reimb-note">These are excluded from base income calculations in the budget planner.</p>';
                rHtml += '<table class="income-reimb-table"><tr><th>Source</th><th class="amt">Monthly Avg</th><th>Frequency</th><th class="amt">12-Mo Total</th></tr>';
                var reimbTotal = 0;
                reimbSources.forEach(function (rs) {
                    reimbTotal += rs.total;
                    rHtml += '<tr><td>' + esc(rs.sample) + '</td>';
                    rHtml += '<td class="amt">' + fmt(rs.mean) + '</td>';
                    rHtml += '<td>' + rs.months + ' of 12 months</td>';
                    rHtml += '<td class="amt">' + fmt(rs.total) + '</td></tr>';
                });
                rHtml += '<tr class="inc-reimb-total"><td><strong>Total Reimbursements</strong></td>';
                rHtml += '<td class="amt"><strong>' + fmt(reimbTotal / 12) + '</strong></td><td></td>';
                rHtml += '<td class="amt"><strong>' + fmt(reimbTotal) + '</strong></td></tr>';
                rHtml += '</table>';
                $find('.income-reimbursements').html(rHtml);
            } else {
                $find('.income-reimbursements').html('');
            }
        }

        // ── Income tag changes (save) ───────────────────

        $(document).on('change', '.inc-tag-select', function () {
            var $row = $(this).closest('.income-source-row');
            var key = $row.data('key');
            var tag = $(this).val();

            // Update or add tag
            var found = false;
            incomeTags.forEach(function (t) { if (t.key === key) { t.tag = tag; found = true; } });
            if (!found && tag) incomeTags.push({ key: key, tag: tag });
            // Remove empty tags
            incomeTags = incomeTags.filter(function (t) { return t.tag; });

            ajax('save_income_tags', { income_tags: JSON.stringify(incomeTags) }, function (r) {
                if (r.success) {
                    $row.css('background', 'rgba(40,167,69,0.1)');
                    setTimeout(function () { $row.css('background', ''); }, 600);
                    renderIncomeManager();
                }
            });
        });

        // ═══════ CONTROL PANEL — EDITOR WINDOWS ═══════════════

        var panelTitles = {
            add: lang.panel_add || 'Add Transaction',
            import: lang.panel_import || 'Import CSV',
            cards: lang.panel_cards || 'Credit Cards',
            budgets: lang.panel_budgets || 'Budget Planner',
            income: lang.panel_income || 'Income Manager',
            rules: lang.panel_rules || 'Categorization Rules',
            cats: lang.panel_cats || 'Custom Categories',
            data: lang.panel_data || '\uD83D\uDDC3 Data Manager'
        };

        var panelSizes = {
            add: { w: 560, h: 200 },
            import: { w: 600, h: 460 },
            cards: { w: 620, h: 520 },
            budgets: { w: 600, h: 550 },
            income: { w: 700, h: 560 },
            rules: { w: 560, h: 480 },
            cats: { w: 500, h: 380 },
            data: { w: 580, h: 520 }
        };

        var openEditorWins = {};

        $root.on('click', '.cp-btn', function () {
            var panel = $(this).data('panel');
            if (!panel) return;

            // If window already open, focus it
            if (openEditorWins[panel] && openEditorWins[panel].closest('body').length) {
                detailZIndex++;
                openEditorWins[panel].css('z-index', detailZIndex);
                return;
            }

            var $source = $root.find('.cp-panel[data-panel="' + panel + '"]');
            if (!$source.length) return;

            var title = panelTitles[panel] || panel;
            var sz = panelSizes[panel] || { w: 520, h: 400 };

            var html = '<div class="budget-detail-win editor-win" data-editor="' + esc(panel) + '" style="z-index:' + (++detailZIndex) + '">';
            html += '<div class="detail-win-titlebar">';
            html += '<span class="detail-win-title">' + esc(title) + '</span>';
            html += '<div class="detail-win-btns">';
            html += '<button class="detail-win-maximize" title="Maximize">&#9744;</button>';
            html += '<button class="detail-win-close" title="Close">&times;</button>';
            html += '</div></div>';
            html += '<div class="detail-win-body editor-win-body"></div>';
            html += '</div>';

            var $ew = $(html).appendTo('body');
            var ewPageColors = getPageColors();
            $ew[0].style.setProperty('background-color', ewPageColors.bg, 'important');
            $ew[0].style.setProperty('color', ewPageColors.fg, 'important');

            // Move the panel content into the window
            $source.show().appendTo($ew.find('.editor-win-body'));

            openEditorWins[panel] = $ew;

            // Position
            var isMobile = window.innerWidth <= 768;
            if (!isMobile) {
                var openCount = $('.editor-win').length;
                var vpW = $(window).width(), vpH = $(window).height();
                var wW = Math.min(sz.w, vpW - 40), wH = Math.min(sz.h, vpH - 40);
                var wL = Math.max(10, (vpW - wW) / 2 + (openCount - 1) * 25);
                var wT = Math.max(10, (vpH - wH) / 3 + (openCount - 1) * 25);
                $ew.css({ top: wT, left: wL, width: wW, height: wH });
            } else {
                document.body.style.overflow = 'hidden';
            }

            // Highlight active button
            $root.find('.cp-btn[data-panel="' + panel + '"]').addClass('cp-btn-active');

            // Re-render panel content if needed
            if (panel === 'budgets') renderBudgetManager();
            if (panel === 'income') renderIncomeManager();
            if (panel === 'rules') renderRulesManager();
            if (panel === 'cats') renderCustomCatsManager();
            if (panel === 'cards') { renderCreditCardsPanel($ew.find('.budget-cards-body')); renderBankAccountsSection($ew.find('.budget-cards-body')); }
            if (panel === 'data') populateDataManager($ew.find('.data-manager-body'));

            // Window state
            var ewState = { snapped: false, restore: null };
            function ewSaveRestore() {
                if (!ewState.restore) { var r = $ew[0].getBoundingClientRect(); ewState.restore = { top: r.top, left: r.left, width: r.width, height: r.height }; }
            }
            function ewRestore() {
                $ew.removeClass('detail-win-snapped-left detail-win-snapped-right detail-win-maximized');
                if (ewState.restore) $ew.css({ top: ewState.restore.top, left: ewState.restore.left, width: ewState.restore.width, height: ewState.restore.height });
                ewState.snapped = false; ewState.restore = null;
            }

            // Close — move content back
            $ew.find('.detail-win-close').on('click', function (e) {
                e.stopPropagation();
                var $content = $ew.find('.cp-panel');
                $content.hide().appendTo($root.find('.cp-panels'));
                $ew.remove();
                delete openEditorWins[panel];
                $root.find('.cp-btn[data-panel="' + panel + '"]').removeClass('cp-btn-active');
                if (isMobile && !$('.budget-detail-win').length) document.body.style.overflow = '';
            }).on('mousedown', function (e) { e.stopPropagation(); });

            // Maximize
            $ew.find('.detail-win-maximize').on('click', function (e) {
                e.stopPropagation();
                if (ewState.snapped === 'max') { ewRestore(); }
                else {
                    ewSaveRestore();
                    $ew.removeClass('detail-win-snapped-left detail-win-snapped-right').addClass('detail-win-maximized');
                    $ew.css({ top: 0, left: 0, width: '100vw', height: '100vh' });
                    ewState.snapped = 'max';
                }
            }).on('mousedown', function (e) { e.stopPropagation(); });

            $ew.on('mousedown', function () { detailZIndex++; $(this).css('z-index', detailZIndex); });

            // Titlebar dbl-click snap
            $ew.find('.detail-win-titlebar').on('dblclick', function (e) {
                if ($(e.target).closest('.detail-win-btns').length) return;
                e.preventDefault();
                if (ewState.snapped) { ewRestore(); return; }
                var otherLeft = false;
                $('.budget-detail-win').not($ew).each(function () { if ($(this).hasClass('detail-win-snapped-left')) otherLeft = true; });
                ewSaveRestore();
                if (otherLeft) { $ew.removeClass('detail-win-snapped-left detail-win-maximized').addClass('detail-win-snapped-right'); $ew.css({ top: 0, left: '50vw', width: '50vw', height: '100vh' }); ewState.snapped = 'right'; }
                else { $ew.removeClass('detail-win-snapped-right detail-win-maximized').addClass('detail-win-snapped-left'); $ew.css({ top: 0, left: 0, width: '50vw', height: '100vh' }); ewState.snapped = 'left'; }
            });

            // Drag
            $ew.find('.detail-win-titlebar').on('mousedown', function (e) {
                if ($(e.target).closest('.detail-win-btns').length) return;
                e.preventDefault();
                var rect = $ew[0].getBoundingClientRect();
                var ox = e.clientX - rect.left, oy = e.clientY - rect.top, dragged = false;
                function onMove(ev) {
                    if (!dragged && ewState.snapped) {
                        var rw = ewState.restore ? ewState.restore.width : sz.w, rh = ewState.restore ? ewState.restore.height : sz.h;
                        ewRestore();
                        $ew.css({ width: rw, height: rh });
                        ox = rw / 2; oy = 15;
                        dragged = true;
                    }
                    dragged = true;
                    $ew.css({ top: ev.clientY - oy, left: ev.clientX - ox });
                }
                function onUp() { $(document).off('mousemove', onMove).off('mouseup', onUp); }
                $(document).on('mousemove', onMove).on('mouseup', onUp);
            });
        });

        // ═══════ PRINT ════════════════════════════════════════

        function printContent(title, bodyHtml) {
            var printWin = window.open('', '_blank', 'width=900,height=700');
            if (!printWin) { showMsg(lang.popup_blocked || 'Pop-up blocked. Please allow pop-ups for printing.', 'error'); return; }

            var styles = [
                'body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #222; margin: 2em; font-size: 13px; }',
                'h1 { font-size: 1.4em; margin-bottom: 0.3em; border-bottom: 2px solid #333; padding-bottom: 0.3em; }',
                'h2 { font-size: 1.1em; margin: 1em 0 0.4em; color: #555; }',
                '.print-date { font-size: 0.85em; color: #888; margin-bottom: 1.5em; }',
                '.print-summary { display: flex; gap: 2em; margin-bottom: 1.5em; }',
                '.print-summary-card { padding: 0.6em 1em; border: 1px solid #ddd; border-radius: 5px; }',
                '.print-summary-card .label { font-size: 0.8em; color: #888; }',
                '.print-summary-card .value { font-size: 1.3em; font-weight: 700; }',
                '.positive { color: #28a745; } .negative { color: #dc3545; }',
                'table { border-collapse: collapse; width: 100%; margin-bottom: 1.5em; }',
                'th, td { border: 1px solid #ddd; padding: 0.4em 0.6em; text-align: left; font-size: 0.9em; }',
                'th { background: #f5f5f5; font-weight: 600; }',
                'tr:nth-child(even) { background: #fafafa; }',
                '.amt { text-align: right; font-family: monospace; }',
                '.dash-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 0.8em; margin-bottom: 1.5em; }',
                '.dash-item { border: 1px solid #ddd; border-radius: 5px; padding: 0.6em; }',
                '.dash-item .cat { font-weight: 600; margin-bottom: 0.3em; }',
                '.dash-item .bar { height: 6px; background: #eee; border-radius: 3px; margin-bottom: 0.3em; }',
                '.dash-item .bar-fill { height: 100%; border-radius: 3px; }',
                '.bar-ok { background: #28a745; } .bar-warn { background: #ffa53d; } .bar-over { background: #dc3545; }',
                '.dash-item .nums { font-size: 0.82em; color: #666; }',
                'svg { max-width: 100%; height: auto; }',
                '.detail-stats { display: flex; gap: 1.5em; margin-bottom: 1em; }',
                '.detail-stat { text-align: center; }',
                '.detail-stat-label { font-size: 0.75em; color: #888; display: block; }',
                '.detail-stat-val { font-weight: 700; }',
                '@media print { body { margin: 0.5em; } }',
            ].join('\n');

            var html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + title.replace(/</g, '&lt;') + '</title>';
            html += '<style>' + styles + '</style></head><body>';
            html += bodyHtml;
            html += '</body></html>';

            printWin.document.write(html);
            printWin.document.close();
            printWin.focus();
            setTimeout(function () { printWin.print(); }, 400);
        }

        // ── Print main budget report ────────────────────────

        $root.on('click', '.budget-print-btn', function () {
            var monthLabel = $root.find('.budget-dash-month option:selected').text();
            var body = '<h1>' + esc(config.budgetId.replace(/_/g, ' ')) + ' &mdash; Budget Report</h1>';
            body += '<div class="print-date">' + esc(monthLabel) + ' &bull; Printed ' + new Date().toLocaleDateString() + '</div>';

            // Summary
            var ti = 0, te = 0;
            var filtered = filteredEntries();
            filtered.forEach(function (e) { if (e.type === 'income') ti += e.amount; else te += e.amount; });
            var bal = ti - te;
            body += '<div class="print-summary">';
            body += '<div class="print-summary-card"><div class="label">Income</div><div class="value positive">+' + fmt(ti) + '</div></div>';
            body += '<div class="print-summary-card"><div class="label">Expenses</div><div class="value negative">-' + fmt(te) + '</div></div>';
            body += '<div class="print-summary-card"><div class="label">Balance</div><div class="value ' + (bal >= 0 ? 'positive' : 'negative') + '">' + fmt(bal) + '</div></div>';
            body += '</div>';

            // Dashboard cards
            if (budgetCats.length > 0) {
                body += '<h2>Budget Overview</h2>';
                body += '<table><tr><th>Category</th><th class="amt">Budgeted</th><th class="amt">Spent</th><th class="amt">Remaining</th><th>Status</th></tr>';
                var monthSpending = buildNormalizedCatSpending([dashMonth]);
                budgetCats.forEach(function (bc) {
                    var catData = monthSpending[bc.cat] || {};
                    var spent = catData[dashMonth] || 0;
                    var rem = bc.limit - spent;
                    var status = rem < 0 ? '&#10060; Over' : (spent / bc.limit > 0.75 ? '&#9888; Warning' : '&#9989; OK');
                    body += '<tr><td>' + esc(catLabel(bc.cat)) + (bc.locked ? ' &#128274;' : '') + '</td>';
                    body += '<td class="amt">' + fmt(bc.limit) + '</td>';
                    body += '<td class="amt">' + fmt(spent) + '</td>';
                    body += '<td class="amt">' + fmt(rem) + '</td>';
                    body += '<td>' + status + '</td></tr>';
                });
                body += '</table>';
            }

            // Active filters
            var filterDesc = [];
            if (searchQuery) filterDesc.push('Search: "' + searchQuery + '"');
            if (searchTypeFilter) filterDesc.push('Type: ' + searchTypeFilter);
            if (searchCatFilter) filterDesc.push('Category: ' + catLabel(searchCatFilter));
            if (searchMinAmt !== null) filterDesc.push('Min: ' + fmt(searchMinAmt));
            if (searchMaxAmt !== null) filterDesc.push('Max: ' + fmt(searchMaxAmt));
            if (currentFilter !== 'all') filterDesc.push('Period: ' + $root.find('.budget-filter-period option:selected').text());
            if (filterDesc.length > 0) {
                body += '<div class="print-filters" style="font-size:0.85em;opacity:0.7;margin:0.5em 0;">Filters: ' + esc(filterDesc.join(', ')) + '</div>';
            }

            // Timeline chart
            var $tlSvg = $root.find('.search-timeline-svg');
            if ($tlSvg.length) {
                body += '<h2>Transaction Timeline</h2>';
                body += '<div style="width:100%;max-height:60px;">' + $tlSvg[0].outerHTML + '</div>';
            }

            // Transactions
            body += '<h2>Transactions</h2>';
            body += '<table><tr><th>Date</th><th>Description</th><th>Category</th><th class="amt">Amount</th><th>Type</th></tr>';
            filtered.sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });
            filtered.forEach(function (e) {
                body += '<tr><td>' + esc(e.date) + '</td><td>' + esc(e.description) + '</td>';
                body += '<td>' + esc(catLabel(e.category)) + '</td>';
                body += '<td class="amt">' + fmt(e.amount) + '</td>';
                body += '<td>' + (e.type === 'income' ? 'Income' : 'Expense') + '</td></tr>';
            });
            body += '</table>';

            printContent('Budget Report — ' + monthLabel, body);
        });

        // ── Print detail window ─────────────────────────────

        $(document).on('click', '.detail-win-print', function (e) {
            e.stopPropagation();
            var $win = $(this).closest('.budget-detail-win');
            var title = $win.find('.detail-win-title').text();

            var body = '<h1>' + esc(title) + '</h1>';
            body += '<div class="print-date">Printed ' + new Date().toLocaleDateString() + '</div>';

            // Stats
            var $stats = $win.find('.detail-stats');
            if ($stats.length) {
                body += '<div class="detail-stats">';
                $stats.find('.detail-stat').each(function () {
                    body += '<div class="detail-stat"><span class="detail-stat-label">' + $(this).find('.detail-stat-label').text() + '</span>';
                    body += '<span class="detail-stat-val">' + $(this).find('.detail-stat-val').text() + '</span></div>';
                });
                body += '</div>';
            }

            // Chart SVG — use whichever is currently visible
            var $visibleChart = $win.find('.detail-chart-wrap:visible .detail-chart');
            if ($visibleChart.length) {
                body += '<div style="margin:1em 0;">' + $visibleChart[0].outerHTML + '</div>';
            }

            // Transaction table
            var $table = $win.find('.detail-txns-scroll table');
            if ($table.length) {
                var header = $win.find('.detail-txns-header').text();
                body += '<h2>' + esc(header) + '</h2>';
                body += '<table><tr><th>Date</th><th>Description</th><th class="amt">Amount</th></tr>';
                $table.find('tr').each(function () {
                    var $tds = $(this).find('td');
                    if ($tds.length >= 3) {
                        body += '<tr><td>' + $tds.eq(0).text() + '</td><td>' + $tds.eq(1).text() + '</td>';
                        body += '<td class="amt">' + $tds.eq(2).text() + '</td></tr>';
                    }
                });
                body += '</table>';
            }

            printContent(title, body);
        });

        // ── Print search results ─────────────────────────────

        $root.on('click', '.search-print-btn', function () {
            var visible = filteredEntries();
            var title = config.budgetId.replace(/_/g, ' ') + ' — Search Results';

            var body = '<h1>' + esc(title) + '</h1>';
            body += '<div class="print-date">Printed ' + new Date().toLocaleDateString() + '</div>';

            // Active filters
            var filters = [];
            if (searchQuery) filters.push('Search: "' + searchQuery + '"');
            if (searchTypeFilter) filters.push('Type: ' + searchTypeFilter);
            if (searchCatFilter) filters.push('Category: ' + catLabel(searchCatFilter));
            if (searchMinAmt !== null) filters.push('Min: ' + fmt(searchMinAmt));
            if (searchMaxAmt !== null) filters.push('Max: ' + fmt(searchMaxAmt));
            if (currentFilter !== 'all') {
                var periodLabels = { month: 'This Month', '60days': 'Last 60 Days', '90days': 'Last 90 Days', '12months': 'Last 12 Months', custom: 'Custom Range' };
                filters.push('Period: ' + (periodLabels[currentFilter] || currentFilter));
            }
            if (filters.length) {
                body += '<p style="font-size:0.9em;color:#666;margin-bottom:1em;">Filters: ' + esc(filters.join(' • ')) + '</p>';
            }

            // Summary
            var ti = 0, te = 0;
            visible.forEach(function (e) { if (e.type === 'income') ti += e.amount; else te += e.amount; });
            var bal = ti - te;
            body += '<div class="print-summary">';
            body += '<div class="print-summary-card"><div class="label">Income</div><div class="value positive">+' + fmt(ti) + '</div></div>';
            body += '<div class="print-summary-card"><div class="label">Expenses</div><div class="value negative">-' + fmt(te) + '</div></div>';
            body += '<div class="print-summary-card"><div class="label">Balance</div><div class="value ' + (bal >= 0 ? 'positive' : 'negative') + '">' + fmt(bal) + '</div></div>';
            body += '<div class="print-summary-card"><div class="label">Transactions</div><div class="value">' + visible.length + '</div></div>';
            body += '</div>';

            // Timeline chart
            var $tlSvg = $root.find('.search-timeline svg');
            if ($tlSvg.length) {
                body += '<div style="margin:0.5em 0 1em;">' + $tlSvg[0].outerHTML + '</div>';
            }
            // Day detail (if in day view)
            var $dayDetail = $root.find('.tl-day-detail');
            if ($dayDetail.length) {
                body += '<div style="margin:0.5em 0 1em;font-size:0.9em;">' + $dayDetail.html() + '</div>';
            }

            // Transaction table
            body += '<table><thead><tr><th>Date</th><th>Type</th><th>Category</th><th>Description</th><th class="amt">Amount</th></tr></thead><tbody>';
            visible.forEach(function (e) {
                var pfx = e.type === 'income' ? '+' : '-';
                body += '<tr>';
                body += '<td>' + esc(e.date || '') + '</td>';
                body += '<td>' + esc(e.type || '') + '</td>';
                body += '<td>' + esc(catLabel(e.category)) + '</td>';
                body += '<td>' + esc(e.description) + '</td>';
                body += '<td class="amt">' + pfx + fmt(e.amount) + '</td>';
                body += '</tr>';
            });
            body += '</tbody></table>';

            printContent(title, body);
        });

        // ═══════ DATA MANAGER ═══════════════════════════════

        var dmImportData = null;

        function populateDataManager($body) {
            var h = '<div class="dm-section">';
            h += '<h3 class="dm-heading">&#128451; Data Summary</h3>';
            h += '<div class="dm-counts">';
            h += '<span class="dm-count-item"><strong>' + entries.length + '</strong> transactions</span>';
            h += '<span class="dm-count-item"><strong>' + budgetCats.length + '</strong> budgets</span>';
            h += '<span class="dm-count-item"><strong>' + rules.length + '</strong> rules</span>';
            h += '<span class="dm-count-item"><strong>' + customCats.length + '</strong> categories</span>';
            h += '<span class="dm-count-item"><strong>' + incomeTags.length + '</strong> income tags</span>';
            h += '<span class="dm-count-item"><strong>' + creditCards.length + '</strong> credit cards</span>';
            h += '</div>';
            h += '<div class="dm-server-info"><em style="font-size:0.8em;opacity:0.5;">Loading file info\u2026</em></div>';
            h += '</div>';

            h += '<div class="dm-section">';
            h += '<h3 class="dm-heading">&#128229; Export</h3>';
            h += '<div class="dm-btn-row">';
            h += '<button class="button dm-export-full">&#128230; Full Backup (JSON)</button>';
            h += '<button class="button dm-export-csv">&#128196; Transactions (CSV)</button>';
            h += '<button class="button dm-export-budgets">&#128176; Budgets (JSON)</button>';
            h += '<button class="button dm-export-rules">&#128203; Rules (JSON)</button>';
            h += '<button class="button dm-export-cats">&#127991; Categories (JSON)</button>';
            h += '</div></div>';

            h += '<div class="dm-section">';
            h += '<h3 class="dm-heading">&#128228; Import / Restore</h3>';
            h += '<p class="dm-hint">Upload a previously exported JSON backup to restore data.</p>';
            h += '<div class="dm-import-row"><input type="file" class="dm-import-file" accept=".json" /></div>';
            h += '<div class="dm-import-preview" style="display:none;"></div>';
            h += '<div class="dm-import-actions" style="display:none;">';
            h += '<label class="dm-cb-label"><input type="checkbox" class="dm-restore-cb" value="entries" checked /> Transactions</label>';
            h += '<label class="dm-cb-label"><input type="checkbox" class="dm-restore-cb" value="budgets" checked /> Budgets</label>';
            h += '<label class="dm-cb-label"><input type="checkbox" class="dm-restore-cb" value="rules" checked /> Rules</label>';
            h += '<label class="dm-cb-label"><input type="checkbox" class="dm-restore-cb" value="custom_cats" checked /> Categories</label>';
            h += '<label class="dm-cb-label"><input type="checkbox" class="dm-restore-cb" value="income_tags" checked /> Income Tags</label>';
            h += '<label class="dm-cb-label"><input type="checkbox" class="dm-restore-cb" value="credit_cards" checked /> Credit Cards</label>';
            h += '<div class="dm-btn-row" style="margin-top:0.5em;"><button class="button dm-do-restore">&#128260; Restore Selected</button></div>';
            h += '</div>';
            h += '<div class="dm-status"></div></div>';

            $body.html(h);

            ajax('data_info', {}, function (resp) {
                if (!resp.success) { $body.find('.dm-server-info').html('<em style="font-size:0.8em;opacity:0.5;">Server info unavailable</em>'); return; }
                var info = resp.info;
                var fmtSize = function (b) { return b < 1024 ? b + ' B' : (b / 1024).toFixed(1) + ' KB'; };
                var si = '<div class="dm-info-grid" style="margin-top:0.4em;">';
                si += '<span class="dm-label">Data file:</span><span class="dm-val dm-path">' + esc(info.file_path) + '</span>';
                si += '<span class="dm-label">File size:</span><span class="dm-val">' + fmtSize(info.file_size) + '</span>';
                si += '<span class="dm-label">Last modified:</span><span class="dm-val">' + esc(info.file_modified || 'N/A') + '</span>';
                si += '<span class="dm-label">Backup dir:</span><span class="dm-val dm-path">' + esc(info.backup_dir) + '</span>';
                si += '</div>';
                // Entry breakdown — shows raw counts from server so user can tell if data exists
                if (info.counts) {
                    var c = info.counts;
                    var ccT = entries.filter(function(e){ return !!e.card_id; }).length;
                    var baT = entries.filter(function(e){ return !!e.account_id; }).length;
                    var unT = entries.length - ccT - baT;
                    si += '<div style="margin-top:0.5em;font-size:0.85em;">';
                    si += '<strong>Entry counts (from server):</strong> ';
                    si += c.entries + ' total';
                    si += ' &bull; ' + ccT + ' CC-tagged';
                    si += ' &bull; ' + baT + ' bank-tagged';
                    si += ' &bull; ' + unT + ' untagged';
                    if (c.entries !== entries.length) {
                        si += ' <span style="color:#dc3545;">(⚠ JS has ' + entries.length + ' — reload may be needed)</span>';
                    }
                    si += '</div>';
                }
                if (info.backups && info.backups.length > 0) {
                    si += '<div style="margin-top:0.5em;"><strong style="font-size:0.85em;">Automatic Backups:</strong>';
                    info.backups.forEach(function (b) {
                        si += '<div class="dm-backup-row"><span class="dm-backup-date">' + esc(b.date) + '</span><span class="dm-backup-size">' + fmtSize(b.size) + '</span></div>';
                    });
                    si += '</div>';
                }
                $body.find('.dm-server-info').html(si);
            });
        }

        $(document).on('click', '.dm-export-full', function () {
            ajax('export_data', {}, function (r) { if (r.success) downloadJSON('budget_' + config.budgetId + '_full_backup.json', r.data); });
        });
        $(document).on('click', '.dm-export-csv', function () {
            if (entries.length === 0) { showMsg(lang.dm_no_transactions || 'No transactions', 'error'); return; }
            var rows = [['Date','Type','Category','Description','Amount'].join(',')];
            entries.forEach(function (e) {
                rows.push(['"'+(e.date||'').replace(/"/g,'""')+'"','"'+(e.type||'')+'"','"'+(e.category||'')+'"','"'+(e.description||'').replace(/"/g,'""')+'"',e.type==='income'?e.amount:-e.amount].join(','));
            });
            downloadFile('budget_' + config.budgetId + '_transactions.csv', rows.join('\n'), 'text/csv');
        });
        $(document).on('click', '.dm-export-budgets', function () { downloadJSON('budget_' + config.budgetId + '_budgets.json', { budgets: budgetCats }); });
        $(document).on('click', '.dm-export-rules', function () { downloadJSON('budget_' + config.budgetId + '_rules.json', { rules: rules }); });
        $(document).on('click', '.dm-export-cats', function () { downloadJSON('budget_' + config.budgetId + '_categories.json', { custom_cats: customCats }); });

        $(document).on('change', '.dm-import-file', function () {
            var file = this.files[0]; if (!file) return;
            var reader = new FileReader();
            reader.onload = function (ev) {
                try { dmImportData = JSON.parse(ev.target.result); } catch (e) { $('.dm-status').text('Invalid JSON file.').css('color','#dc3545'); return; }
                var parts = [];
                if (dmImportData.entries) parts.push(dmImportData.entries.length + ' transactions');
                if (dmImportData.budgets) parts.push(dmImportData.budgets.length + ' budgets');
                if (dmImportData.rules) parts.push(dmImportData.rules.length + ' rules');
                if (dmImportData.custom_cats) parts.push(dmImportData.custom_cats.length + ' categories');
                if (dmImportData.income_tags) parts.push(dmImportData.income_tags.length + ' income tags');
                if (dmImportData._export_meta) parts.push('exported ' + dmImportData._export_meta.exported);
                $('.dm-import-preview').html('<div class="dm-import-info"><strong>File:</strong> ' + (parts.join(', ') || 'No data') + '</div>').show();
                $('.dm-import-actions').show();
                $('.dm-restore-cb').each(function () { var k=$(this).val(), has=dmImportData[k]&&dmImportData[k].length>0; $(this).prop('checked',has).prop('disabled',!has); });
            };
            reader.readAsText(file);
        });

        $(document).on('click', '.dm-do-restore', function () {
            if (!dmImportData) return;
            var secs = []; $('.dm-restore-cb:checked').each(function () { secs.push($(this).val()); });
            if (secs.length === 0) { $('.dm-status').text('Select at least one section.').css('color','#dc3545'); return; }
            if (!confirm('Restore ' + secs.join(', ') + '? This overwrites current data for selected sections.')) return;
            $('.dm-status').text('Restoring\u2026').css('color','');
            ajax('import_full', { import_data: JSON.stringify(dmImportData), restore_sections: secs.join(',') }, function (r) {
                if (r.success) { $('.dm-status').text('Restore complete!').css('color','#28a745'); showMsg('Restored. Reloading\u2026'); loadAll(); }
                else { $('.dm-status').text('Failed: ' + (r.error||'unknown')).css('color','#dc3545'); }
            });
        });

        function downloadJSON(filename, data) {
            var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename;
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
        }
        function downloadFile(filename, content, mime) {
            var blob = new Blob([content], { type: mime + ';charset=utf-8;' });
            var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename;
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
        }
        // ═══════ RULES MANAGER ══════════════════════════════

        var rulesSearch = '';

        function renderRulesManager() {
            var $l = $find('.budget-rules-list'); $l.empty();
            var q = rulesSearch.toLowerCase();
            rules.forEach(function (r, idx) {
                // Filter by search
                if (q && r.keyword.toLowerCase().indexOf(q) === -1 && catLabel(r.category).toLowerCase().indexOf(q) === -1) return;
                $l.append('<div class="budget-rule-row" data-idx="' + idx + '"><span class="rule-kw">' + esc(r.keyword) + '</span>' +
                    '<span class="rule-arrow">&rarr;</span><span class="rule-cat">' + esc(catLabel(r.category)) + '</span>' +
                    '<button class="rule-del" title="Delete">&#10005;</button></div>');
            });
            // Show count
            var shown = $l.find('.budget-rule-row').length;
            $find('.budget-rules-count').text(shown + ' / ' + rules.length + ' rules');
        }

        // Rules search input
        var rulesSearchTimer;
        $(document).on('input', '.budget-rules-search', function () {
            var val = $(this).val();
            clearTimeout(rulesSearchTimer);
            rulesSearchTimer = setTimeout(function () { rulesSearch = val; renderRulesManager(); }, 150);
        });

        $(document).on('click', '.budget-rules-add-btn', function () {
            var kw = $.trim($find('.budget-rules-new-keyword').val()),
                cat = $find('.budget-rules-new-cat').val();
            if (!kw) return;
            rules.push({ keyword: kw, category: cat });
            renderRulesManager();
            $find('.budget-rules-new-keyword').val('');
        });
        $(document).on('click', '.rule-del', function () {
            rules.splice($(this).closest('.budget-rule-row').data('idx'), 1);
            renderRulesManager();
        });
        function applyRulesToEntries(cb) {
            var updates = [];
            entries.forEach(function (e) {
                if (e.type !== 'expense') return;
                var newCat = categorise(e.description, e.amount);
                if (newCat !== 'other_expense' && newCat !== e.category) {
                    e.category = newCat;
                    updates.push({ id: e.id, category: newCat });
                }
            });
            if (updates.length === 0) { if (cb) cb(0); return; }
            ajax('recategorise', { updates: JSON.stringify(updates) }, function (r) {
                if (r.success) { render(); if (cb) cb(updates.length); }
                else { showMsg(lang.msg_error_save || 'Save failed', 'error'); loadAll(); }
            });
        }

        $(document).on('click', '.budget-rules-save', function () {
            ajax('save_rules', { rules: JSON.stringify(rules) }, function (r) {
                if (r.success) {
                    // Auto-apply rules to existing transactions after saving
                    applyRulesToEntries(function (count) {
                        var msg = lang.rules_saved || 'Rules saved.';
                        if (count > 0) msg += ' ' + ((lang.rules_update_done || '%d transactions re-categorised.').replace('%d', count));
                        showMsg(msg);
                    });
                }
                else showMsg(lang.msg_error_save || 'Save failed', 'error');
            });
        });

        // ── Auto-detect rules ───────────────────────────────

        $(document).on('click', '.budget-rules-detect', function () {
            var merchants = {};
            entries.forEach(function (e) {
                if (e.type !== 'expense' || !e.description) return;
                var m = e.description.match(/@ (.+?)(?:\s+0\s|$)/);
                var name = m ? m[1].trim() : e.description.replace(/Withdrawal\s*/i, '').replace(/-ACH.*$/i, '').trim();
                name = name.replace(/[#*]\S+/g, '').replace(/\s{2,}/g, ' ').trim();
                if (name.length < 3) return;
                var words = name.split(/\s+/).slice(0, 3).join(' ').toUpperCase();
                if (words.length < 3) return;
                if (!merchants[words]) merchants[words] = { count: 0, totalAmount: 0, cat: e.category || 'other_expense' };
                merchants[words].count++;
                merchants[words].totalAmount += (e.amount || 0);
            });


            var existing = {};
            rules.forEach(function (r) { existing[r.keyword.toUpperCase()] = true; });
            var newR = [];
            Object.keys(merchants).forEach(function (kw) {
                if (merchants[kw].count < 2 || existing[kw]) return;
                var cat = 'other_expense';
                for (var p in guessMap) { if (kw.indexOf(p) !== -1) { cat = guessMap[p]; break; } }
                // Handle gas stations: use average amount to decide
                if (cat === '_gas_station') {
                    var avgAmt = merchants[kw].totalAmount / merchants[kw].count;
                    cat = avgAmt > 50 ? 'gas' : 'dining';
                }
                if (merchants[kw].cat && merchants[kw].cat !== 'other_expense') cat = merchants[kw].cat;
                newR.push({ keyword: kw, category: cat });
            });
            if (newR.length > 0) {
                rules = rules.concat(newR); renderRulesManager();
                showMsg((lang.rules_detected || '%d rules detected.').replace('%d', newR.length));
            } else { showMsg(lang.no_new_rules || 'No new rules detected.', 'error'); }
        });

        // ── Clear all rules ─────────────────────────────────

        $(document).on('click', '.budget-rules-clear', function () {
            if (!confirm(lang.rules_clear_confirm || 'Delete all rules? This cannot be undone.')) return;
            rules = [];
            renderRulesManager();
            ajax('save_rules', { rules: JSON.stringify(rules) }, function (r) {
                if (r.success) showMsg(lang.rules_cleared || 'All rules cleared.');
                else showMsg(lang.msg_error_save || 'Save failed', 'error');
            });
        });

        // ── Re-categorise existing transactions using current rules ──

        $(document).on('click', '.budget-rules-update', function () {
            applyRulesToEntries(function (count) {
                if (count > 0) {
                    showMsg((lang.rules_update_done || '%d transactions re-categorised.').replace('%d', count));
                } else {
                    showMsg(lang.no_recat_needed || 'No transactions needed re-categorising.', 'error');
                }
            });
        });

        // ═══════ CUSTOM CATEGORIES MANAGER ══════════════════

        function renderCustomCatsManager() {
            var $list = $find('.budget-custom-cats-list');
            $list.empty();

            // Show all current categories (defaults + custom) with editable labels
            var allCats = [];
            getAllExpCats().forEach(function (c) { allCats.push({ id: c, type: 'expense' }); });
            getAllIncCats().forEach(function (c) { allCats.push({ id: c, type: 'income' }); });

            allCats.forEach(function (cat, idx) {
                var isCustom = false;
                var label = catLabel(cat.id);
                for (var ci = 0; ci < customCats.length; ci++) {
                    if (customCats[ci].id === cat.id) { isCustom = true; break; }
                }
                var isDefault = defaultExpCats.indexOf(cat.id) !== -1 || defaultIncCats.indexOf(cat.id) !== -1;
                var h = '<div class="budget-custom-cat-row" data-id="' + esc(cat.id) + '">';
                h += '<span class="custom-cat-id">' + esc(cat.id) + '</span>';
                h += '<input type="text" class="custom-cat-label" value="' + esc(label) + '" />';
                h += '<span class="custom-cat-type">' + esc(cat.type) + '</span>';
                if (!isDefault || isCustom) {
                    h += '<button class="custom-cat-del" title="Remove">&times;</button>';
                }
                h += '</div>';
                $list.append(h);
            });
        }

        // Edit a label inline
        $(document).on('change', '.custom-cat-label', function () {
            var $row = $(this).closest('.budget-custom-cat-row');
            var id = $row.data('id');
            var newLabel = $.trim($(this).val());
            if (!newLabel) return;

            // Update or add to customCats
            var found = false;
            for (var i = 0; i < customCats.length; i++) {
                if (customCats[i].id === id) { customCats[i].label = newLabel; found = true; break; }
            }
            if (!found) {
                var type = 'expense';
                if (defaultIncCats.indexOf(id) !== -1) type = 'income';
                customCats.push({ id: id, label: newLabel, type: type });
            }
        });

        // Delete custom category
        $(document).on('click', '.custom-cat-del', function () {
            var id = $(this).closest('.budget-custom-cat-row').data('id');
            customCats = customCats.filter(function (c) { return c.id !== id; });
            renderCustomCatsManager();
        });

        // Add new custom category
        $(document).on('click', '.budget-custom-cats-add-btn', function () {
            var id = $.trim($find('.budget-custom-cats-new-id').val()).toLowerCase().replace(/[^a-z0-9_]/g, '_');
            var label = $.trim($find('.budget-custom-cats-new-label').val());
            var type = $find('.budget-custom-cats-new-type').val();
            if (!id || !label) return;

            // Check for duplicates
            var allIds = getAllExpCats().concat(getAllIncCats());
            if (allIds.indexOf(id) !== -1) {
                showMsg('Category ID "' + id + '" ' + (lang.bp_cat_already_exists || 'already exists') + '.', 'error');
                return;
            }

            customCats.push({ id: id, label: label, type: type });
            $find('.budget-custom-cats-new-id').val('');
            $find('.budget-custom-cats-new-label').val('');
            renderCustomCatsManager();
            rebuildCatSelects();
        });

        // Save custom categories
        $(document).on('click', '.budget-custom-cats-save', function () {
            ajax('save_custom_cats', { custom_cats: JSON.stringify(customCats) }, function (r) {
                if (r.success) {
                    rebuildCatSelects();
                    render();
                    renderBudgetManager();
                    showMsg(lang.custom_cats_saved || 'Categories saved.');
                }
                else showMsg(lang.msg_error_save || 'Save failed', 'error');
            });
        });

        // ═══════ CSV IMPORT ═════════════════════════════════

        var csvRows = [], csvHeaders = [];

        function parseCSV(text) {
            var rows = [], row = [], field = '', inQ = false, i = 0, len = text.length;
            while (i < len) {
                var ch = text[i];
                if (inQ) { if (ch === '"') { if (i + 1 < len && text[i + 1] === '"') { field += '"'; i += 2; } else { inQ = false; i++; } } else { field += ch; i++; } }
                else { if (ch === '"') { inQ = true; i++; } else if (ch === ',') { row.push(field); field = ''; i++; } else if (ch === '\n' || ch === '\r') { row.push(field); field = ''; if (ch === '\r' && i + 1 < len && text[i + 1] === '\n') i++; i++; if (row.length > 0 && !(row.length === 1 && row[0] === '')) rows.push(row); row = []; } else { field += ch; i++; } }
            }
            row.push(field); if (row.length > 0 && !(row.length === 1 && row[0] === '')) rows.push(row);
            return rows;
        }
        function parseMoney(s) { return s ? parseFloat(s.replace(/[$,\s"]/g, '')) || 0 : 0; }

        function populateMapping(headers) {
            var sels = $find('.budget-import-mapping select');
            sels.each(function () { var $s = $(this); $s.find('option:not(:first)').remove(); headers.forEach(function (h, i) { $s.append('<option value="' + i + '">' + esc(h) + '</option>'); }); });
            var lh = headers.map(function (h) { return h.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim(); });
            var am = { 'date': '.budget-map-date', 'post date': '.budget-map-date', 'transaction date': '.budget-map-date', 'description': '.budget-map-description', 'memo': '.budget-map-description', 'payee': '.budget-map-description', 'amount': '.budget-map-amount', 'debit': '.budget-map-debit', 'withdrawal': '.budget-map-debit', 'credit': '.budget-map-credit', 'deposit': '.budget-map-credit', 'type': '.budget-map-txtype' };
            lh.forEach(function (h, i) { if (am[h]) $root.find(am[h]).val(String(i)); });
        }

        function renderPreview(allR, hasH) {
            var $w = $find('.budget-import-preview-table'); $w.empty(); if (allR.length === 0) return;
            var hds = hasH ? allR[0] : allR[0].map(function (_, i) { return 'Column ' + (i + 1); });
            var ds = hasH ? 1 : 0, pr = allR.slice(ds, ds + 5);
            var h = '<table><thead><tr>'; hds.forEach(function (x) { h += '<th>' + esc(x) + '</th>'; }); h += '</tr></thead><tbody>';
            pr.forEach(function (r) { h += '<tr>'; r.forEach(function (c) { h += '<td>' + esc(c) + '</td>'; }); h += '</tr>'; });
            h += '</tbody></table>'; $w.html(h);
        }

        $(document).on('change', '.budget-import-file', function (e) {
            var file = e.target.files[0]; if (!file) return;
            var reader = new FileReader();
            reader.onload = function (ev) {
                try {
                    csvRows = parseCSV(ev.target.result);
                    if (csvRows.length === 0) { showMsg(lang.import_no_data || 'No data', 'error'); return; }
                    var hasH = $find('.budget-import-has-header').is(':checked');
                    csvHeaders = hasH ? csvRows[0] : csvRows[0].map(function (_, i) { return 'Column ' + (i + 1); });
                    populateMapping(csvHeaders); renderPreview(csvRows, hasH);
                    $find('.budget-import-mapping').show();
                    $find('.budget-import-status').text('').removeClass('success error');
                } catch (err) {
                    if (window.console) console.error('Budget import error:', err);
                    showMsg('Error parsing CSV: ' + err.message, 'error');
                }
            }; reader.readAsText(file);
        });
        $(document).on('change', '.budget-import-has-header', function () {
            if (csvRows.length === 0) return; var hasH = $(this).is(':checked');
            csvHeaders = hasH ? csvRows[0] : csvRows[0].map(function (_, i) { return 'Column ' + (i + 1); });
            populateMapping(csvHeaders); renderPreview(csvRows, hasH);
        });

        $(document).on('click', '.budget-btn-import', function () {
            var hasH = $find('.budget-import-has-header').is(':checked'),
                negExp = $find('.budget-import-neg-expense').is(':checked'),
                clearFirst = $find('.budget-import-clear').is(':checked');
            var cDate = $find('.budget-map-date').val(), cDesc = $find('.budget-map-description').val(),
                cAmt = $find('.budget-map-amount').val(), cDeb = $find('.budget-map-debit').val(),
                cCred = $find('.budget-map-credit').val(), cTx = $find('.budget-map-txtype').val();
            if (cDesc === '') { showMsg(lang.msg_error_desc || 'Map Description', 'error'); return; }
            if (cAmt === '' && cDeb === '' && cCred === '') { showMsg(lang.msg_error_amount || 'Map an amount column', 'error'); return; }

            var ds = hasH ? 1 : 0, imp = [];
            for (var i = ds; i < csvRows.length; i++) {
                var row = csvRows[i], desc = cDesc !== '' ? (row[parseInt(cDesc)] || '').trim() : '',
                    dateStr = cDate !== '' ? (row[parseInt(cDate)] || '').trim() : '',
                    txType = cTx !== '' ? (row[parseInt(cTx)] || '').trim().toUpperCase() : '',
                    amount = 0, type = 'expense';
                if (cAmt !== '') { var raw = parseMoney(row[parseInt(cAmt)]); if (negExp) type = raw < 0 ? 'expense' : 'income'; else type = raw > 0 ? 'expense' : 'income'; amount = Math.abs(raw); }
                else { var dv = cDeb !== '' ? parseMoney(row[parseInt(cDeb)]) : 0, cv = cCred !== '' ? parseMoney(row[parseInt(cCred)]) : 0; dv = Math.abs(dv); cv = Math.abs(cv); if (dv > 0) { amount = dv; type = 'expense'; } else if (cv > 0) { amount = cv; type = 'income'; }  }
                if (dateStr) dateStr = normaliseDate(dateStr);
                var cat = type === 'income' ? 'other_income' : categorise(desc, amount);
                if (desc && amount > 0) { var csvRow = { description: desc, amount: amount, type: type, date: dateStr, category: cat, source: 'csv_import' }; if (cTx !== '' && txType) { var txM = mapCcTxType(txType, type); csvRow.type = txM.type; if (txM.ccType) csvRow.cc_type = txM.ccType; } imp.push(csvRow); }
            }
            if (imp.length === 0) { showMsg(lang.import_no_data || 'No valid transactions', 'error'); return; }

            var importAccountRaw = $find('.budget-import-card-select').val() || '';
            var importAccountDec = decodeAccountVal(importAccountRaw);
            var $st = $find('.budget-import-status');
            $st.text('Importing\u2026').removeClass('success error');
            // tag entries with the right field
            if (importAccountDec) {
                imp.forEach(function(e) { e[importAccountDec.field] = importAccountDec.id; });
            }
            ajax('import', { entries: JSON.stringify(imp), clear_first: clearFirst ? '1' : '0',
                clear_account_id: importAccountDec ? importAccountDec.id : '',
                clear_account_field: importAccountDec ? importAccountDec.field : '',
                skip_dupes: '1' }, function (r) {
                if (r.success) {
                    var parts = [];
                    if (r.imported > 0) parts.push(r.imported + ' imported');
                    if (r.dupes > 0) parts.push(r.dupes + ' duplicates skipped');
                    if (r.skipped > 0) parts.push(r.skipped + ' invalid skipped');
                    var msg = parts.join(', ') || 'No new transactions to import.';
                    $st.text(msg).addClass('success'); showMsg(msg); loadAll();
                } else {
                    var em = (lang.import_error || 'Import failed: %s').replace('%s', r.error || '');
                    $st.text(em).addClass('error'); showMsg(em, 'error');
                }
            });
        });

        // ── Import tab switching ─────────────────────────────
        $(document).on('click', '.budget-import-tab', function () {
            var tab = $(this).data('tab');
            var $panel = $(this).closest('.budget-import-body');
            $panel.find('.budget-import-tab').removeClass('budget-import-tab-active');
            $(this).addClass('budget-import-tab-active');
            $panel.find('.budget-import-tab-panel').hide();
            $panel.find('.budget-import-tab-panel[data-tab="' + tab + '"]').show();
        });

        // ── PDF import ───────────────────────────────────────
        var PDFJS_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
        var PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        var pdfRows = []; // detected transaction rows

        function loadPdfJs(cb) {
            if (window.pdfjsLib) { cb(); return; }
            var s = document.createElement('script');
            s.src = PDFJS_CDN;
            s.onload = function () {
                window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
                cb();
            };
            s.onerror = function () {
                $root.find('.budget-pdf-status').text('Failed to load PDF library. Check network connection.').css('color', '#dc3545');
            };
            document.head.appendChild(s);
        }

        /**
         * Extract all text items from all pages of a PDF, grouped by page.
         * Returns an array of page-text strings.
         */
        function extractPdfText(arrayBuffer, onDone, onError) {
            loadPdfJs(function () {
                window.pdfjsLib.getDocument({ data: arrayBuffer }).promise.then(function (pdf) {
                    var pagePromises = [];
                    for (var p = 1; p <= pdf.numPages; p++) {
                        pagePromises.push(pdf.getPage(p).then(function (page) {
                            return page.getTextContent().then(function (tc) {
                                // Sort items by Y (top-to-bottom) then X (left-to-right)
                                var items = tc.items.slice().sort(function (a, b) {
                                    var dy = b.transform[5] - a.transform[5];
                                    return Math.abs(dy) > 2 ? dy : a.transform[4] - b.transform[4];
                                });
                                // Group into logical lines by Y position
                                var lines = [], curY = null, curLine = [];
                                items.forEach(function (it) {
                                    var y = Math.round(it.transform[5]);
                                    if (curY === null) curY = y;
                                    if (Math.abs(y - curY) > 4) {
                                        if (curLine.length) lines.push(curLine.join(' ').trim());
                                        curLine = []; curY = y;
                                    }
                                    var t = (it.str || '').trim();
                                    if (t) curLine.push(t);
                                });
                                if (curLine.length) lines.push(curLine.join(' ').trim());
                                return lines.join('\n');
                            });
                        }));
                    }
                    Promise.all(pagePromises).then(function (pages) {
                        onDone(pages, pdf.numPages);
                    });
                }).catch(onError);
            });
        }

        /**
         * Parse raw PDF text lines into transaction rows.
         * Strategy: look for lines that contain a date-like pattern AND a dollar amount.
         * Handles common CC statement formats (date at start or end, amounts with/without $).
         */
        function parsePdfTransactions(pages, negExpense) {
            // Patterns for dates: MM/DD, MM/DD/YY, MM/DD/YYYY, MMM DD, DD MMM YYYY etc.
            var DATE_RE = /\b(\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?|\d{4}-\d{2}-\d{2}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2}(?:,?\s*\d{4})?)\b/i;
            // Pattern for dollar amounts (with or without $, possibly negative, commas ok)
            var AMT_RE  = /(?<!\w)[-\u2212]?\$?\s*(\d{1,3}(?:,\d{3})*|\d+)(\.\d{2})(?!\d)/g;

            var rows = [];
            pages.forEach(function (pageText) {
                var lines = pageText.split('\n');
                lines.forEach(function (line) {
                    line = line.trim();
                    if (!line) return;

                    var dateMatch = DATE_RE.exec(line);
                    if (!dateMatch) return;

                    // Find all amounts on this line
                    var amounts = [];
                    var m;
                    AMT_RE.lastIndex = 0;
                    while ((m = AMT_RE.exec(line)) !== null) {
                        var raw = m[0].replace(/[\$,\s]/g, '').replace('\u2212', '-');
                        var val = parseFloat(raw);
                        if (!isNaN(val) && Math.abs(val) > 0) amounts.push(val);
                    }
                    if (amounts.length === 0) return;

                    // Use the last amount (most CC statements put the charge amount last)
                    var rawAmt = amounts[amounts.length - 1];
                    var amount = Math.abs(rawAmt);

                    // Determine type: check for CC-specific keywords in the raw line first,
                    // then fall back to sign-based detection (neg-expense checkbox).
                    var type, ccType = '';
                    var lineUpper = line.toUpperCase();
                    if (/\bPURCHASE\b/.test(lineUpper))     { type = 'expense'; ccType = 'Purchase'; }
                    else if (/\bINTEREST\b/.test(lineUpper)) { type = 'expense'; ccType = 'Interest'; }
                    else if (/\bFEE\b/.test(lineUpper))      { type = 'expense'; ccType = 'Fee';      }
                    else if (/\bCHARGE\b/.test(lineUpper))   { type = 'expense'; ccType = 'Purchase'; }
                    else if (/\bPAYMENT\b/.test(lineUpper))  { type = 'income';  ccType = 'Payment';  }
                    else if (/\bREFUND\b|\bRETURN\b/.test(lineUpper)) { type = 'income'; ccType = 'Refund'; }
                    else if (/\bCREDIT\b/.test(lineUpper))   { type = 'income';  ccType = 'Credit';   }
                    else if (/\bDEBIT\b/.test(lineUpper))    { type = 'expense'; ccType = 'Debit';    }
                    else if (negExpense) {
                        type = rawAmt < 0 ? 'expense' : 'income';
                    } else {
                        type = rawAmt > 0 ? 'expense' : 'income';
                    }

                    // Description: strip the date and the matched amount from the line
                    var desc = line
                        .replace(dateMatch[0], '')
                        .replace(AMT_RE, '')
                        .replace(/\s{2,}/g, ' ')
                        .replace(/^[\s\-–—|]+|[\s\-–—|]+$/g, '')
                        .trim();
                    if (!desc) desc = '(unknown)';

                    var dateStr = normaliseDate(dateMatch[1]);

                    var pdfRow = { date: dateStr, description: desc, amount: amount, type: type, _raw: line }; if (ccType) pdfRow.cc_type = ccType; rows.push(pdfRow);
                });
            });
            return rows;
        }

        function renderPdfPreview($body, rows) {
            pdfRows = rows;
            var $tbody = $body.find('.budget-pdf-preview-tbody').empty();
            rows.forEach(function (r, i) {
                var typeLabel = r.cc_type ? esc(r.cc_type) : (r.type === 'income'
                    ? esc(lang.lbl_income || 'Income')
                    : esc(lang.lbl_expense || 'Expense'));
                var badge = r.type === 'income' ? 'badge-income' : 'badge-expense';
                var h = '<tr data-idx="' + i + '">';
                h += '<td><input type="checkbox" class="budget-pdf-row-cb" checked="checked" /></td>';
                h += '<td>' + esc(r.date) + '</td>';
                h += '<td class="pdf-desc-cell">' + esc(r.description) + '</td>';
                h += '<td>' + esc(fmt(r.amount)) + '</td>';
                h += '<td><span class="budget-type-badge ' + badge + '">' + typeLabel + '</span></td>';
                h += '<td class="pdf-file-cell" title="' + esc(r._file || '') + '">' + esc(r._fileShort || '') + '</td>';
                h += '</tr>';
                $tbody.append(h);
            });
        }

        $(document).on('change', '.budget-pdf-file', function (e) {
            var files = Array.prototype.slice.call(e.target.files);
            if (!files.length) return;
            var $body = $(this).closest('.budget-import-body');
            var $status = $body.find('.budget-pdf-status');
            var $results = $body.find('.budget-pdf-results');
            $results.hide();
            pdfRows = [];

            var negExp = $body.find('.budget-pdf-neg-expense').is(':checked');
            var allRows = [];
            var errors = [];

            function shortName(name) {
                return name.length > 22 ? name.substring(0, 10) + '…' + name.slice(-9) : name;
            }

            function processNext(idx) {
                if (idx >= files.length) {
                    if (allRows.length === 0) {
                        var errMsg = lang.import_pdf_no_data || 'No transactions found.';
                        if (errors.length) errMsg += ' Errors: ' + errors.join('; ');
                        $status.text(errMsg).css('color', '#dc3545');
                        return;
                    }
                    var msg = (lang.import_pdf_found_batch || '%d transactions detected from %d file(s). Deselect any rows you do not want to import.')
                        .replace('%d', allRows.length).replace('%d', files.length);
                    if (errors.length) msg += ' (' + errors.length + ' file(s) had errors)';
                    $status.text(msg).css('color', errors.length ? '#fd7e14' : '');
                    $body.find('.budget-pdf-summary').text('');
                    renderPdfPreview($body, allRows);
                    $results.show();
                    return;
                }
                var file = files[idx];
                var statusMsg = (lang.import_pdf_parsing_batch || 'Reading %d of %d: %s…')
                    .replace('%d', idx + 1).replace('%d', files.length).replace('%s', shortName(file.name));
                $status.text(statusMsg).css('color', '');
                var reader = new FileReader();
                reader.onload = function (ev) {
                    extractPdfText(ev.target.result, function (pages) {
                        var rows = parsePdfTransactions(pages, negExp);
                        rows.forEach(function (r) {
                            r._file = file.name;
                            r._fileShort = shortName(file.name);
                        });
                        allRows = allRows.concat(rows);
                        processNext(idx + 1);
                    }, function (err) {
                        errors.push(file.name + ': ' + (err && err.message ? err.message : String(err)));
                        processNext(idx + 1);
                    });
                };
                reader.readAsArrayBuffer(file);
            }

            loadPdfJs(function () { processNext(0); });
        });

        // Re-parse if neg-expense toggle changes
        $(document).on('change', '.budget-pdf-card-select', function () {
            var $body = $(this).closest('.budget-import-body');
            var raw = $(this).val() || '';
            var isCc = raw.indexOf('cc:') === 0;
            // CC statements use positive = expense; uncheck "negative = expense" for CC accounts
            $body.find('.budget-pdf-neg-expense').prop('checked', !isCc);
            // Re-run preview with the updated setting if rows are already loaded
            if (pdfRows && pdfRows.length > 0) {
                var negExp = !isCc;
                pdfRows = parsePdfTransactions(pdfRows.map(function(r){ return r._raw || ''; }), negExp);
                renderPdfPreview($body, pdfRows);
            }
        });

        $(document).on('change', '.budget-pdf-neg-expense', function () {
            if (!pdfRows.length) return;
            var negExp = $(this).is(':checked');
            pdfRows.forEach(function (r) {
                if (r._origNeg !== undefined) {
                    r.type = negExp ? (r._origNeg ? 'expense' : 'income') : (r._origNeg ? 'income' : 'expense');
                }
            });
            var $body = $(this).closest('.budget-import-body');
            renderPdfPreview($body, pdfRows);
        });

        // Select / deselect all
        $(document).on('change', '.budget-pdf-check-all', function () {
            $(this).closest('.budget-pdf-preview-wrap').find('.budget-pdf-row-cb').prop('checked', $(this).is(':checked'));
        });

        $(document).on('click', '.budget-btn-pdf-import', function () {
            var $body = $(this).closest('.budget-import-body');
            var $st = $body.find('.budget-pdf-import-status').text('').removeClass('success error');
            var skipDupes = $body.find('.budget-pdf-skip-dupes').is(':checked');
            var importCardRaw = $body.find('.budget-pdf-card-select').val() || '';
            var importCardDec = decodeAccountVal(importCardRaw);

            // Collect only checked rows
            var imp = [];
            $body.find('.budget-pdf-preview-tbody tr').each(function () {
                if (!$(this).find('.budget-pdf-row-cb').is(':checked')) return;
                var idx = parseInt($(this).data('idx'), 10);
                var r = pdfRows[idx];
                if (!r) return;
                // Use cc_type for smarter category assignment:
                // Only use 'other_income' for genuine CC income types; run categorise() for everything else
                var cat;
                if (r.cc_type === 'Payment' || r.cc_type === 'Refund' || r.cc_type === 'Credit') {
                    cat = 'other_income';
                } else if (r.type === 'income' && !r.cc_type) {
                    cat = 'other_income';
                } else {
                    cat = categorise(r.description, r.amount);
                }
                var pdfImp = { description: r.description, amount: r.amount, type: r.type, date: r.date, category: cat, source: 'pdf_import' }; if (r.cc_type) pdfImp.cc_type = r.cc_type; imp.push(pdfImp);
            });

            if (imp.length === 0) { showMsg(lang.import_no_data || 'No rows selected.', 'error'); return; }

            $st.text('Importing…');
            // tag entries with the right field
            if (importCardDec) {
                imp.forEach(function(e) { e[importCardDec.field] = importCardDec.id; });
            }
            ajax('import', { entries: JSON.stringify(imp), clear_first: '0',
                clear_account_id: importCardDec ? importCardDec.id : '',
                clear_account_field: importCardDec ? importCardDec.field : '',
                skip_dupes: skipDupes ? '1' : '0' }, function (r) {
                if (r.success) {
                    var parts = [];
                    if (r.imported > 0) parts.push(r.imported + ' imported');
                    if (r.dupes > 0) parts.push(r.dupes + ' duplicates skipped');
                    if (r.skipped > 0) parts.push(r.skipped + ' invalid skipped');
                    var msg = parts.join(', ') || 'No new transactions.';
                    $st.text(msg).addClass('success'); showMsg(msg); loadAll();
                } else {
                    var em = (lang.import_error || 'Import failed: %s').replace('%s', r.error || '');
                    $st.text(em).addClass('error'); showMsg(em, 'error');
                }
            });
        });

        function normaliseDate(str) {
            str = str.trim();
            // Already ISO
            if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
            // Named month (e.g. "Jan 15", "January 15, 2024")
            var d = new Date(str);
            if (!isNaN(d.getTime()) && /[a-zA-Z]/.test(str)) {
                return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
            }
            var p = str.split(/[\/\-\.]/);
            if (p.length === 3) {
                var a = parseInt(p[0], 10), b = parseInt(p[1], 10), c = parseInt(p[2], 10);
                if (p[0].length === 4) return p[0] + '-' + ('0' + b).slice(-2) + '-' + ('0' + c).slice(-2);
                if (c < 100) c += 2000;
                return c + '-' + ('0' + a).slice(-2) + '-' + ('0' + b).slice(-2);
            }
            // MM/DD with no year — common in CC statements. Infer year: use current year
            // unless that puts the date in the future, in which case use previous year.
            if (p.length === 2) {
                var mm = parseInt(p[0], 10), dd = parseInt(p[1], 10);
                if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
                    var now = new Date(), yr = now.getFullYear();
                    var candidate = new Date(yr, mm - 1, dd);
                    // If the candidate date is more than 7 days in the future, assume prior year
                    var cutoff = new Date(); cutoff.setDate(cutoff.getDate() + 7);
                    if (candidate > cutoff) yr--;
                    return yr + '-' + ('0' + mm).slice(-2) + '-' + ('0' + dd).slice(-2);
                }
            }
            return str;
        }

        // ── Init ────────────────────────────────────────────
        loadAll();

        // ═══════ CREDIT CARDS ════════════════════════════════

        // ── Helper: get card name from id ───────────────────
        function cardNameById(cardId) {
            for (var i = 0; i < creditCards.length; i++) {
                if (creditCards[i].id === cardId) {
                    return creditCards[i].name + (creditCards[i].last4 ? ' \u2026' + creditCards[i].last4 : '');
                }
            }
            return '';
        }

        function acctNameById(acctId) {
            for (var i = 0; i < bankAccounts.length; i++) {
                if (bankAccounts[i].id === acctId) {
                    return bankAccounts[i].name + (bankAccounts[i].last4 ? ' \u2026' + bankAccounts[i].last4 : '');
                }
            }
            return '';
        }

        // Returns the account badge HTML for any entry.
        // CC entries: credit card icon + card name
        // Bank account entries: bank icon + account name
        // Untagged: empty string
        function entryAccountBadge(e) {
            if (e.card_id) {
                var name = cardNameById(e.card_id);
                if (!name) return '';
                return '<span class="entry-card-badge" title="' + esc(name) + '">\uD83D\uDCB3</span>';
            }
            if (e.account_id) {
                var aname = acctNameById(e.account_id);
                if (!aname) return '';
                return '<span class="entry-acct-badge" title="' + esc(aname) + '">\uD83C\uDFE6</span>';
            }
            return '';
        }

        // ── Compute stats for a single card ─────────────────
        //
        // outstanding = sum of expenses tagged to card - sum of income (payments) tagged to card
        // thisMonthCharged = expenses tagged to card in current YYYY-MM
        // Record income entries against a card to represent payments made.

        function getCardStats(cardId) {
            var now = new Date();
            var curYM = now.getFullYear() + '-' + ('0' + (now.getMonth() + 1)).slice(-2);
            var totalCharged = 0, totalPayments = 0, thisMonthCharged = 0, txnCount = 0;

            entries.forEach(function (e) {
                if ((e.card_id || '') !== cardId) return;
                txnCount++;
                if (e.type === 'expense') {
                    totalCharged += e.amount;
                    if (e.date && e.date.substring(0, 7) === curYM) thisMonthCharged += e.amount;
                } else if (e.type === 'income') {
                    totalPayments += e.amount;
                }
            });

            var outstanding = Math.max(0, totalCharged - totalPayments);
            return {
                totalCharged: totalCharged,
                totalPayments: totalPayments,
                outstanding: outstanding,
                thisMonth: thisMonthCharged,
                txnCount: txnCount
            };
        }

        // ── Render the compact CC strip above the dashboard ──
        function renderCcStrip() {
            var $strip = $root.find('.budget-cc-strip');
            if (creditCards.length === 0) { $strip.hide(); return; }
            $strip.empty().show();

            creditCards.forEach(function (card) {
                var stats = getCardStats(card.id);
                var limit = card.limit || 0;
                var pct = limit > 0 ? Math.min(100, (stats.outstanding / limit) * 100) : 0;
                var cls = pct >= 90 ? 'cc-strip-danger' : (pct >= 70 ? 'cc-strip-warn' : 'cc-strip-ok');
                var available = limit > 0 ? Math.max(0, limit - stats.outstanding) : null;
                var cardLabel = esc(card.name) + (card.last4 ? ' &hellip;' + esc(card.last4) : '');

                var h = '<div class="cc-strip-card ' + cls + '" data-card-id="' + esc(card.id) + '" title="Click to filter transactions to this card">';
                h += '<div class="cc-strip-name">' + cardLabel + '</div>';
                h += '<div class="cc-strip-nums">';
                if (limit > 0) {
                    h += '<span class="cc-strip-outstanding">' + fmt(stats.outstanding) + '</span>';
                    h += '<span class="cc-strip-sep"> / </span>';
                    h += '<span class="cc-strip-limit">' + fmt(limit) + '</span>';
                } else {
                    h += '<span class="cc-strip-outstanding">' + fmt(stats.outstanding) + '</span>';
                    h += '<span class="cc-strip-sep"> owed</span>';
                }
                h += '</div>';
                if (limit > 0) {
                    h += '<div class="cc-strip-bar"><div class="cc-strip-fill" style="width:' + pct.toFixed(1) + '%"></div></div>';
                    h += '<div class="cc-strip-avail">' + fmt(available) + ' available &bull; ' + pct.toFixed(0) + '% used</div>';
                }
                if (stats.thisMonth > 0) {
                    h += '<div class="cc-strip-month">' + fmt(stats.thisMonth) + ' this month</div>';
                }
                h += '</div>';
                $strip.append(h);
            });

            // "No card" chip if card filter active
            if (cardFilter) {
                $strip.find('.cc-strip-card').each(function () {
                    var id = $(this).data('card-id');
                    $(this).toggleClass('cc-strip-selected', id === cardFilter);
                });
            }
        }

        // Click a card strip chip to filter table
        $root.on('click', '.cc-strip-card', function () {
            var id = $(this).data('card-id');
            if (cardFilter === id) {
                cardFilter = '';
            } else {
                cardFilter = id;
            }
            // Sync dropdown: find the prefixed option value matching the bare cardFilter id
            var dropVal = '';
            if (cardFilter) {
                creditCards.forEach(function(cc) { if (cc.id === cardFilter) dropVal = 'cc:' + cc.id; });
                if (!dropVal) bankAccounts.forEach(function(a) { if (a.id === cardFilter) dropVal = 'ba:' + a.id; });
            }
            $root.find('.search-card-filter').val(dropVal);
            tlSelectedMonth = null; tlSelectedDay = null;
            renderCcStrip();
            render();
        });

        // ── Render account selectors (add form, import form, search) ──
        function renderCreditCardSelectors() {
            var hasCards = creditCards.length > 0;
            var hasAnyAccounts = creditCards.length > 0 || bankAccounts.length > 0;

            function populateAccountSelect($sel, noneLabel) {
                $sel.empty();
                $sel.append('<option value="">' + esc(noneLabel) + '</option>');
                if (bankAccounts.length > 0) {
                    var $baGrp = $('<optgroup>').attr('label', lang.ba_title || 'Bank Accounts');
                    bankAccounts.forEach(function (a) {
                        var typeLabel = { checking: lang.ba_type_checking || 'Checking', savings: lang.ba_type_savings || 'Savings', other: lang.ba_type_other || 'Other' }[a.type] || a.type;
                        var label = a.name + (a.last4 ? ' \u2026' + a.last4 : '') + ' (' + typeLabel + ')';
                        $baGrp.append($('<option>').val('ba:' + a.id).text(label));
                    });
                    $sel.append($baGrp);
                }
                if (creditCards.length > 0) {
                    var $ccGrp = $('<optgroup>').attr('label', lang.cc_title || 'Credit Cards');
                    creditCards.forEach(function (c) {
                        var label = c.name + (c.last4 ? ' \u2026' + c.last4 : '');
                        $ccGrp.append($('<option>').val('cc:' + c.id).text(label));
                    });
                    $sel.append($ccGrp);
                }
            }

            // Add form account selector
            var $addCard = $find('.budget-input-card');
            if (hasAnyAccounts) {
                populateAccountSelect($addCard, lang.cc_tag_add || 'No account');
                $addCard.show();
            } else {
                $addCard.hide();
            }

            // Import account selector (CSV)
            var $impCard = $find('.budget-import-card-select');
            var $impRow = $find('.budget-import-card-row');
            if (hasAnyAccounts) {
                populateAccountSelect($impCard, lang.cc_tag_none || '-- No account --');
                $impRow.show();
            } else {
                $impRow.hide();
            }

            // PDF Import account selector
            var $pdfCard = $find('.budget-pdf-card-select');
            var $pdfRow = $find('.budget-pdf-card-row');
            if (hasAnyAccounts) {
                populateAccountSelect($pdfCard, lang.cc_tag_none || '-- No account --');
                $pdfRow.show();
                // Auto-set neg-expense based on whether a CC is selected
                var pdfSelRaw = $pdfCard.val() || '';
                $pdfCard.closest('.budget-import-body').find('.budget-pdf-neg-expense').prop('checked', pdfSelRaw.indexOf('cc:') !== 0);
            } else {
                $pdfRow.hide();
            }

            // Search account filter — shows ALL accounts (bank + CC) under one dropdown
            var $cardFilter = $root.find('.search-card-filter');
            var hasAnyAccounts = creditCards.length > 0 || bankAccounts.length > 0;
            if (hasAnyAccounts) {
                $cardFilter.empty();
                $cardFilter.append('<option value="">' + esc(lang.cc_filter_all || 'All Accounts') + '</option>');
                if (bankAccounts.length > 0) {
                    var $baGrp = $('<optgroup>').attr('label', lang.ba_title || 'Bank Accounts');
                    bankAccounts.forEach(function (a) {
                        var typeLabel = { checking: lang.ba_type_checking || 'Checking', savings: lang.ba_type_savings || 'Savings', other: lang.ba_type_other || 'Other' }[a.type] || a.type;
                        var label = a.name + (a.last4 ? ' \u2026' + a.last4 : '') + ' (' + typeLabel + ')';
                        $baGrp.append($('<option>').val(a.id).text(label));
                    });
                    $cardFilter.append($baGrp);
                }
                if (creditCards.length > 0) {
                    var $ccGrp = $('<optgroup>').attr('label', lang.cc_title || 'Credit Cards');
                    creditCards.forEach(function (c) {
                        var label = c.name + (c.last4 ? ' \u2026' + c.last4 : '');
                        $ccGrp.append($('<option>').val(c.id).text(label));
                    });
                    $cardFilter.append($ccGrp);
                }
                // Restore current selection after rebuild — fixes the stuck-filter bug.
                // cardFilter holds a bare id; dropdown options use cc:/ba: prefixes, so find the right value.
                if (cardFilter) {
                    var prefixedVal = '';
                    bankAccounts.forEach(function(a) { if (a.id === cardFilter) prefixedVal = 'ba:' + a.id; });
                    if (!prefixedVal) creditCards.forEach(function(cc) { if (cc.id === cardFilter) prefixedVal = 'cc:' + cc.id; });
                    $cardFilter.val(prefixedVal || '');
                } else {
                    $cardFilter.val('');
                }
                $cardFilter.show();
            } else {
                $cardFilter.hide().val('');
                cardFilter = '';
            }
        }

        // Account filter in search row — decode cc:/ba: prefix, store bare id in cardFilter
        $root.on('change', '.search-card-filter', function () {
            var raw = $(this).val();
            var dec = decodeAccountVal(raw);
            cardFilter = dec ? dec.id : '';
            tlSelectedMonth = null; tlSelectedDay = null;
            renderCcStrip();
            render();
        });

        // ── Render the full credit cards panel ───────────────
        function renderCreditCardsPanel($body) {
            if (!$body || !$body.length) {
                // Find within the open editor window
                $body = $find('.budget-cards-body');
            }
            if (!$body.length) return;

            var now = new Date();
            var curYM = now.getFullYear() + '-' + ('0' + (now.getMonth() + 1)).slice(-2);

            // ── Card summary cards ──
            var $list = $body.find('.budget-cards-list');
            $list.empty();

            if (creditCards.length === 0) {
                $list.html('<p class="cc-no-cards">' + esc(lang.cc_no_cards || 'No credit cards configured. Add a card below to start tracking.') + '</p>');
            } else {
                creditCards.forEach(function (card, idx) {
                    var stats = getCardStats(card.id);
                    var limit = card.limit || 0;
                    var outstanding = stats.outstanding;
                    var available = limit > 0 ? Math.max(0, limit - outstanding) : null;
                    var utilPct = limit > 0 ? Math.min(100, (outstanding / limit) * 100) : 0;
                    var utilCls = utilPct >= 90 ? 'cc-util-danger' : (utilPct >= 70 ? 'cc-util-warn' : 'cc-util-ok');
                    var cardLabel = esc(card.name) + (card.last4 ? ' &hellip;' + esc(card.last4) : '');

                    var h = '<div class="cc-card-row" data-idx="' + idx + '">';
                    h += '<div class="cc-card-header">';
                    h += '<span class="cc-card-icon">&#128179;</span>';
                    h += '<span class="cc-card-name">' + cardLabel + '</span>';
                    if (canEdit) {
                        h += '<button class="cc-delete-btn" data-idx="' + idx + '" title="Remove card">&times;</button>';
                    }
                    h += '</div>';

                    h += '<div class="cc-card-stats">';
                    // Outstanding
                    h += '<div class="cc-stat">';
                    h += '<div class="cc-stat-label">' + esc(lang.cc_outstanding || 'Outstanding') + '</div>';
                    h += '<div class="cc-stat-val cc-outstanding">' + fmt(outstanding) + '</div>';
                    h += '</div>';
                    // Available / Limit
                    if (limit > 0) {
                        h += '<div class="cc-stat">';
                        h += '<div class="cc-stat-label">' + esc(lang.cc_available || 'Available') + '</div>';
                        h += '<div class="cc-stat-val cc-available">' + fmt(available) + '</div>';
                        h += '</div>';
                        h += '<div class="cc-stat">';
                        h += '<div class="cc-stat-label">' + esc(lang.cc_limit || 'Limit') + '</div>';
                        h += '<div class="cc-stat-val">' + fmt(limit) + '</div>';
                        h += '</div>';
                    }
                    // This month
                    h += '<div class="cc-stat">';
                    h += '<div class="cc-stat-label">' + esc(lang.cc_this_month || 'This Month') + '</div>';
                    h += '<div class="cc-stat-val">' + fmt(stats.thisMonth) + '</div>';
                    h += '</div>';
                    // Payments
                    if (stats.totalPayments > 0) {
                        h += '<div class="cc-stat">';
                        h += '<div class="cc-stat-label">' + esc(lang.cc_payments || 'Payments') + '</div>';
                        h += '<div class="cc-stat-val cc-payments">' + fmt(stats.totalPayments) + '</div>';
                        h += '</div>';
                    }
                    // All-time charged
                    h += '<div class="cc-stat">';
                    h += '<div class="cc-stat-label">' + esc(lang.cc_charged || 'All-time Charged') + '</div>';
                    h += '<div class="cc-stat-val">' + fmt(stats.totalCharged) + '</div>';
                    h += '</div>';
                    h += '</div>'; // .cc-card-stats

                    // Utilization bar (only if limit set)
                    if (limit > 0) {
                        h += '<div class="cc-util-bar-wrap">';
                        h += '<div class="cc-util-bar">';
                        h += '<div class="cc-util-fill ' + utilCls + '" style="width:' + utilPct.toFixed(1) + '%" title="' + utilPct.toFixed(1) + '% utilization"></div>';
                        h += '</div>';
                        h += '<div class="cc-util-label">';
                        h += '<span class="' + utilCls + '">' + utilPct.toFixed(1) + '% utilized</span>';
                        h += '</div>';
                        h += '</div>';
                    }

                    // Transaction count + filter link
                    h += '<div class="cc-card-footer">';
                    h += '<span class="cc-txn-count">' + stats.txnCount + ' transaction' + (stats.txnCount !== 1 ? 's' : '') + '</span>';
                    h += '<button class="cc-view-txns button" data-card-id="' + esc(card.id) + '">' + esc(lang.cc_view_txns || 'View Transactions') + '</button>';
                    h += '</div>';

                    // Payment hint
                    h += '<div class="cc-payment-hint">' + esc(lang.cc_payment_hint || 'Record a payment by adding an Income transaction tagged to this card.') + '</div>';

                    // Inline edit
                    if (canEdit) {
                        h += '<div class="cc-card-edit">';
                        h += '<label>' + esc(lang.cc_name || 'Name') + ' <input type="text" class="cc-edit-name" value="' + esc(card.name) + '" /></label>';
                        h += '<label>' + esc(lang.cc_limit || 'Limit') + ' <input type="number" class="cc-edit-limit" step="0.01" min="0" value="' + (card.limit || 0) + '" /></label>';
                        h += '<label>' + esc(lang.cc_last4 || 'Last 4') + ' <input type="text" class="cc-edit-last4" maxlength="4" value="' + esc(card.last4 || '') + '" /></label>';
                        h += '</div>';
                    }

                    h += '</div>'; // .cc-card-row
                    $list.append(h);
                });
            }
        }

        // View card transactions — closes panel, applies card filter to table
        $(document).on('click', '.cc-view-txns', function () {
            var cardId = $(this).data('card-id');
            cardFilter = cardId;
            $root.find('.search-card-filter').val('cc:' + cardId);
            tlSelectedMonth = null; tlSelectedDay = null;
            renderCcStrip();
            render();
            // Close the Cards panel window if open
            if (openEditorWins['cards']) {
                openEditorWins['cards'].find('.detail-win-close').trigger('click');
            }
        });

        // Delete card
        $(document).on('click', '.cc-delete-btn', function () {
            var idx = parseInt($(this).data('idx'));
            if (!confirm('Remove this card? Transactions tagged to it will keep their card tag in the data, but the card will no longer appear in the tracker.')) return;
            creditCards.splice(idx, 1);
            ajax('save_credit_cards', { credit_cards: JSON.stringify(creditCards) }, function (r) {
                if (r.success) {
                    if (r.credit_cards) creditCards = r.credit_cards;
                    renderCreditCardSelectors();
                    renderCcStrip();
                    renderCreditCardsPanel($find('.budget-cards-body'));
                    renderBankAccountsSection($find('.budget-cards-body'));
                    showMsg(lang.cc_deleted || 'Card removed.');
                } else {
                    showMsg(lang.msg_error_save || 'Save failed', 'error');
                }
            });
        });

        // Add new card
        $(document).on('click', '.cc-add-btn', function () {
            var name = $.trim($find('.cc-new-name').val());
            var limit = parseFloat($find('.cc-new-limit').val()) || 0;
            var last4 = $.trim($find('.cc-new-last4').val()).replace(/[^0-9]/g, '').slice(-4);
            if (!name) { showMsg('Enter a card name.', 'error'); return; }

            // Generate id from name
            var id = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 32);
            if (!id) id = 'card_' + Date.now();
            // Ensure unique id
            var existing = creditCards.map(function (c) { return c.id; });
            if (existing.indexOf(id) !== -1) id = id + '_' + Date.now();

            creditCards.push({ id: id, name: name, limit: limit, last4: last4 });
            $find('.cc-new-name').val('');
            $find('.cc-new-limit').val('');
            $find('.cc-new-last4').val('');
            renderCreditCardsPanel($find('.budget-cards-body'));
        });

        // Save all cards (including inline edits)
        $(document).on('click', '.cc-save-btn', function () {
            // Read back any inline edits first
            $find('.cc-card-row').each(function () {
                var idx = parseInt($(this).data('idx'));
                if (!creditCards[idx]) return;
                var nameVal = $.trim($(this).find('.cc-edit-name').val());
                var limitVal = parseFloat($(this).find('.cc-edit-limit').val()) || 0;
                var last4Val = $(this).find('.cc-edit-last4').val().replace(/[^0-9]/g, '').slice(-4);
                if (nameVal) creditCards[idx].name = nameVal;
                creditCards[idx].limit = limitVal;
                creditCards[idx].last4 = last4Val;
            });

            ajax('save_credit_cards', { credit_cards: JSON.stringify(creditCards) }, function (r) {
                if (r.success) {
                    if (r.credit_cards) creditCards = r.credit_cards;
                    renderCreditCardSelectors();
                    renderCcStrip();
                    renderCreditCardsPanel($find('.budget-cards-body'));
                    renderBankAccountsSection($find('.budget-cards-body'));
                    showMsg(lang.cc_saved || 'Credit cards saved.');
                } else {
                    showMsg(lang.msg_error_save || 'Save failed', 'error');
                }
            });
        });

        // ── Bank account management ──────────────────────────

        function renderBankAccountsSection($body) {
            if (!$body || !$body.length) $body = $find('.budget-cards-body');
            if (!$body.length) return;
            var $section = $body.find('.ba-section');
            if (!$section.length) return;
            $section.empty();

            // Header
            var h = '<h3 class="cc-panel-heading">' + esc(lang.ba_title || 'Bank Accounts') + '</h3>';
            h += '<p class="cc-help-text">' + esc(lang.ba_help || 'Tag transactions to a bank account to filter and track them separately.') + '</p>';

            // Existing accounts
            if (bankAccounts.length === 0) {
                h += '<p class="cc-no-cards">' + esc(lang.ba_no_accounts || 'No bank accounts added yet.') + '</p>';
            } else {
                bankAccounts.forEach(function (acct, idx) {
                    var typeLabel = { checking: lang.ba_type_checking || 'Checking', savings: lang.ba_type_savings || 'Savings', other: lang.ba_type_other || 'Other' }[acct.type] || acct.type;
                    var acctLabel = esc(acct.name) + (acct.last4 ? ' &hellip;' + esc(acct.last4) : '') + ' <small style="opacity:0.6;">(' + esc(typeLabel) + ')</small>';
                    var untaggedCount = entries.filter(function(e) { return !e.card_id && !e.account_id; }).length;
                    h += '<div class="ba-account-row" data-idx="' + idx + '">';
                    h += '<span class="ba-account-icon">&#127974;</span>';
                    h += '<span class="ba-account-name">' + acctLabel + '</span>';
                    if (canEdit) {
                        h += '<button class="ba-delete-btn" data-idx="' + idx + '" title="Remove">&times;</button>';
                        h += '<button class="ba-view-txns" data-account-id="' + esc(acct.id) + '" title="' + esc(lang.cc_view_txns || 'View transactions') + '">&#128269;</button>';
                        if (untaggedCount > 0) {
                            h += '<button class="ba-bulk-tag-btn" data-account-id="' + esc(acct.id) + '" data-account-name="' + esc(acct.name) + '" title="Assign all untagged transactions to this account">&#128278; Tag ' + untaggedCount + ' untagged</button>';
                        }
                    }
                    h += '</div>';
                });
            }

            // Add new account form
            if (canEdit) {
                h += '<div class="ba-add-form">';
                h += '<h4 class="cc-add-heading">' + esc(lang.ba_add_heading || 'Add Bank Account') + '</h4>';
                h += '<div class="ba-form-row">';
                h += '<input type="text" class="ba-new-name" placeholder="' + esc(lang.ba_name || 'Account name') + '" />';
                h += '<select class="ba-new-type">';
                h += '<option value="checking">' + esc(lang.ba_type_checking || 'Checking') + '</option>';
                h += '<option value="savings">' + esc(lang.ba_type_savings || 'Savings') + '</option>';
                h += '<option value="other">' + esc(lang.ba_type_other || 'Other') + '</option>';
                h += '</select>';
                h += '<input type="text" class="ba-new-last4" maxlength="4" placeholder="Last 4" style="width:60px" />';
                h += '</div>';
                h += '<div class="ba-form-actions">';
                h += '<button class="ba-add-btn button">' + esc(lang.ba_add || 'Add Account') + '</button>';
                h += '<button class="ba-save-btn button">' + esc(lang.ba_save || 'Save Accounts') + '</button>';
                h += '</div>';
                h += '</div>';
            }
            $section.html(h);
        }

        // View bank account transactions
        $(document).on('click', '.ba-view-txns', function () {
            var acctId = $(this).data('account-id');
            cardFilter = acctId;
            $root.find('.search-card-filter').val('ba:' + acctId);
            tlSelectedMonth = null; tlSelectedDay = null;
            renderCcStrip();
            render();
            if (openEditorWins['cards']) {
                openEditorWins['cards'].find('.detail-win-close').trigger('click');
            }
        });

        // Bulk-tag all untagged transactions to a bank account
        $(document).on('click', '.ba-bulk-tag-btn', function () {
            var acctId = $(this).data('account-id');
            var acctName = $(this).data('account-name');
            var untagged = entries.filter(function(e) { return !e.card_id && !e.account_id; });
            if (untagged.length === 0) { showMsg('No untagged transactions.', 'error'); return; }
            if (!confirm('Assign all ' + untagged.length + ' untagged transaction(s) to "' + acctName + '"? This cannot be undone.')) return;

            // Build bulk update: clone entries with account_id set
            var updated = [];
            entries.forEach(function(e) {
                if (!e.card_id && !e.account_id) {
                    var copy = $.extend({}, e);
                    copy.account_id = acctId;
                    updated.push(copy);
                }
            });

            ajax('bulk_tag_account', { account_id: acctId, entry_ids: JSON.stringify(updated.map(function(e){ return e.id; })) }, function(r) {
                if (r.success) {
                    entries.forEach(function(e) {
                        if (!e.card_id && !e.account_id) e.account_id = acctId;
                    });
                    renderBankAccountsSection();
                    renderCreditCardSelectors();
                    render();
                    showMsg(updated.length + ' transactions assigned to "' + acctName + '".');
                } else {
                    showMsg(lang.msg_error_save || 'Save failed', 'error');
                }
            });
        });

        // Delete bank account
        $(document).on('click', '.ba-delete-btn', function () {
            var idx = parseInt($(this).data('idx'));
            if (!confirm('Remove this account? Transactions tagged to it will keep their account tag in the data.')) return;
            bankAccounts.splice(idx, 1);
            ajax('save_bank_accounts', { bank_accounts: JSON.stringify(bankAccounts) }, function (r) {
                if (r.success) {
                    if (r.bank_accounts) bankAccounts = r.bank_accounts;
                    renderCreditCardSelectors();
                    renderBankAccountsSection();
                    showMsg(lang.ba_deleted || 'Account removed.');
                } else {
                    showMsg(lang.msg_error_save || 'Save failed', 'error');
                }
            });
        });

        // Add new bank account
        $(document).on('click', '.ba-add-btn', function () {
            var $body = $(this).closest('.budget-cards-body, .editor-win-body');
            var name = $.trim($body.find('.ba-new-name').val());
            var type = $body.find('.ba-new-type').val() || 'checking';
            var last4 = $.trim($body.find('.ba-new-last4').val()).replace(/[^0-9]/g, '').slice(-4);
            if (!name) { showMsg('Enter an account name.', 'error'); return; }
            var id = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 32) || 'acct_' + Date.now();
            var existing = bankAccounts.map(function (a) { return a.id; }).concat(creditCards.map(function (c) { return c.id; }));
            if (existing.indexOf(id) !== -1) id = id + '_' + Date.now();
            bankAccounts.push({ id: id, name: name, type: type, last4: last4 });
            renderBankAccountsSection($body.find('.ba-section').length ? $body : null);
            renderCreditCardSelectors();
        });

        // Save all bank accounts
        $(document).on('click', '.ba-save-btn', function () {
            ajax('save_bank_accounts', { bank_accounts: JSON.stringify(bankAccounts) }, function (r) {
                if (r.success) {
                    if (r.bank_accounts) bankAccounts = r.bank_accounts;
                    renderCreditCardSelectors();
                    renderBankAccountsSection();
                    showMsg(lang.ba_saved || 'Accounts saved.');
                } else {
                    showMsg(lang.msg_error_save || 'Save failed', 'error');
                }
            });
        });

    }); // end .plugin-budget.each
});
