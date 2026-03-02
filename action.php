<?php
/**
 * DokuWiki Plugin Budget (Action Component)
 *
 * Data model (stored per budget as JSON):
 *   { "entries": [...], "budgets": [...], "rules": [...], "custom_cats": [...],
 *     "income_tags": [...], "credit_cards": [...], "bank_accounts": [...] }
 *
 *   entries      – individual transactions (income/expense)
 *   budgets      – monthly spending limits per category
 *   rules        – keyword→category auto-categorisation rules
 *   custom_cats  – user-defined categories
 *   income_tags  – payroll/reimbursement tags per income source
 *   credit_cards – credit card definitions { id, name, limit, last4 }
 *
 * Entries may carry an optional "card_id" field linking them to a credit card.
 * Expense entries tagged to a card increase the card balance;
 * income entries tagged to a card are treated as payments, reducing the balance.
 * Category-based budget spending is unaffected — tagged transactions count normally.
 *
 * @license GPL 2 http://www.gnu.org/licenses/gpl-2.0.html
 * @author  Claude (Anthropic)
 * @version 5.13.0
 */

use dokuwiki\Extension\ActionPlugin;
use dokuwiki\Extension\EventHandler;
use dokuwiki\Extension\Event;

class action_plugin_budget extends ActionPlugin {

    const VERSION = '5.13.0';

    public function register(EventHandler $controller) {
        $controller->register_hook('AJAX_CALL_UNKNOWN', 'BEFORE', $this, 'handleAjax');
    }

    public function handleAjax(Event $event) {
        if (strpos($event->data, 'plugin_budget_') !== 0) return;

        $event->stopPropagation();
        $event->preventDefault();

        global $INPUT;
        header('Content-Type: application/json; charset=utf-8');

        $action = substr($event->data, strlen('plugin_budget_'));

        switch ($action) {
            case 'load':              $this->ajaxLoad($INPUT);            break;
            case 'save':              $this->ajaxSave($INPUT);            break;
            case 'delete':            $this->ajaxDelete($INPUT);          break;
            case 'update':            $this->ajaxUpdate($INPUT);          break;
            case 'import':            $this->ajaxImport($INPUT);          break;
            case 'recategorise':      $this->ajaxRecategorise($INPUT);    break;
            case 'save_budgets':      $this->ajaxSaveBudgets($INPUT);     break;
            case 'save_rules':        $this->ajaxSaveRules($INPUT);       break;
            case 'save_custom_cats':  $this->ajaxSaveCustomCats($INPUT);  break;
            case 'save_income_tags':  $this->ajaxSaveIncomeTags($INPUT);  break;
            case 'save_credit_cards': $this->ajaxSaveCreditCards($INPUT); break;
            case 'save_bank_accounts':  $this->ajaxSaveBankAccounts($INPUT);  break;
            case 'bulk_tag_account':    $this->ajaxBulkTagAccount($INPUT);    break;
            case 'list_budgets':      $this->ajaxListBudgets($INPUT);     break;
            case 'rename_budget':     $this->ajaxRenameBudget($INPUT);    break;
            case 'data_info':         $this->ajaxDataInfo($INPUT);        break;
            case 'export_data':       $this->ajaxExportData($INPUT);      break;
            case 'import_full':       $this->ajaxImportFull($INPUT);      break;
            default:
                http_response_code(400);
                echo json_encode(array('success' => false, 'error' => 'Unknown action'));
        }
    }

    // ── Load everything ─────────────────────────────────────

    protected function ajaxLoad($INPUT) {
        $budgetId = cleanID($INPUT->str('budget_id'));
        if (empty($budgetId)) {
            echo json_encode(array('success' => false, 'error' => 'Missing budget ID'));
            return;
        }
        $data = $this->loadAll($budgetId);
        echo json_encode(array('success' => true, 'data' => $data));
    }

    // ── Single entry CRUD ───────────────────────────────────

    protected function ajaxSave($INPUT) {
        $budgetId = cleanID($INPUT->str('budget_id'));
        $pageId   = $INPUT->str('page_id');
        if (!$this->canEdit($pageId)) { $this->deny(); return; }

        $cardId    = trim($INPUT->str('card_id'));
        $accountId = trim($INPUT->str('account_id'));

        $entry = array(
            'id'          => uniqid('entry_', true),
            'type'        => $INPUT->str('type') === 'income' ? 'income' : 'expense',
            'description' => $INPUT->str('description'),
            'amount'      => abs((float) $INPUT->str('amount')),
            'category'    => $INPUT->str('category'),
            'date'        => $INPUT->str('date'),
            'created'     => time(),
        );
        if ($cardId    !== '') $entry['card_id']    = $cardId;
        if ($accountId !== '') $entry['account_id'] = $accountId;
        $ccType = trim($INPUT->str('cc_type'));
        if ($ccType !== '') $entry['cc_type'] = $ccType;

        if (empty($entry['description']) || $entry['amount'] <= 0) {
            echo json_encode(array('success' => false, 'error' => 'Invalid data'));
            return;
        }

        $data = $this->loadAll($budgetId);
        $data['entries'][] = $entry;
        $this->saveAll($budgetId, $data)
            ? $this->ok(array('entry' => $entry))
            : $this->fail();
    }

    protected function ajaxDelete($INPUT) {
        $budgetId = cleanID($INPUT->str('budget_id'));
        $entryId  = $INPUT->str('entry_id');
        $pageId   = $INPUT->str('page_id');
        if (!$this->canEdit($pageId)) { $this->deny(); return; }

        $data = $this->loadAll($budgetId);
        $data['entries'] = array_values(array_filter($data['entries'], function ($e) use ($entryId) {
            return $e['id'] !== $entryId;
        }));
        $this->saveAll($budgetId, $data)
            ? $this->ok()
            : $this->fail();
    }

    protected function ajaxUpdate($INPUT) {
        $budgetId = cleanID($INPUT->str('budget_id'));
        $entryId  = $INPUT->str('entry_id');
        $pageId   = $INPUT->str('page_id');
        if (!$this->canEdit($pageId)) { $this->deny(); return; }

        $cardId    = trim($INPUT->str('card_id'));
        $accountId = trim($INPUT->str('account_id'));

        $data  = $this->loadAll($budgetId);
        $found = false;
        foreach ($data['entries'] as &$entry) {
            if ($entry['id'] === $entryId) {
                $entry['type']        = $INPUT->str('type') === 'income' ? 'income' : 'expense';
                $entry['description'] = $INPUT->str('description');
                $entry['amount']      = abs((float) $INPUT->str('amount'));
                $entry['category']    = $INPUT->str('category');
                $entry['date']        = $INPUT->str('date');
                $entry['modified']    = time();
                // Clear both, then set whichever was supplied
                unset($entry['card_id'], $entry['account_id']);
                if ($cardId    !== '') $entry['card_id']    = $cardId;
                if ($accountId !== '') $entry['account_id'] = $accountId;
                $ccType = trim($INPUT->str('cc_type'));
                if ($ccType !== '') $entry['cc_type'] = $ccType; else unset($entry['cc_type']);
                $found = true;
                break;
            }
        }
        unset($entry);

        if (!$found) {
            echo json_encode(array('success' => false, 'error' => 'Entry not found'));
            return;
        }
        $this->saveAll($budgetId, $data)
            ? $this->ok()
            : $this->fail();
    }

    // ── CSV Import (with optional clear + optional card tag) ─

    protected function ajaxImport($INPUT) {
        $budgetId   = cleanID($INPUT->str('budget_id'));
        $pageId     = $INPUT->str('page_id');
        $clearFirst = $INPUT->str('clear_first') === '1';
        $skipDupes  = $INPUT->str('skip_dupes') !== '0';
        $cardId     = trim($INPUT->str('card_id'));   // optional: tag all entries to this card
        if (!$this->canEdit($pageId)) { $this->deny(); return; }

        $rawEntries = $INPUT->str('entries');
        $imported   = json_decode($rawEntries, true);
        if (!is_array($imported) || empty($imported)) {
            echo json_encode(array('success' => false, 'error' => 'No valid entries'));
            return;
        }

        $data = $this->loadAll($budgetId);

        // Validate card_id exists in this budget
        if ($cardId !== '') {
            $cardExists = false;
            foreach ($data['credit_cards'] as $cc) {
                if ($cc['id'] === $cardId) { $cardExists = true; break; }
            }
            if (!$cardExists) $cardId = '';
        }

        if ($clearFirst) {
            // If an account is being imported to, only clear entries for THAT account.
            // This prevents wiping unrelated transactions when re-importing a single CC/bank statement.
            $clearAccountId  = trim($INPUT->str('clear_account_id'));   // bare account id
            $clearAccountFld = trim($INPUT->str('clear_account_field')); // 'card_id' or 'account_id'
            if ($clearAccountId !== '' && in_array($clearAccountFld, array('card_id', 'account_id'))) {
                $data['entries'] = array_values(array_filter($data['entries'], function ($e) use ($clearAccountId, $clearAccountFld) {
                    return (isset($e[$clearAccountFld]) ? $e[$clearAccountFld] : '') !== $clearAccountId;
                }));
            } else {
                // No account specified — clear everything (legacy behaviour, opt-in only)
                $data['entries'] = array();
            }
        }

        $existing = array();
        if ($skipDupes) {
            foreach ($data['entries'] as $e) {
                $existing[$this->entryFingerprint($e)] = true;
            }
        }

        $count = 0; $skipped = 0; $dupes = 0;
        foreach ($imported as $row) {
            $desc   = isset($row['description']) ? trim($row['description']) : '';
            $amount = isset($row['amount']) ? abs((float) $row['amount']) : 0;
            $date   = isset($row['date']) ? trim($row['date']) : '';
            $type   = isset($row['type']) ? trim($row['type']) : 'expense';
            $cat    = isset($row['category']) ? trim($row['category']) : '';
            $source = isset($row['source']) ? trim($row['source']) : '';

            if (empty($desc) || $amount <= 0) { $skipped++; continue; }

            $type = ($type === 'income') ? 'income' : 'expense';
            if (empty($cat)) $cat = ($type === 'income') ? 'other_income' : 'other_expense';

            if ($skipDupes && !$clearFirst) {
                $fp = $date . '|' . strtolower($desc) . '|' . number_format($amount, 2, '.', '') . '|' . $type;
                if (isset($existing[$fp])) { $dupes++; continue; }
                $existing[$fp] = true;
            }

            $newEntry = array(
                'id'          => uniqid('imp_', true),
                'type'        => $type,
                'description' => $desc,
                'amount'      => $amount,
                'category'    => $cat,
                'date'        => $date,
                'source'      => $source,
                'created'     => time(),
            );
            // JS pre-tags each entry with the right field (card_id or account_id)
            $entryCardId    = isset($row['card_id'])    ? trim($row['card_id'])    : $cardId;
            $entryAccountId = isset($row['account_id']) ? trim($row['account_id']) : '';
            if ($entryCardId    !== '') $newEntry['card_id']    = $entryCardId;
            if ($entryAccountId !== '') $newEntry['account_id'] = $entryAccountId;
            $ccType = isset($row['cc_type']) ? trim($row['cc_type']) : '';
            if ($ccType !== '') $newEntry['cc_type'] = $ccType;

            $data['entries'][] = $newEntry;
            $count++;
        }

        if ($count === 0 && $dupes > 0) {
            echo json_encode(array('success' => true, 'imported' => 0, 'skipped' => $skipped, 'dupes' => $dupes));
            return;
        }
        if ($count === 0) {
            echo json_encode(array('success' => false, 'error' => 'No valid entries'));
            return;
        }

        $this->saveAll($budgetId, $data)
            ? $this->ok(array('imported' => $count, 'skipped' => $skipped, 'dupes' => $dupes))
            : $this->fail();
    }

    protected function entryFingerprint($e) {
        $date = isset($e['date']) ? $e['date'] : '';
        $desc = isset($e['description']) ? strtolower(trim($e['description'])) : '';
        $amt  = isset($e['amount']) ? number_format(abs((float)$e['amount']), 2, '.', '') : '0.00';
        $type = isset($e['type']) ? $e['type'] : 'expense';
        return $date . '|' . $desc . '|' . $amt . '|' . $type;
    }

    // ── Batch re-categorise entries ────────────────────────

    protected function ajaxRecategorise($INPUT) {
        $budgetId = cleanID($INPUT->str('budget_id'));
        $pageId   = $INPUT->str('page_id');
        if (!$this->canEdit($pageId)) { $this->deny(); return; }

        $raw = $INPUT->str('updates');
        $updates = json_decode($raw, true);
        if (!is_array($updates) || empty($updates)) {
            echo json_encode(array('success' => false, 'error' => 'No updates'));
            return;
        }

        $map = array();
        foreach ($updates as $u) {
            if (isset($u['id']) && isset($u['category'])) {
                $map[$u['id']] = trim($u['category']);
            }
        }

        $data = $this->loadAll($budgetId);
        $changed = 0;
        foreach ($data['entries'] as &$entry) {
            if (isset($map[$entry['id']])) {
                $entry['category'] = $map[$entry['id']];
                $entry['modified'] = time();
                $changed++;
            }
        }
        unset($entry);

        $this->saveAll($budgetId, $data)
            ? $this->ok(array('changed' => $changed))
            : $this->fail();
    }

    // ── Budget categories (monthly limits) ──────────────────

    protected function ajaxSaveBudgets($INPUT) {
        $budgetId = cleanID($INPUT->str('budget_id'));
        $pageId   = $INPUT->str('page_id');
        if (!$this->canEdit($pageId)) { $this->deny(); return; }

        $raw = $INPUT->str('budgets');
        $budgets = json_decode($raw, true);
        if (!is_array($budgets)) $budgets = array();

        $data = $this->loadAll($budgetId);
        $data['budgets'] = $budgets;
        $this->saveAll($budgetId, $data)
            ? $this->ok()
            : $this->fail();
    }

    // ── Auto-categorisation rules ───────────────────────────

    protected function ajaxSaveRules($INPUT) {
        $budgetId = cleanID($INPUT->str('budget_id'));
        $pageId   = $INPUT->str('page_id');
        if (!$this->canEdit($pageId)) { $this->deny(); return; }

        $raw = $INPUT->str('rules');
        $rules = json_decode($raw, true);
        if (!is_array($rules)) $rules = array();

        $data = $this->loadAll($budgetId);
        $data['rules'] = $rules;
        $this->saveAll($budgetId, $data)
            ? $this->ok()
            : $this->fail();
    }

    // ── Save custom categories ──────────────────────────────

    protected function ajaxSaveCustomCats($INPUT) {
        $budgetId = cleanID($INPUT->str('budget_id'));
        $pageId   = $INPUT->str('page_id');
        if (!$this->canEdit($pageId)) { $this->deny(); return; }

        $cats = json_decode($INPUT->str('custom_cats'), true);
        if (!is_array($cats)) $cats = array();

        $data = $this->loadAll($budgetId);
        $data['custom_cats'] = $cats;
        $this->saveAll($budgetId, $data)
            ? $this->ok()
            : $this->fail();
    }

    // ── Save credit cards ────────────────────────────────────

    protected function ajaxSaveCreditCards($INPUT) {
        $budgetId = cleanID($INPUT->str('budget_id'));
        $pageId   = $INPUT->str('page_id');
        if (!$this->canEdit($pageId)) { $this->deny(); return; }

        $cards = json_decode($INPUT->str('credit_cards'), true);
        if (!is_array($cards)) $cards = array();

        // Sanitise each card
        $sanitised = array();
        foreach ($cards as $card) {
            if (empty($card['id']) || empty($card['name'])) continue;
            $sanitised[] = array(
                'id'    => preg_replace('/[^a-z0-9_]/', '_', strtolower(trim($card['id']))),
                'name'  => trim($card['name']),
                'limit' => max(0, (float)(isset($card['limit']) ? $card['limit'] : 0)),
                'last4' => preg_replace('/[^0-9]/', '', isset($card['last4']) ? (string)$card['last4'] : ''),
            );
        }

        $data = $this->loadAll($budgetId);
        $data['credit_cards'] = $sanitised;
        $this->saveAll($budgetId, $data)
            ? $this->ok(array('credit_cards' => $sanitised))
            : $this->fail();
    }

    protected function ajaxSaveBankAccounts($INPUT) {
        $budgetId = cleanID($INPUT->str('budget_id'));
        $pageId   = $INPUT->str('page_id');
        if (!$this->canEdit($pageId)) { $this->deny(); return; }

        $accounts = json_decode($INPUT->str('bank_accounts'), true);
        if (!is_array($accounts)) $accounts = array();

        $sanitised = array();
        foreach ($accounts as $acct) {
            if (empty($acct['id']) || empty($acct['name'])) continue;
            $type = in_array($acct['type'] ?? '', array('checking','savings','other')) ? $acct['type'] : 'checking';
            $sanitised[] = array(
                'id'    => preg_replace('/[^a-z0-9_]/', '_', strtolower(trim($acct['id']))),
                'name'  => trim($acct['name']),
                'type'  => $type,
                'last4' => preg_replace('/[^0-9]/', '', isset($acct['last4']) ? (string)$acct['last4'] : ''),
            );
        }

        $data = $this->loadAll($budgetId);
        $data['bank_accounts'] = $sanitised;
        $this->saveAll($budgetId, $data)
            ? $this->ok(array('bank_accounts' => $sanitised))
            : $this->fail();
    }

    protected function ajaxBulkTagAccount($INPUT) {
        $budgetId  = cleanID($INPUT->str('budget_id'));
        $pageId    = $INPUT->str('page_id');
        if (!$this->canEdit($pageId)) { $this->deny(); return; }

        $accountId = trim($INPUT->str('account_id'));
        if ($accountId === '') { echo json_encode(array('success' => false, 'error' => 'No account_id')); return; }

        $entryIds = json_decode($INPUT->str('entry_ids'), true);
        if (!is_array($entryIds)) $entryIds = array();
        $idSet = array_flip($entryIds);

        $data = $this->loadAll($budgetId);
        $count = 0;
        foreach ($data['entries'] as &$entry) {
            // Only tag entries in the provided id list (all previously untagged)
            if (isset($idSet[$entry['id']])) {
                $entry['account_id'] = $accountId;
                unset($entry['card_id']); // shouldn't have one, but be safe
                $count++;
            }
        }
        unset($entry);

        $this->saveAll($budgetId, $data)
            ? $this->ok(array('tagged' => $count))
            : $this->fail();
    }

    // ── List existing budget files for this page ──────────

    protected function ajaxListBudgets($INPUT) {
        $pageId = $INPUT->str('page_id');
        $prefix = 'budget_' . cleanID($pageId) . '_';
        $dir    = DOKU_CONF . '../data/meta/';
        $found  = array();

        if (is_dir($dir)) {
            foreach (scandir($dir) as $file) {
                if (strpos($file, $prefix) === 0 && substr($file, -5) === '.json') {
                    $budgetId = substr($file, 7, -5);
                    $name     = substr($file, strlen($prefix), -5);
                    $size     = filesize($dir . $file);
                    $raw  = file_get_contents($dir . $file);
                    $data = json_decode($raw, true);
                    $entryCount = 0;
                    if (is_array($data)) {
                        if (isset($data['entries'])) $entryCount = count($data['entries']);
                        elseif (isset($data[0])) $entryCount = count($data);
                    }
                    $found[] = array(
                        'budgetId' => $budgetId,
                        'name'     => $name,
                        'filename' => $file,
                        'entries'  => $entryCount,
                        'size'     => $size,
                    );
                }
            }
        }
        echo json_encode(array('success' => true, 'budgets' => $found));
    }

    // ── Rename/recover a budget ──────────────────────────────

    protected function ajaxRenameBudget($INPUT) {
        $pageId = $INPUT->str('page_id');
        $oldId  = cleanID($INPUT->str('old_id'));
        $newId  = cleanID($INPUT->str('new_id'));

        if (!$this->canEdit($pageId)) { $this->deny(); return; }
        if (empty($oldId) || empty($newId)) {
            echo json_encode(array('success' => false, 'error' => 'Missing budget ID'));
            return;
        }
        if ($oldId === $newId) {
            echo json_encode(array('success' => true, 'message' => 'Same ID, nothing to do'));
            return;
        }

        $oldFile = $this->getDataFile($oldId);
        $newFile = $this->getDataFile($newId);

        if (!file_exists($oldFile)) {
            echo json_encode(array('success' => false, 'error' => 'Source budget not found'));
            return;
        }

        if (copy($oldFile, $newFile)) {
            echo json_encode(array('success' => true, 'message' => 'Budget data copied to new name'));
        } else {
            echo json_encode(array('success' => false, 'error' => 'Copy failed'));
        }
    }

    // ── Helpers ─────────────────────────────────────────────

    protected function canEdit($pageId) {
        return auth_quickaclcheck($pageId) >= AUTH_EDIT;
    }

    protected function deny() {
        http_response_code(403);
        echo json_encode(array('success' => false, 'error' => 'Permission denied'));
    }

    protected function ok($extra = array()) {
        echo json_encode(array_merge(array('success' => true), $extra));
    }

    protected function fail() {
        http_response_code(500);
        echo json_encode(array('success' => false, 'error' => 'Save failed'));
    }

    protected function getDataFile($budgetId) {
        return DOKU_CONF . '../data/meta/budget_' . $budgetId . '.json';
    }

    // ── Save income tags ─────────────────────────────────────

    protected function ajaxSaveIncomeTags($INPUT) {
        $budgetId = cleanID($INPUT->str('budget_id'));
        $pageId   = $INPUT->str('page_id');
        if (!$this->canEdit($pageId)) { $this->deny(); return; }

        $tags = json_decode($INPUT->str('income_tags'), true);
        if (!is_array($tags)) { echo json_encode(array('success' => false)); return; }
        $data = $this->loadAll($budgetId);
        $data['income_tags'] = $tags;
        $this->saveAll($budgetId, $data)
            ? $this->ok()
            : $this->fail();
    }

    protected function loadAll($budgetId) {
        $file  = $this->getDataFile($budgetId);
        $empty = array(
            'entries'      => array(),
            'budgets'      => array(),
            'rules'        => array(),
            'custom_cats'  => array(),
            'income_tags'  => array(),
            'credit_cards' => array(),
            'bank_accounts' => array(),
        );

        if (!file_exists($file)) return $empty;

        $raw  = file_get_contents($file);
        $data = json_decode($raw, true);
        if (!is_array($data)) return $empty;

        // Migrate v1.x flat array
        if (isset($data[0]) && isset($data[0]['id'])) {
            return array(
                'entries' => $data, 'budgets' => array(), 'rules' => array(),
                'custom_cats' => array(), 'income_tags' => array(), 'credit_cards' => array(),
            );
        }

        if (!isset($data['entries']))      $data['entries']      = array();
        if (!isset($data['budgets']))      $data['budgets']      = array();
        if (!isset($data['rules']))        $data['rules']        = array();
        if (!isset($data['custom_cats']))  $data['custom_cats']  = array();
        if (!isset($data['income_tags']))  $data['income_tags']  = array();
        if (!isset($data['credit_cards'])) $data['credit_cards'] = array();
        if (!isset($data['bank_accounts'])) $data['bank_accounts'] = array();
        return $data;
    }

    protected function saveAll($budgetId, $data) {
        $file = $this->getDataFile($budgetId);
        $dir  = dirname($file);
        if (!is_dir($dir)) mkdir($dir, 0755, true);
        if (file_exists($file)) {
            $backupDir = $dir . '/budget_backups';
            if (!is_dir($backupDir)) mkdir($backupDir, 0755, true);
            $ts = date('Ymd_His');
            @copy($file, $backupDir . '/budget_' . $budgetId . '_' . $ts . '.json');
            $pattern = $backupDir . '/budget_' . $budgetId . '_*.json';
            $backups = glob($pattern);
            if ($backups && count($backups) > 3) {
                sort($backups);
                while (count($backups) > 3) { @unlink(array_shift($backups)); }
            }
        }
        return file_put_contents($file, json_encode($data, JSON_PRETTY_PRINT)) !== false;
    }

    // ── Data Manager ─────────────────────────────────────────

    protected function ajaxDataInfo($INPUT) {
        $budgetId = cleanID($INPUT->str('budget_id'));
        $file = $this->getDataFile($budgetId);
        $data = $this->loadAll($budgetId);

        $info = array(
            'file_path'     => $file,
            'file_exists'   => file_exists($file),
            'file_size'     => file_exists($file) ? filesize($file) : 0,
            'file_modified' => file_exists($file) ? date('Y-m-d H:i:s', filemtime($file)) : null,
            'counts'        => array(
                'entries'      => count($data['entries']),
                'budgets'      => count($data['budgets']),
                'rules'        => count($data['rules']),
                'custom_cats'  => count($data['custom_cats']),
                'income_tags'  => count($data['income_tags']),
                'credit_cards' => count($data['credit_cards']),
            ),
        );

        $backupDir = dirname($file) . '/budget_backups';
        $backupFiles = glob($backupDir . '/budget_' . $budgetId . '_*.json');
        $backups = array();
        if ($backupFiles) {
            rsort($backupFiles);
            foreach ($backupFiles as $bf) {
                $backups[] = array(
                    'file' => basename($bf),
                    'date' => date('Y-m-d H:i:s', filemtime($bf)),
                    'size' => filesize($bf),
                );
            }
        }
        $info['backups']    = $backups;
        $info['backup_dir'] = $backupDir;

        echo json_encode(array('success' => true, 'info' => $info));
    }

    protected function ajaxExportData($INPUT) {
        $budgetId = cleanID($INPUT->str('budget_id'));
        $data = $this->loadAll($budgetId);
        $data['_export_meta'] = array(
            'budget_id' => $budgetId,
            'exported'  => date('Y-m-d H:i:s'),
            'version'   => self::VERSION,
        );
        echo json_encode(array('success' => true, 'data' => $data));
    }

    protected function ajaxImportFull($INPUT) {
        $budgetId = cleanID($INPUT->str('budget_id'));
        $pageId   = $INPUT->str('page_id');
        if (!$this->canEdit($pageId)) { $this->deny(); return; }

        $raw = $INPUT->str('import_data');
        $imported = json_decode($raw, true);
        if (!is_array($imported)) {
            echo json_encode(array('success' => false, 'error' => 'Invalid JSON data'));
            return;
        }

        unset($imported['_export_meta']);

        $keys = array('entries', 'budgets', 'rules', 'custom_cats', 'income_tags', 'credit_cards');
        $what = $INPUT->str('restore_sections');
        $currentData = $this->loadAll($budgetId);

        if ($what === 'all') {
            foreach ($keys as $k) {
                if (isset($imported[$k])) $currentData[$k] = $imported[$k];
            }
        } else {
            $sections = array_map('trim', explode(',', $what));
            foreach ($sections as $s) {
                if (in_array($s, $keys) && isset($imported[$s])) $currentData[$s] = $imported[$s];
            }
        }

        $this->saveAll($budgetId, $currentData);

        $counts = array();
        foreach ($keys as $k) {
            $counts[$k] = count(isset($currentData[$k]) ? $currentData[$k] : array());
        }
        echo json_encode(array('success' => true, 'counts' => $counts));
    }

} // end class
