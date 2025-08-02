<?php
require 'auth.php';

$error = '';

// Si déjà authentifié, rediriger vers l'accueil
if (isAuthenticated()) {
    header('Location: index.php');
    exit;
}

// Traitement du formulaire de connexion
if ($_POST && isset($_POST['password'])) {
    $password = $_POST['password'];
    if (authenticate($password)) {
        header('Location: index.php');
        exit;
    } else {
        $error = 'Incorrect password.';
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
    <link rel="icon" href="favicon.ico" type="image/x-icon">
</head>
<body>
    <div class="login-container">
        <div class="login-header">
            <div class="logo">
                <img src="favicon.ico" alt="Poznote" class="logo-favicon">
            </div>
            <h1 class="login-title">Poznote</h1>
        </div>
        
        <form method="POST">
            <div class="form-group">
                <input type="password" id="password" name="password" placeholder="Password" required autofocus>
                <?php if ($error): ?>
                    <div class="error"><?php echo htmlspecialchars($error); ?></div>
                <?php endif; ?>
            </div>
            
            <button type="submit" class="login-button">Login</button>
        </form>
        
                <div class="info">
            To change the password, rerun the setup script and select "Change configuration". <br>See <a href="https://github.com/timothepoznanski/poznote#configuration-updates" target="_blank">README.md configuration section</a>.<br>
            Default password: <code>admin123</code>
        </div>
    </div>
</body>
</html>
