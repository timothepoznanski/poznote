<?php
session_start();

// Simple auth check
$configured_port = $_ENV['HTTP_WEB_PORT'] ?? '8040';
$session_name = 'POZNOTE_SESSION_' . $configured_port;
session_name($session_name);

if (!isset($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true) {
    http_response_code(401);
    echo "Authentication required";
    exit;
}

header('Content-Type: text/plain');

echo "Git Commands Test\n";
echo "=================\n\n";

// Test git commands individually
echo "1. Checking git repository:\n";
if (is_dir('../.git')) {
    echo "   ✓ Git repository found\n";
} else {
    echo "   ✗ Git repository NOT found\n";
}

echo "\n2. Current directory:\n";
echo "   " . getcwd() . "\n";

echo "\n3. Changing to root directory:\n";
$original_dir = getcwd();
chdir('..');
echo "   New directory: " . getcwd() . "\n";

echo "\n4. Getting current commit:\n";
$current_commit = trim(shell_exec('git rev-parse HEAD 2>/dev/null') ?? '');
if ($current_commit) {
    echo "   ✓ Current commit: " . substr($current_commit, 0, 8) . "\n";
} else {
    echo "   ✗ Could not get current commit\n";
}

echo "\n5. Getting current branch:\n";
$current_branch = trim(shell_exec('git branch --show-current 2>/dev/null') ?? '');
if ($current_branch) {
    echo "   ✓ Current branch: " . $current_branch . "\n";
} else {
    echo "   ✗ Could not get current branch\n";
}

echo "\n6. Fetching from remote:\n";
exec('git fetch origin main 2>&1', $output, $return_code);
if ($return_code === 0) {
    echo "   ✓ Fetch successful\n";
} else {
    echo "   ✗ Fetch failed (return code: $return_code)\n";
    echo "   Output: " . implode("\n           ", $output) . "\n";
}

echo "\n7. Getting remote commit:\n";
$remote_commit = trim(shell_exec('git rev-parse origin/main 2>/dev/null') ?? '');
if ($remote_commit) {
    echo "   ✓ Remote commit: " . substr($remote_commit, 0, 8) . "\n";
} else {
    echo "   ✗ Could not get remote commit\n";
}

echo "\n8. Comparing commits:\n";
if ($current_commit && $remote_commit) {
    if ($current_commit === $remote_commit) {
        echo "   ✓ Repository is up to date\n";
    } else {
        echo "   ! Updates available: " . substr($current_commit, 0, 8) . " → " . substr($remote_commit, 0, 8) . "\n";
        
        // Count commits behind
        $behind_output = shell_exec('git rev-list --count HEAD..origin/main 2>/dev/null');
        $behind_count = intval(trim($behind_output ?? '0'));
        echo "   ! Commits behind: " . $behind_count . "\n";
    }
} else {
    echo "   ✗ Cannot compare commits\n";
}

echo "\n9. Testing setup.sh script:\n";
$setup_output = shell_exec('./setup.sh --check-updates 2>&1');
if ($setup_output) {
    echo "   Output: " . trim($setup_output) . "\n";
} else {
    echo "   ✗ No output from setup.sh\n";
}

// Return to original directory
chdir($original_dir);
echo "\n10. Returned to original directory: " . getcwd() . "\n";

echo "\nTest completed!\n";
?>
