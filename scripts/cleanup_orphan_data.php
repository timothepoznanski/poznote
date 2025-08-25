<?php
// Cleanup orphaned workspace-scoped settings and folders
require_once __DIR__ . '/../src/config.php';
require_once __DIR__ . '/../src/db_connect.php';

echo "Starting cleanup...\n";

try {
    $con->beginTransaction();

    // Load existing workspaces into a set
    $wsRows = $con->query("SELECT name FROM workspaces")->fetchAll(PDO::FETCH_COLUMN);
    $workspaces = array_map(function($v){ return (string)$v; }, $wsRows);

    echo "Found workspaces: " . implode(', ', $workspaces) . "\n";

    // 1) Remove settings keys default_folder_name::X where X is not an existing workspace
    $delSettingsStmt = $con->prepare("DELETE FROM settings WHERE key = ?");
    $checkSettingsStmt = $con->query("SELECT key FROM settings WHERE key LIKE 'default_folder_name::%'");
    $removedSettings = 0;
    while ($row = $checkSettingsStmt->fetch(PDO::FETCH_ASSOC)) {
        $key = $row['key'];
        $parts = explode('::', $key, 2);
        if (count($parts) === 2) {
            $scope = $parts[1];
            if (!in_array($scope, $workspaces, true)) {
                $delSettingsStmt->execute([$key]);
                $removedSettings++;
                echo "Removed setting: $key\n";
            }
        }
    }

    // 2) Move entries that reference non-existing workspaces to 'Poznote'
    $distinctEntriesWs = $con->query("SELECT DISTINCT workspace FROM entries WHERE workspace IS NOT NULL AND workspace != 'Poznote'")->fetchAll(PDO::FETCH_COLUMN);
    $fixedEntries = 0;
    foreach ($distinctEntriesWs as $ew) {
        if ($ew === null || trim($ew) === '') continue;
        if (!in_array($ew, $workspaces, true)) {
            $stmtUp = $con->prepare("UPDATE entries SET workspace = 'Poznote' WHERE workspace = ?");
            $stmtUp->execute([$ew]);
            $cnt = $stmtUp->rowCount();
            $fixedEntries += $cnt;
            echo "Moved $cnt entries from workspace '$ew' to 'Poznote'\n";
        }
    }

    // 3) Remove folders rows pointing to non-existing workspaces (and not Poznote/default)
    $foldersStmt = $con->query("SELECT id, name, workspace FROM folders");
    $delFolderStmt = $con->prepare("DELETE FROM folders WHERE id = ?");
    $removedFolders = 0;
    while ($f = $foldersStmt->fetch(PDO::FETCH_ASSOC)) {
        $fw = $f['workspace'];
        // treat NULL or empty as 'Poznote' or global; skip deletion for NULL/empty
        if ($fw === null || $fw === '' ) continue;
        if ($fw === 'Poznote' || $fw === 'default') continue;
        if (!in_array($fw, $workspaces, true)) {
            $delFolderStmt->execute([$f['id']]);
            $removedFolders++;
            echo "Removed folder row id={$f['id']} name={$f['name']} workspace={$fw}\n";
        }
    }

    $con->commit();

    echo "\nCleanup summary:\n";
    echo "  removed settings keys: $removedSettings\n";
    echo "  moved entries to Poznote: $fixedEntries\n";
    echo "  removed folders rows: $removedFolders\n";
    echo "Done.\n";

} catch (Exception $e) {
    $con->rollBack();
    echo "Error during cleanup: " . $e->getMessage() . "\n";
    exit(1);
}

?>
