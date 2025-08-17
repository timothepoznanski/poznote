<?php
require 'auth.php';

$error = '';

// If already authenticated, redirect to home
if (isAuthenticated()) {
    header('Location: index.php');
    exit;
}

// Login form processing
if ($_POST && isset($_POST['username']) && isset($_POST['password'])) {
    $username = $_POST['username'];
    $password = $_POST['password'];
    if (authenticate($username, $password)) {
        header('Location: index.php');
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
    <title>Login - <?php echo APP_NAME_DISPLAYED; ?></title>
    <link rel="stylesheet" href="css/login.css">
    <link rel="stylesheet" href="css/font-awesome.min.css">
    <link rel="icon" href="favicon.ico" type="image/x-icon">
</head>
<body>
    <div class="login-container">
        <div class="login-header">
            <div class="logo">
                <img src="favicon.ico" alt="<?php echo APP_NAME_DISPLAYED; ?>" class="logo-favicon">
            </div>
            <h1 class="login-title"><?php echo APP_NAME_DISPLAYED; ?></h1>
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
