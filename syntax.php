<?php
/**
 * DokuWiki Plugin Budget (Syntax Component)
 * @version 5.14.10
 */

use dokuwiki\Extension\SyntaxPlugin;

class syntax_plugin_budget extends SyntaxPlugin {

    const VERSION = '5.13.0';

    public function getType()  { return 'substition'; }
    public function getPType() { return 'block'; }
    public function getSort()  { return 155; }

    public function connectTo($mode) {
        $this->Lexer->addSpecialPattern('<budget\b[^>]*/?>', $mode, 'plugin_budget');
    }

    public function handle($match, $state, $pos, Doku_Handler $handler) {
        $data = array('name' => 'default', 'currency' => $this->getConf('default_currency'));
        if (preg_match('/\bname\s*=\s*"([^"]*)"/', $match, $m)) $data['name'] = $m[1];
        if (preg_match('/\bcurrency\s*=\s*"([^"]*)"/', $match, $m)) $data['currency'] = $m[1];
        return $data;
    }

    public function render($mode, Doku_Renderer $renderer, $data) {
        if ($mode !== 'xhtml') return false;
        global $ID, $INFO;

        $budgetId = cleanID($ID . '_' . $data['name']);
        $canEdit  = (isset($INFO['writable']) && $INFO['writable']) ||
                    (isset($INFO['perm']) && $INFO['perm'] >= AUTH_EDIT);
        $cur  = hsc($data['currency']);
        $name = hsc($data['name']);
        $L    = $this->getLangStrings();

        $expCats = array('housing','utilities','groceries','gas','transport','healthcare',
            'entertainment','education','savings','dining','shopping',
            'subscriptions','personal','transfers','atm','other_expense');
        $incCats = array('salary','freelance','investment','deposit','other_income');

        // Build category labels for JS
        $catLabels = array();
        foreach (array_merge($expCats, $incCats) as $c) {
            $catLabels[$c] = $this->getLang('cat_'.$c);
        }

        $jc = htmlspecialchars(json_encode(array(
            'budgetId'        => $budgetId,
            'currency'        => $data['currency'],
            'canEdit'         => $canEdit,
            'dateFormat'      => $this->getConf('date_format'),
            'decimalSep'      => $this->getConf('decimal_separator'),
            'thousandsSep'    => $this->getConf('thousands_separator'),
            'allowExport'     => (bool)$this->getConf('allow_csv_export'),
            'lang'            => $L,
            'pageId'          => $ID,
            'defaultExpCats'  => $expCats,
            'defaultIncCats'  => $incCats,
            'defaultCatLabels'=> $catLabels,
        ), JSON_HEX_TAG|JSON_HEX_AMP|JSON_HEX_APOS|JSON_HEX_QUOT), ENT_QUOTES, 'UTF-8');

        $o = '<div class="plugin-budget" data-config="'.$jc.'">';
        $o .= '<h3 class="budget-title">'.$name.'</h3>';

        // ╔═══ CONTROL PANEL ═══╗
        $o .= '<div class="cp-top">';

        // Month selector
        $o .= '<div class="cp-month-row">';
        $o .= '<select class="budget-dash-month"></select>';
        $o .= '<button class="budget-print-btn button" title="'.hsc($this->getLang('print_report')).'">&#128438;</button>';
        $o .= '</div>';

        // Budget dashboard cards
        $o .= '<div class="budget-dashboard">';
        $o .= '<div class="budget-dash-cards"></div>';
        $o .= '<p class="budget-dash-empty" style="display:none;">'.hsc($this->getLang('dash_no_budgets')).'</p>';
        $o .= '</div>';

        // Credit card summary strip (populated by JS; hidden until cards exist)
        $o .= '<div class="budget-cc-strip" style="display:none;"></div>';

        $o .= '</div>'; // .cp-top

        // ── Action bar ──
        if ($canEdit) {
            $o .= '<div class="cp-actions">';
            $o .= '<button class="cp-btn cp-btn-add" data-panel="add" title="'.hsc($this->getLang('panel_add')).'">&#43; Add</button>';
            $o .= '<button class="cp-btn cp-btn-import" data-panel="import" title="'.hsc($this->getLang('panel_import')).'">&#128229; Import</button>';
            $o .= '<button class="cp-btn cp-btn-cards" data-panel="cards" title="'.hsc($this->getLang('panel_cards')).'">&#127974; Accounts</button>';
            $o .= '<button class="cp-btn cp-btn-budgets" data-panel="budgets" title="'.hsc($this->getLang('panel_budgets')).'">&#128176; Budgets</button>';
            $o .= '<button class="cp-btn cp-btn-income" data-panel="income" title="'.hsc($this->getLang('panel_income')).'">&#128200; Income</button>';
            $o .= '<button class="cp-btn cp-btn-rules" data-panel="rules" title="'.hsc($this->getLang('panel_rules')).'">&#128203; Rules</button>';
            $o .= '<button class="cp-btn cp-btn-cats" data-panel="cats" title="'.hsc($this->getLang('panel_cats')).'">&#127991; Categories</button>';
            $o .= '<button class="cp-btn cp-btn-data" data-panel="data" title="'.hsc($this->getLang('panel_data')).'">&#128451; Data</button>';
            $o .= '</div>';
        }

        // ╔═══ EDITOR PANELS ═══╗
        if ($canEdit) {
            $o .= '<div class="cp-panels" style="display:none;">';

            // ── Add Transaction ──
            $o .= '<div class="cp-panel" data-panel="add">';
            $o .= '<div class="budget-form"><div class="budget-form-row">';
            $o .= '<select class="budget-input-type">';
            $o .= '<option value="income">'.hsc($this->getLang('lbl_income')).'</option>';
            $o .= '<option value="expense">'.hsc($this->getLang('lbl_expense')).'</option>';
            $o .= '</select>';
            $o .= '<input type="text" class="budget-input-desc" placeholder="'.hsc($this->getLang('lbl_description')).'" />';
            $o .= '<input type="number" class="budget-input-amount" step="0.01" min="0" placeholder="'.hsc($this->getLang('lbl_amount')).'" />';
            $o .= '<select class="budget-input-category">';
            $o .= '<optgroup label="'.hsc($this->getLang('lbl_income')).'" class="budget-cat-income">';
            foreach ($incCats as $c) $o .= '<option value="'.hsc($c).'">'.hsc($this->getLang('cat_'.$c)).'</option>';
            $o .= '</optgroup>';
            $o .= '<optgroup label="'.hsc($this->getLang('lbl_expense')).'" class="budget-cat-expense">';
            foreach ($expCats as $c) $o .= '<option value="'.hsc($c).'">'.hsc($this->getLang('cat_'.$c)).'</option>';
            $o .= '</optgroup></select>';
            $o .= '<input type="date" class="budget-input-date" />';
            // Card selector — hidden by JS until cards exist; populated dynamically
            $o .= '<select class="budget-input-card" style="display:none;" title="'.hsc($this->getLang('cc_tag_add')).'"></select>';
            $o .= '<button class="budget-btn-add button">'.hsc($this->getLang('btn_save')).'</button>';
            $o .= '</div></div>';
            $o .= '</div>';

            // ── Import ──
            $o .= '<div class="cp-panel" data-panel="import">';
            $o .= '<div class="budget-import-body">';

            // Import type tabs
            $o .= '<div class="budget-import-tabs">';
            $o .= '<button class="budget-import-tab budget-import-tab-active" data-tab="csv">&#128196; '.hsc($this->getLang('import_tab_csv')).'</button>';
            $o .= '<button class="budget-import-tab" data-tab="pdf">&#128196; '.hsc($this->getLang('import_tab_pdf')).'</button>';
            $o .= '</div>';

            // ── CSV tab ──
            $o .= '<div class="budget-import-tab-panel" data-tab="csv">';
            $o .= '<p class="budget-import-help">'.hsc($this->getLang('import_help')).'</p>';
            $o .= '<div class="budget-import-row"><label>'.hsc($this->getLang('import_file')).'</label>';
            $o .= '<input type="file" class="budget-import-file" accept=".csv,.CSV" /></div>';
            // Credit card tag row — hidden until cards configured
            $o .= '<div class="budget-import-card-row" style="display:none;">';
            $o .= '<label>'.hsc($this->getLang('cc_tag_import')).'</label>';
            $o .= '<select class="budget-import-card-select">';
            $o .= '<option value="">'.hsc($this->getLang('cc_tag_none')).'</option>';
            $o .= '</select>';
            $o .= '</div>';
            $o .= '<div class="budget-import-options">';
            $o .= '<label><input type="checkbox" class="budget-import-has-header" checked="checked" /> '.hsc($this->getLang('import_has_header')).'</label>';
            $o .= '<label><input type="checkbox" class="budget-import-neg-expense" checked="checked" /> '.hsc($this->getLang('import_neg_expense')).'</label>';
            $o .= '<label><input type="checkbox" class="budget-import-clear" /> '.hsc($this->getLang('import_clear_first')).'</label>';
            $o .= '</div>';
            $o .= '<div class="budget-import-mapping" style="display:none;">';
            $o .= '<p class="budget-import-preview-label">'.hsc($this->getLang('import_preview')).'</p>';
            $o .= '<div class="budget-import-preview-table"></div>';
            $o .= '<div class="budget-import-map-row">';
            foreach (array('date','description','amount','debit','credit','txtype') as $f) {
                $o .= '<label class="budget-map-field">'.hsc($this->getLang('import_col_'.$f));
                $o .= '<select class="budget-map-'.$f.'"><option value="">-- '.hsc($this->getLang('import_skip')).' --</option></select></label>';
            }
            $o .= '</div>';
            $o .= '<div class="budget-import-actions"><button class="budget-btn-import button">'.hsc($this->getLang('btn_import')).'</button>';
            $o .= '<span class="budget-import-status"></span></div>';
            $o .= '</div>';
            $o .= '</div>'; // end csv tab panel

            // ── PDF tab ──
            $o .= '<div class="budget-import-tab-panel" data-tab="pdf" style="display:none;">';
            $o .= '<p class="budget-import-help">'.hsc($this->getLang('import_pdf_help')).'</p>';
            $o .= '<div class="budget-import-row"><label>'.hsc($this->getLang('import_pdf_file')).'</label>';
            $o .= '<input type="file" class="budget-pdf-file" accept=".pdf,.PDF" multiple="multiple" /></div>';
            // Card tag row for PDF (populated same as CSV card row by JS)
            $o .= '<div class="budget-import-card-row budget-pdf-card-row" style="display:none;">';
            $o .= '<label>'.hsc($this->getLang('cc_tag_import')).'</label>';
            $o .= '<select class="budget-pdf-card-select">';
            $o .= '<option value="">'.hsc($this->getLang('cc_tag_none')).'</option>';
            $o .= '</select>';
            $o .= '</div>';
            $o .= '<div class="budget-pdf-status"></div>';
            $o .= '<div class="budget-pdf-results" style="display:none;">';
            $o .= '<div class="budget-pdf-summary"></div>';
            $o .= '<div class="budget-pdf-options">';
            $o .= '<label><input type="checkbox" class="budget-pdf-neg-expense" checked="checked" /> '.hsc($this->getLang('import_neg_expense')).'</label>';
            $o .= '<label><input type="checkbox" class="budget-pdf-skip-dupes" checked="checked" /> '.hsc($this->getLang('import_pdf_skip_dupes')).'</label>';
            $o .= '</div>';
            $o .= '<div class="budget-pdf-preview-wrap">';
            $o .= '<table class="budget-pdf-preview-table"><thead><tr>';
            $o .= '<th><input type="checkbox" class="budget-pdf-check-all" checked="checked" title="'.hsc($this->getLang('import_pdf_select_all')).'" /></th>';
            $o .= '<th>'.hsc($this->getLang('import_col_date')).'</th>';
            $o .= '<th>'.hsc($this->getLang('import_col_description')).'</th>';
            $o .= '<th>'.hsc($this->getLang('import_col_amount')).'</th>';
            $o .= '<th>'.hsc($this->getLang('lbl_type')).'</th>';
            $o .= '<th>'.hsc($this->getLang('import_pdf_col_file')).'</th>';
            $o .= '</tr></thead>';
            $o .= '<tbody class="budget-pdf-preview-tbody"></tbody>';
            $o .= '</table>';
            $o .= '</div>';
            $o .= '<div class="budget-import-actions">';
            $o .= '<button class="budget-btn-pdf-import button">'.hsc($this->getLang('btn_import')).'</button>';
            $o .= '<span class="budget-pdf-import-status"></span>';
            $o .= '</div>';
            $o .= '</div>'; // end pdf-results
            $o .= '</div>'; // end pdf tab panel

            $o .= '</div></div>'; // end import-body + panel

            // ── Accounts (Credit Cards + Bank Accounts) ──
            $o .= '<div class="cp-panel" data-panel="cards">';
            $o .= '<div class="budget-cards-body">';
            $o .= '<p class="budget-cards-help">'.hsc($this->getLang('cc_help')).'</p>';
            $o .= '<div class="budget-cards-list"></div>';
            $o .= '<div class="budget-cards-add">';
            $o .= '<h4>'.hsc($this->getLang('cc_add_heading')).'</h4>';
            $o .= '<div class="cc-add-row">';
            $o .= '<input type="text" class="cc-new-name" placeholder="'.hsc($this->getLang('cc_name_placeholder')).'" />';
            $o .= '<input type="number" class="cc-new-limit" step="0.01" min="0" placeholder="'.hsc($this->getLang('cc_limit')).'" />';
            $o .= '<input type="text" class="cc-new-last4" maxlength="4" placeholder="'.hsc($this->getLang('cc_last4')).'" />';
            $o .= '<button class="cc-add-btn button">'.hsc($this->getLang('cc_add')).'</button>';
            $o .= '</div>';
            $o .= '</div>';
            $o .= '<button class="cc-save-btn button">'.hsc($this->getLang('cc_save')).'</button>';
            $o .= '<hr class="ba-divider" />';
            $o .= '<div class="ba-section"></div>';
            $o .= '</div></div>';

            // ── Budget Planner ──
            $o .= '<div class="cp-panel" data-panel="budgets">';
            $o .= '<div class="budget-manage-body">';
            $o .= '<div class="budget-planner">';
            $o .= '<div class="bp-row">';
            $o .= '<label class="bp-label">'.hsc($this->getLang('bp_monthly_income')).'</label>';
            $o .= '<input type="number" class="bp-income-input" step="0.01" min="0" placeholder="0.00" />';
            $o .= '<button class="bp-detect-income button">'.hsc($this->getLang('bp_detect')).'</button>';
            $o .= '</div>';
            $o .= '<div class="bp-income-detail"></div>';
            $o .= '<div class="bp-row">';
            $o .= '<label class="bp-label">'.hsc($this->getLang('bp_savings_goal')).'</label>';
            $o .= '<input type="number" class="bp-savings-input" step="0.01" min="0" placeholder="0.00" />';
            $o .= '</div>';
            $o .= '<div class="bp-alert"></div>';
            $o .= '<div class="bp-actions"><button class="bp-balance button">'.hsc($this->getLang('bp_balance')).'</button></div>';
            $o .= '<div class="bp-breakdown"></div>';
            $o .= '</div>';
            $o .= '<div class="budget-manage-list"></div>';
            $o .= '<div class="budget-manage-add">';
            $o .= '<select class="budget-manage-new-cat">';
            foreach ($expCats as $c) $o .= '<option value="'.hsc($c).'">'.hsc($this->getLang('cat_'.$c)).'</option>';
            $o .= '</select>';
            $o .= '<input type="number" class="budget-manage-new-limit" step="0.01" min="0" placeholder="'.hsc($this->getLang('budgets_limit')).'" />';
            $o .= '<button class="budget-manage-add-btn button">'.hsc($this->getLang('budgets_add')).'</button>';
            $o .= '</div>';
            $o .= '<button class="budget-manage-save button">'.hsc($this->getLang('budgets_save')).'</button>';
            $o .= '</div></div>';

            // ── Income Manager ──
            $o .= '<div class="cp-panel" data-panel="income">';
            $o .= '<div class="budget-income-body">';
            $o .= '<div class="income-chart-wrap"></div>';
            $o .= '<div class="income-summary-bar"></div>';
            $o .= '<div class="income-sources"></div>';
            $o .= '<div class="income-payroll-detail"></div>';
            $o .= '<div class="income-reimbursements"></div>';
            $o .= '</div></div>';

            // ── Rules ──
            $o .= '<div class="cp-panel" data-panel="rules">';
            $o .= '<div class="budget-rules-body">';
            $o .= '<p class="budget-rules-help">'.hsc($this->getLang('rules_help')).'</p>';
            $o .= '<div class="budget-rules-toolbar">';
            $o .= '<input type="text" class="budget-rules-search" placeholder="'.hsc($this->getLang('rules_search_placeholder')).'" />';
            $o .= '<span class="budget-rules-count"></span>';
            $o .= '</div>';
            $o .= '<div class="budget-rules-list"></div>';
            $o .= '<div class="budget-rules-add">';
            $o .= '<input type="text" class="budget-rules-new-keyword" placeholder="'.hsc($this->getLang('rules_keyword')).'" />';
            $o .= '<select class="budget-rules-new-cat">';
            foreach ($expCats as $c) $o .= '<option value="'.hsc($c).'">'.hsc($this->getLang('cat_'.$c)).'</option>';
            foreach ($incCats as $c) $o .= '<option value="'.hsc($c).'">'.hsc($this->getLang('cat_'.$c)).'</option>';
            $o .= '</select>';
            $o .= '<button class="budget-rules-add-btn button">'.hsc($this->getLang('rules_add')).'</button>';
            $o .= '</div>';
            $o .= '<div class="budget-rules-actions">';
            $o .= '<button class="budget-rules-save button">'.hsc($this->getLang('rules_save')).'</button>';
            $o .= '<button class="budget-rules-detect button">'.hsc($this->getLang('rules_detect')).'</button>';
            $o .= '<button class="budget-rules-update button">'.hsc($this->getLang('rules_update')).'</button>';
            $o .= '<button class="budget-rules-clear button">'.hsc($this->getLang('rules_clear')).'</button>';
            $o .= '</div></div></div>';

            // ── Custom Categories ──
            $o .= '<div class="cp-panel" data-panel="cats">';
            $o .= '<div class="budget-custom-cats-body">';
            $o .= '<p class="budget-custom-cats-help">'.hsc($this->getLang('custom_cats_help')).'</p>';
            $o .= '<div class="budget-custom-cats-list"></div>';
            $o .= '<div class="budget-custom-cats-add">';
            $o .= '<input type="text" class="budget-custom-cats-new-id" placeholder="'.hsc($this->getLang('custom_cats_new_id')).'" />';
            $o .= '<input type="text" class="budget-custom-cats-new-label" placeholder="'.hsc($this->getLang('custom_cats_new_label')).'" />';
            $o .= '<select class="budget-custom-cats-new-type"><option value="expense">'.hsc($this->getLang('lbl_expense')).'</option><option value="income">'.hsc($this->getLang('lbl_income')).'</option></select>';
            $o .= '<button class="budget-custom-cats-add-btn button">'.hsc($this->getLang('custom_cats_add')).'</button>';
            $o .= '</div>';
            $o .= '<button class="budget-custom-cats-save button">'.hsc($this->getLang('custom_cats_save')).'</button>';
            $o .= '</div></div>';

            // ── Data Manager ──
            $o .= '<div class="cp-panel" data-panel="data" style="display:none;">';
            $o .= '<div class="data-manager-body"></div>';
            $o .= '</div>';

            $o .= '</div>'; // .cp-panels
        }

        // ╔═══ SEARCH + FILTER + TABLE ═══╗
        $o .= '<div class="budget-search-panel">';

        // Search row
        $o .= '<div class="search-row">';
        $o .= '<input type="text" class="budget-search" placeholder="'.hsc($this->getLang('search_placeholder')).'" />';
        $o .= '<select class="search-type-filter">';
        $o .= '<option value="">'.hsc($this->getLang('all_types')).'</option>';
        $o .= '<option value="expense">'.hsc($this->getLang('expenses')).'</option>';
        $o .= '<option value="income">'.hsc($this->getLang('lbl_income')).'</option>';
        $o .= '</select>';
        $o .= '<select class="search-cat-filter">';
        $o .= '<option value="">'.hsc($this->getLang('all_categories')).'</option>';
        $o .= '<optgroup label="'.hsc($this->getLang('lbl_expense')).'">';
        foreach ($expCats as $c) $o .= '<option value="'.hsc($c).'">'.hsc($this->getLang('cat_'.$c)).'</option>';
        $o .= '</optgroup>';
        $o .= '<optgroup label="'.hsc($this->getLang('lbl_income')).'">';
        foreach ($incCats as $c) $o .= '<option value="'.hsc($c).'">'.hsc($this->getLang('cat_'.$c)).'</option>';
        $o .= '</optgroup>';
        $o .= '</select>';
        // Card filter — hidden until cards exist; populated by JS
        $o .= '<select class="search-card-filter" style="display:none;"></select>';
        $o .= '</div>';

        // Filter row
        $o .= '<div class="filter-row">';
        $o .= '<select class="budget-filter-period">';
        foreach (array('all','month','60days','90days','12months','custom') as $f)
            $o .= '<option value="'.$f.'">'.hsc($this->getLang('filter_'.$f)).'</option>';
        $o .= '</select>';
        $o .= '<div class="budget-filter-custom" style="display:none;">';
        $o .= '<input type="date" class="budget-filter-from" title="'.hsc($this->getLang('filter_from')).'" />';
        $o .= '<input type="date" class="budget-filter-to" title="'.hsc($this->getLang('filter_to')).'" />';
        $o .= '<button class="budget-filter-apply button">'.hsc($this->getLang('filter_apply')).'</button>';
        $o .= '</div>';
        $o .= '<div class="search-amount-range">';
        $o .= '<input type="number" class="search-min-amt" placeholder="Min $" step="0.01" min="0" />';
        $o .= '<span class="search-range-sep">&ndash;</span>';
        $o .= '<input type="number" class="search-max-amt" placeholder="Max $" step="0.01" min="0" />';
        $o .= '</div>';
        $o .= '<button class="search-clear button" title="'.hsc($this->getLang('clear_filters')).'">'.hsc($this->getLang('clear_filters')).'</button>';
        if ($canEdit) {
            $o .= '<button class="mass-edit-toggle button" title="'.hsc($this->getLang('mass_select')).'">&#9998; '.hsc($this->getLang('mass_select')).'</button>';
        }
        if ($this->getConf('allow_csv_export')) {
            $o .= '<button class="budget-btn-export button">'.hsc($this->getLang('btn_export_csv')).'</button>';
        }
        $o .= '<button class="search-print-btn button" title="'.hsc($this->getLang('print_search')).'">&#128438; '.hsc($this->getLang('print_search')).'</button>';
        $o .= '</div>';

        // Results summary + timeline
        $o .= '<div class="search-results-bar">';
        $o .= '<span class="search-results-stats"></span>';
        $o .= '</div>';
        $o .= '<div class="search-timeline"></div>';

        $o .= '</div>'; // .budget-search-panel

        // Summary totals
        $o .= '<div class="budget-summary-cards">';
        foreach (array('income','expense','balance') as $t) {
            $lk = $t==='balance' ? 'summary_balance' : 'summary_total_'.($t==='income'?'income':'expenses');
            $o .= '<div class="budget-card budget-card-'.$t.'">';
            $o .= '<span class="budget-card-label">'.hsc($this->getLang($lk)).'</span>';
            $o .= '<span class="budget-card-value" data-field="total-'.$t.'">'.$cur.'0.00</span>';
            $o .= '</div>';
        }
        $o .= '</div>';

        // Mass edit bar
        if ($canEdit) {
            $o .= '<div class="mass-edit-bar" style="display:none;">';
            $o .= '<input type="checkbox" class="mass-select-all" title="Select all" /> ';
            $o .= '<span class="mass-count">0 selected</span>';
            $o .= '<span class="mass-action-btns">';
            $o .= '<select class="mass-recat-select">';
            $o .= '<optgroup label="'.hsc($this->getLang('lbl_expense')).'">';
            foreach ($expCats as $c) $o .= '<option value="'.hsc($c).'">'.hsc($this->getLang('cat_'.$c)).'</option>';
            $o .= '</optgroup>';
            $o .= '<optgroup label="'.hsc($this->getLang('lbl_income')).'">';
            foreach ($incCats as $c) $o .= '<option value="'.hsc($c).'">'.hsc($this->getLang('cat_'.$c)).'</option>';
            $o .= '</optgroup>';
            $o .= '</select>';
            $o .= '<button class="mass-recat-apply button" disabled>'.hsc($this->getLang('mass_recat')).'</button>';
            $o .= '<select class="mass-type-select">';
            $o .= '<option value="expense">'.hsc($this->getLang('lbl_expense')).'</option>';
            $o .= '<option value="income">'.hsc($this->getLang('lbl_income')).'</option>';
            $o .= '</select>';
            $o .= '<button class="mass-type-apply button" disabled>'.hsc($this->getLang('mass_change_type')).'</button>';
            $o .= '<button class="mass-delete button" disabled>'.hsc($this->getLang('btn_delete')).'</button>';
            $o .= '</span>';
            $o .= '</div>';
        }

        $o .= '<div class="budget-table-info"><span class="budget-showing-count"></span></div>';
        $o .= '<div class="budget-table-scroll">';
        $o .= '<table class="inline budget-table">';
        $o .= '<thead><tr>';
        if ($canEdit) $o .= '<th class="col-cb-header" style="display:none;"><input type="checkbox" class="mass-select-all-head" title="Select all" /></th>';
        $o .= '<th class="sortable" data-sort="date" data-col="0">'.hsc($this->getLang('lbl_date')).' <span class="sort-icon">&#x25BC;</span></th>';
        $o .= '<th class="sortable" data-sort="type" data-col="1">'.hsc($this->getLang('lbl_type')).'</th>';
        $o .= '<th class="sortable" data-sort="category" data-col="2">'.hsc($this->getLang('lbl_category')).'</th>';
        $o .= '<th class="sortable col-desc-header" data-sort="description" data-col="3">'.hsc($this->getLang('lbl_description')).'</th>';
        $o .= '<th class="sortable" data-sort="amount" data-col="4">'.hsc($this->getLang('lbl_amount')).'</th>';
        if ($canEdit) $o .= '<th>'.hsc($this->getLang('lbl_actions')).'</th>';
        $o .= '</tr></thead>';
        $o .= '<tbody class="budget-tbody"></tbody>';
        $o .= '</table>';
        $o .= '<p class="budget-no-entries">'.hsc($this->getLang('msg_no_entries')).'</p>';
        $o .= '<p class="budget-no-results" style="display:none;">'.hsc($this->getLang('msg_no_results')).'</p>';
        $o .= '</div>'; // .budget-table-scroll

        $o .= '<div class="budget-version">'.hsc($this->getLang('version_info')).'</div>';
        $o .= '</div>';

        $renderer->doc .= $o;
        return true;
    }

    protected function getLangStrings() {
        $keys = array(
            'btn_save','btn_cancel','btn_delete','btn_edit','btn_export_csv','btn_import',
            'lbl_description','lbl_amount','lbl_category','lbl_date','lbl_type','lbl_income','lbl_expense','lbl_actions',
            'summary_title','summary_total_income','summary_total_expenses','summary_balance',
            'summary_cc_charges','summary_cc_payments','summary_cc_balance',
            'dash_title','dash_category','dash_budgeted','dash_spent','dash_remaining','dash_no_budgets','dash_over_budget',
            'search_placeholder','showing_count','msg_no_results',
            'budgets_title','budgets_help','budgets_name','budgets_limit','budgets_add','budgets_save','budgets_saved',
            'bp_monthly_income','bp_savings_goal','bp_balance',
            'bp_detect','bp_detected','bp_no_recurring','bp_enter_income','bp_balanced',
            'bp_cannot_balance','bp_tight_cats','bp_save_reminder','bp_hint','bp_cat_already_exists',
            'income_title','income_sources','income_payroll','income_reimburse',
            'income_monthly_chart','income_this_month','income_12mo_avg','income_12mo_total','income_mo_change',
            'income_no_txns','income_detected','income_projected','income_raise_history',
            'income_reimb_note','income_reimb_total',
            'income_consistent','income_moderate','income_variable','income_irregular',
            'rules_title','rules_help','rules_keyword','rules_assign_to','rules_add','rules_save','rules_saved',
            'rules_detect','rules_detected','rules_update','rules_update_done',
            'rules_clear','rules_clear_confirm','rules_cleared','rules_search_placeholder',
            'cat_housing','cat_utilities','cat_groceries','cat_gas','cat_transport','cat_healthcare','cat_entertainment',
            'cat_education','cat_savings','cat_dining','cat_shopping','cat_subscriptions','cat_personal',
            'cat_transfers','cat_atm','cat_other_expense',
            'cat_salary','cat_freelance','cat_investment','cat_deposit','cat_other_income',
            'custom_cats_title','custom_cats_help','custom_cats_new_id','custom_cats_new_label',
            'custom_cats_add','custom_cats_save','custom_cats_saved','custom_cats_type',
            'msg_saved','msg_deleted','msg_error_save','msg_error_delete','msg_error_amount','msg_error_desc',
            'msg_confirm_delete','msg_no_entries','msg_no_permission','msg_no_results',
            'recovery_title','recovery_help','recovery_restore','recovery_done',
            'filter_all','filter_month','filter_60days','filter_90days','filter_12months','filter_custom','filter_from','filter_to','filter_apply',
            'import_title','import_tab_csv','import_tab_pdf','import_help','import_file','import_preview',
            'import_pdf_help','import_pdf_file','import_pdf_skip_dupes','import_pdf_select_all',
            'import_pdf_parsing','import_pdf_parsing_batch','import_pdf_no_data','import_pdf_found','import_pdf_found_batch','import_pdf_col_file',
            'import_col_date','import_col_description','import_col_amount','import_col_debit','import_col_credit','import_col_txtype',
            'import_skip','import_has_header','import_neg_expense','import_clear_first',
            'import_success','import_error','import_no_data',
            'dm_title','dm_summary','dm_export','dm_import_restore','dm_import_hint',
            'dm_export_full','dm_export_csv','dm_export_budgets','dm_export_rules','dm_export_cats',
            'dm_restore_btn','dm_restore_confirm','dm_restore_complete','dm_restore_select',
            'dm_transactions','dm_budgets','dm_rules','dm_categories','dm_income_tags',
            'dm_no_transactions','dm_loading','dm_server_unavail',
            'dm_data_file','dm_file_size','dm_last_modified','dm_backup_dir','dm_auto_backups',
            'dm_invalid_json','dm_restoring','dm_restored_reloading',
            'mass_selected','mass_recat','mass_change_type','mass_delete_confirm',
            'mass_deleted','mass_recategorized','mass_updated','mass_select','mass_select_all',
            'panel_add','panel_import','panel_budgets','panel_income','panel_rules','panel_cats','panel_data','panel_cards',
            'all_types','all_categories','expenses','income',
            'clear_filters','print_report','print_search','popup_blocked',
            'cat_already_in','moved_to','no_recat_needed','no_new_rules','invalid_data',
            'click_to_copy','copied','desc_open_merchant',
            // Credit card strings
            'cc_title','cc_help','cc_no_cards','cc_add_heading',
            'cc_name','cc_name_placeholder','cc_limit','cc_last4',
            'cc_add','cc_save','cc_saved','cc_deleted',
            'cc_outstanding','cc_available','cc_utilization',
            'cc_charged','cc_payments','cc_this_month','cc_all_time',
            'cc_no_activity','cc_tag_import','cc_tag_none','cc_tag_add',
            'cc_filter_label','cc_filter_all','cc_payment_hint',
            'ba_title','ba_help','ba_no_accounts','ba_add_heading','ba_name','ba_type',
            'ba_type_checking','ba_type_savings','ba_type_other','ba_last4','ba_add','ba_save','ba_saved','ba_deleted',
            'cc_view_txns','cc_no_limit','cc_txn_count',
            'version_info',
        );
        $out = array();
        foreach ($keys as $k) $out[$k] = $this->getLang($k);
        return $out;
    }
}
