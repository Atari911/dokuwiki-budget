<?php
/**
 * English language file for budget plugin
 * @version 5.13.0
 */

// Buttons
$lang['btn_save']           = 'Save';
$lang['btn_cancel']         = 'Cancel';
$lang['btn_delete']         = 'Delete';
$lang['btn_edit']           = 'Edit';
$lang['btn_export_csv']     = 'Export CSV';
$lang['btn_import']         = 'Import Transactions';

// Labels
$lang['lbl_description']    = 'Description';
$lang['lbl_amount']         = 'Amount';
$lang['lbl_category']       = 'Category';
$lang['lbl_date']           = 'Date';
$lang['lbl_type']           = 'Type';
$lang['lbl_income']         = 'Income';
$lang['lbl_expense']        = 'Expense';
$lang['lbl_actions']        = 'Actions';

// Summary
$lang['summary_title']          = 'Summary';
$lang['summary_total_income']   = 'Total Income';
$lang['summary_total_expenses'] = 'Total Expenses';
$lang['summary_balance']        = 'Balance';
$lang['summary_cc_charges']     = 'Charges';
$lang['summary_cc_payments']    = 'Payments';
$lang['summary_cc_balance']     = 'Balance Owed';

// Dashboard
$lang['dash_title']             = 'Monthly Budget Dashboard';
$lang['dash_category']          = 'Category';
$lang['dash_budgeted']          = 'Budgeted';
$lang['dash_spent']             = 'Spent';
$lang['dash_remaining']         = 'Remaining';
$lang['dash_no_budgets']        = 'No budget categories set up yet. Open "Budget Categories" below to get started.';
$lang['dash_over_budget']       = 'Over budget!';

// Search & sort
$lang['search_placeholder']     = 'Search transactions…';
$lang['sort_date_asc']          = 'Date ↑';
$lang['sort_date_desc']         = 'Date ↓';
$lang['showing_count']          = 'Showing %d of %d transactions';

// Budget management
$lang['budgets_title']          = 'Budget Categories';
$lang['budgets_help']           = 'Set monthly spending limits for each category.';
$lang['budgets_name']           = 'Category Name';
$lang['budgets_limit']          = 'Monthly Limit';

// Budget planner
$lang['bp_monthly_income']      = 'Monthly Income';
$lang['bp_savings_goal']        = 'Monthly Savings Goal';
$lang['bp_balance']             = 'Balance Budget';

// Custom category management
$lang['custom_cats_title']      = 'Manage Categories';
$lang['custom_cats_help']       = 'Add custom categories or rename existing ones. Custom categories are saved with this budget.';
$lang['custom_cats_new_id']     = 'Category ID (letters, numbers, underscore)';
$lang['custom_cats_new_label']  = 'Display Name';
$lang['custom_cats_add']        = 'Add Category';
$lang['custom_cats_save']       = 'Save Categories';
$lang['custom_cats_saved']      = 'Categories saved.';
$lang['custom_cats_type']       = 'Type';
$lang['budgets_add']            = 'Add Category';
$lang['budgets_save']           = 'Save Budget Categories';
$lang['budgets_saved']          = 'Budget categories saved.';

// Rules
$lang['rules_title']            = 'Auto-Categorisation Rules';
$lang['rules_help']             = 'Keywords matched case-insensitively against transaction descriptions during import.';
$lang['rules_keyword']          = 'Keyword (in description)';
$lang['rules_assign_to']        = 'Assign to category';
$lang['rules_add']              = 'Add Rule';
$lang['rules_save']             = 'Save Rules';
$lang['rules_saved']            = 'Rules saved.';
$lang['rules_detect']           = 'Auto-Detect Rules';
$lang['rules_detected']         = '%d rules detected from your transactions.';
$lang['rules_update']           = 'Re-Categorise Transactions';
$lang['rules_update_done']      = '%d transactions re-categorised.';
$lang['rules_clear']            = 'Clear All Rules';
$lang['rules_clear_confirm']    = 'Are you sure you want to delete all rules? This cannot be undone.';
$lang['rules_cleared']          = 'All rules cleared.';
$lang['rules_search_placeholder'] = 'Search rules...';

// Expense categories
$lang['cat_housing']        = 'Housing / Rent';
$lang['cat_utilities']      = 'Utilities';
$lang['cat_groceries']      = 'Groceries';
$lang['cat_gas']            = 'Gas / Fuel';
$lang['cat_transport']      = 'Vehicle / Transport';
$lang['cat_healthcare']     = 'Healthcare';
$lang['cat_entertainment']  = 'Entertainment';
$lang['cat_education']      = 'Education';
$lang['cat_savings']        = 'Savings';
$lang['cat_dining']         = 'Dining Out';
$lang['cat_shopping']       = 'Shopping';
$lang['cat_subscriptions']  = 'Subscriptions';
$lang['cat_personal']       = 'Personal Care';
$lang['cat_transfers']      = 'Transfers';
$lang['cat_atm']            = 'ATM / Cash';
$lang['cat_other_expense']  = 'Other Expense';

// Income categories
$lang['cat_salary']         = 'Salary / Payroll';
$lang['cat_freelance']      = 'Freelance';
$lang['cat_investment']     = 'Investment';
$lang['cat_deposit']        = 'Deposit';
$lang['cat_other_income']   = 'Other Income';

// Income manager
$lang['income_title']       = 'Income Manager';
$lang['income_sources']     = 'Income Sources';
$lang['income_payroll']     = 'Payroll Analysis';
$lang['income_reimburse']   = 'Reimbursements';

// Messages
$lang['msg_saved']          = 'Saved.';
$lang['msg_deleted']        = 'Deleted.';
$lang['msg_error_save']     = 'Error saving.';
$lang['msg_error_delete']   = 'Error deleting.';
$lang['msg_error_amount']   = 'Please enter a valid amount.';
$lang['msg_error_desc']     = 'Please enter a description.';
$lang['msg_confirm_delete'] = 'Are you sure you want to delete this entry?';
$lang['msg_no_entries']     = 'No transactions yet.';
$lang['msg_no_permission']  = 'You do not have permission to edit this budget.';
$lang['msg_no_results']     = 'No transactions match your search.';

// Budget recovery
$lang['recovery_title']     = 'Previous budget data found';
$lang['recovery_help']      = 'It looks like you renamed this budget. Your data still exists under the old name. Select one to restore:';
$lang['recovery_restore']   = 'Restore';
$lang['recovery_done']      = 'Budget data restored!';

// Filters
$lang['filter_all']         = 'All Time';
$lang['filter_month']       = 'This Month';
$lang['filter_60days']      = 'Last 60 Days';
$lang['filter_90days']      = 'Last 90 Days';
$lang['filter_12months']    = 'Last 12 Months';
$lang['filter_custom']      = 'Custom Range';
$lang['filter_from']        = 'From';
$lang['filter_to']          = 'To';
$lang['filter_apply']       = 'Apply';

// Import
$lang['import_title']       = 'Import (CSV / PDF)';
$lang['import_tab_csv']     = 'CSV';
$lang['import_tab_pdf']     = 'PDF Statement';
$lang['import_help']        = 'Upload a CSV from Golden 1 or any bank. Map the columns, then import.';
$lang['import_file']        = 'CSV File';
$lang['import_pdf_help']    = 'Upload a credit card or bank statement PDF. Transactions are detected automatically — review and deselect any rows you don\'t want before importing.';
$lang['import_pdf_file']    = 'PDF Statement';
$lang['import_pdf_skip_dupes']  = 'Skip duplicate transactions';
$lang['import_pdf_select_all']  = 'Select / deselect all';
$lang['import_pdf_col_file']    = 'File';
$lang['import_pdf_parsing'] = 'Reading PDF…';
$lang['import_pdf_parsing_batch'] = 'Reading %d of %d: %s…';
$lang['import_pdf_no_data'] = 'No transactions found in PDF. The statement may use an image-based (scanned) format that cannot be parsed as text.';
$lang['import_pdf_found']   = '%d transactions detected across %d page(s). Deselect any rows you do not want to import.';
$lang['import_pdf_found_batch'] = '%d transactions detected from %d file(s). Deselect any rows you do not want to import.';
$lang['import_preview']     = 'Preview (first 5 rows):';
$lang['import_col_date']    = 'Date column';
$lang['import_col_description'] = 'Description column';
$lang['import_col_amount']  = 'Amount column';
$lang['import_col_debit']   = 'Debit column';
$lang['import_col_credit']  = 'Credit column';
$lang['import_col_txtype']  = 'Type column (DEBIT/CREDIT)';
$lang['import_skip']        = 'Skip';
$lang['import_has_header']  = 'First row is a header';
$lang['import_neg_expense'] = 'Negative amounts are expenses';
$lang['import_clear_first'] = 'Clear previous transactions for this account before importing (other accounts are unaffected)';
$lang['import_success']     = '%d transactions imported (%d skipped).';
$lang['import_error']       = 'Import failed: %s';
$lang['import_no_data']     = 'No data found in file.';

// Data Manager
$lang['dm_title']               = 'Data Manager';
$lang['dm_summary']             = 'Data Summary';
$lang['dm_export']              = 'Export';
$lang['dm_import_restore']      = 'Import / Restore';
$lang['dm_import_hint']         = 'Upload a previously exported JSON backup to restore data.';
$lang['dm_export_full']         = 'Full Backup (JSON)';
$lang['dm_export_csv']          = 'Transactions (CSV)';
$lang['dm_export_budgets']      = 'Budgets (JSON)';
$lang['dm_export_rules']        = 'Rules (JSON)';
$lang['dm_export_cats']         = 'Categories (JSON)';
$lang['dm_restore_btn']         = 'Restore Selected';
$lang['dm_restore_confirm']     = 'Restore %s? This overwrites current data for selected sections.';
$lang['dm_restore_complete']    = 'Restore complete!';
$lang['dm_restore_select']      = 'Select at least one section.';
$lang['dm_transactions']        = 'transactions';
$lang['dm_budgets']             = 'budgets';
$lang['dm_rules']               = 'rules';
$lang['dm_categories']          = 'categories';
$lang['dm_income_tags']         = 'income tags';
$lang['dm_no_transactions']     = 'No transactions';
$lang['dm_loading']             = 'Loading file info…';
$lang['dm_server_unavail']      = 'Server info unavailable';
$lang['dm_data_file']           = 'Data file:';
$lang['dm_file_size']           = 'File size:';
$lang['dm_last_modified']       = 'Last modified:';
$lang['dm_backup_dir']          = 'Backup dir:';
$lang['dm_auto_backups']        = 'Automatic Backups:';
$lang['dm_invalid_json']        = 'Invalid JSON file.';
$lang['dm_restoring']           = 'Restoring…';
$lang['dm_restored_reloading']  = 'Restored. Reloading…';

// Mass edit
$lang['mass_selected']          = '%d selected';
$lang['mass_recat']             = 'Re-categorize';
$lang['mass_change_type']       = 'Change Type';
$lang['mass_delete_confirm']    = 'Delete %d transaction(s)? This cannot be undone.';
$lang['mass_deleted']           = '%d deleted';
$lang['mass_recategorized']     = '%d re-categorized';
$lang['mass_updated']           = '%d updated';
$lang['mass_select']            = 'Select';
$lang['mass_select_all']        = 'Select all';

// Panel titles
$lang['panel_add']              = 'Add Transaction';
$lang['panel_import']           = 'Import CSV';
$lang['panel_budgets']          = 'Budget Planner';
$lang['panel_income']           = 'Income Manager';
$lang['panel_rules']            = 'Categorization Rules';
$lang['panel_cats']             = 'Custom Categories';
$lang['panel_data']             = 'Data Manager';
$lang['panel_cards']            = 'Accounts';

// Budget planner
$lang['bp_detect']              = 'Detect from Paychecks';
$lang['bp_detected']            = 'Paycheck detected: %s/mo';
$lang['bp_no_recurring']        = 'No recurring income found in the last 12 months.';
$lang['bp_enter_income']        = 'Enter your monthly income first. Click Detect from Paychecks to auto-fill.';
$lang['bp_balanced']            = 'Budget balanced! %s income \u2212 %s savings \u2212 %s fixed = %s distributed across flexible categories.';
$lang['bp_cannot_balance']      = 'Cannot balance.';
$lang['bp_tight_cats']          = 'Budget balanced, but some categories are tight:';
$lang['bp_save_reminder']       = 'Budget balanced. Click Save to keep these amounts.';
$lang['bp_hint']                = 'Enter your monthly income and savings goal, then click Balance Budget.';
$lang['bp_cat_already_exists']  = 'Category already has a budget';

// Income manager
$lang['income_monthly_chart']   = 'Monthly Income \u2014 12 Months';
$lang['income_this_month']      = 'This Month';
$lang['income_12mo_avg']        = '12-Mo Average';
$lang['income_12mo_total']      = '12-Mo Total';
$lang['income_mo_change']       = 'Mo/Mo Change';
$lang['income_no_txns']         = 'No income transactions found.';
$lang['income_detected']        = 'Detected:';
$lang['income_projected']       = 'Projected annual:';
$lang['income_raise_history']   = 'Raise History';
$lang['income_reimb_note']      = 'These are excluded from base income calculations in the budget planner.';
$lang['income_reimb_total']     = 'Total Reimbursements';
$lang['income_consistent']      = 'Very consistent';
$lang['income_moderate']        = 'Consistent';
$lang['income_variable']        = 'Variable';
$lang['income_irregular']       = 'Irregular';

// General
$lang['all_types']              = 'All Types';
$lang['all_categories']         = 'All Categories';
$lang['expenses']               = 'Expenses';
$lang['income']                 = 'Income';
$lang['clear_filters']          = 'Clear all filters';
$lang['print_report']           = 'Print report';
$lang['print_search']           = 'Print search results';
$lang['popup_blocked']          = 'Pop-up blocked. Please allow pop-ups for printing.';
$lang['cat_already_in']         = 'All transactions already in this category.';
$lang['moved_to']               = '%d transaction(s) moved to %s.';
$lang['no_recat_needed']        = 'No transactions needed re-categorising.';
$lang['no_new_rules']           = 'No new rules detected.';
$lang['invalid_data']           = 'Invalid data';

// Description tooltip
$lang['click_to_copy']          = 'Click to copy';
$lang['copied']                 = 'Copied!';
$lang['desc_open_merchant']     = 'Open merchant details';

// ── Credit Cards ─────────────────────────────────────────────
$lang['cc_title']               = 'Credit Cards';
$lang['cc_help']                = 'Track credit card balances and utilization. Transactions tagged to a card still count toward your budget categories as normal.';
$lang['cc_no_cards']            = 'No credit cards configured. Add a card below to start tracking.';
$lang['cc_add_heading']         = 'Add a New Card';
$lang['cc_name']                = 'Card Name';
$lang['cc_name_placeholder']    = 'e.g. Visa Sapphire, Apple Card';
$lang['cc_limit']               = 'Credit Limit';
$lang['cc_last4']               = 'Last 4 Digits';
$lang['cc_add']                 = 'Add Card';
$lang['cc_save']                = 'Save Cards';
$lang['cc_saved']               = 'Credit cards saved.';
$lang['cc_deleted']             = 'Card removed.';
$lang['cc_outstanding']         = 'Outstanding';
$lang['cc_available']           = 'Available';
$lang['cc_utilization']         = 'Utilization';
$lang['cc_charged']             = 'Charged';
$lang['cc_payments']            = 'Payments';
$lang['cc_this_month']          = 'This Month';
$lang['cc_all_time']            = 'All Time';
$lang['cc_no_activity']         = 'No activity';
$lang['cc_tag_import']          = 'Tag this import as a credit card statement for:';
$lang['cc_tag_none']            = '-- Not a credit card import --';
$lang['cc_tag_add']             = 'Card (optional)';
$lang['cc_filter_label']        = 'Account';
$lang['cc_filter_all']          = 'All Accounts';
$lang['ba_title']               = 'Bank Accounts';
$lang['ba_help']                = 'Add checking, savings, or other accounts to tag transactions and filter by account.';
$lang['ba_no_accounts']         = 'No bank accounts added yet.';
$lang['ba_add_heading']         = 'Add Bank Account';
$lang['ba_name']                = 'Account name';
$lang['ba_type']                = 'Type';
$lang['ba_type_checking']       = 'Checking';
$lang['ba_type_savings']        = 'Savings';
$lang['ba_type_other']          = 'Other';
$lang['ba_last4']               = 'Last 4 digits (optional)';
$lang['ba_add']                 = 'Add Account';
$lang['ba_save']                = 'Save Accounts';
$lang['ba_saved']               = 'Accounts saved.';
$lang['ba_deleted']             = 'Account deleted.';
$lang['cc_payment_hint']        = 'Record a payment by adding an Income transaction tagged to this card.';
$lang['cc_view_txns']           = 'View Transactions';
$lang['cc_id_placeholder']      = 'Auto-generated from name';
$lang['cc_no_limit']            = 'No limit set';
$lang['cc_txn_count']           = '%d transactions';

$lang['version_info']       = 'Budget Plugin v5.14.10';
