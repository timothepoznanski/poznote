<?php
// Debug display disabled for production
// (Previously enabled with display_errors / error_reporting for debugging)
require 'auth.php';

$error = '';

// Load configured login display name if present
try {
    require_once 'config.php';
    // Open a local PDO connection to read the setting without depending on global db_connect which may die()
    $login_display_name = '';
    try {
        $tmpCon = new PDO('sqlite:' . SQLITE_DATABASE);
        $tmpCon->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $stmt = $tmpCon->prepare("SELECT value FROM settings WHERE key = ?");
        $stmt->execute(['login_display_name']);
        $login_display_name = $stmt->fetchColumn();
        $tmpCon = null;
    } catch (Exception $e) {
        // ignore DB errors and leave display name empty
        $login_display_name = '';
    }
    if ($login_display_name === false) $login_display_name = '';
} catch (Exception $e) {
    $login_display_name = '';
}

// If already authenticated, redirect to home
if (isAuthenticated()) {
    // Redirect to index with JavaScript to include localStorage workspace
    // Include minimal HTML to ensure proper execution
    echo '<!DOCTYPE html><html><head>';
    echo '<script>
        var workspace = localStorage.getItem("poznote_selected_workspace");
        if (workspace) {
            window.location.href = "index.php?workspace=" + encodeURIComponent(workspace);
        } else {
            window.location.href = "index.php";
        }
    </script>';
    echo '</head><body>Redirecting...</body></html>';
    exit;
}

// Login form processing
if ($_POST && isset($_POST['username']) && isset($_POST['password'])) {
    $username = $_POST['username'];
    $password = $_POST['password'];
    if (authenticate($username, $password)) {
        // Redirect to index with JavaScript to include localStorage workspace
        // Include minimal HTML to ensure proper execution
        echo '<!DOCTYPE html><html><head>';
        echo '<script>
            var workspace = localStorage.getItem("poznote_selected_workspace");
            if (workspace) {
                window.location.href = "index.php?workspace=" + encodeURIComponent(workspace);
            } else {
                window.location.href = "index.php";
            }
        </script>';
        echo '</head><body>Redirecting...</body></html>';
        exit;
    } else {
        $error = 'Incorrect username or password.';
    }
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Login - Poznote</title>
    <link rel="stylesheet" href="css/login.css">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <link rel="icon" href="favicon.ico" type="image/x-icon">
</head>
<body>
    <div class="login-container">
        <div class="login-header">
            <div class="logo">
                <img src="favicon.ico" alt="Poznote" class="logo-favicon">
            </div>
            <h1 class="login-title"><?php echo htmlspecialchars($login_display_name !== '' ? $login_display_name : 'Poznote'); ?></h1>
        </div>
        
        <form method="POST">
            <div class="form-group">
                <input type="text" id="username" name="username" placeholder="Username" required autofocus autocomplete="username">
            </div>
            <div class="form-group">
                <input type="password" id="password" name="password" placeholder="Password" required autocomplete="current-password">
                <?php if ($error): ?>
                    <div class="error"><?php echo htmlspecialchars($error); ?></div>
                <?php endif; ?>
            </div>
            
            <button type="submit" class="login-button">Login</button>
        </form>
            <p class="github-link">
                <a href="https://github.com/timothepoznanski/poznote#reset-password" target="_blank">
                    Forgot your password?
                </a>
        </div>
    </div>
</body>
</html>
