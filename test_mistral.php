<?php
require_once 'ai_providers/MistralProvider.php';

// Test avec une clé factice pour voir la structure de l'erreur
$provider = new MistralProvider('test_key', 'mistral-large-latest');
$result = $provider->testConnection();

echo "Test result:\n";
var_dump($result);

echo "\nAvailable models:\n";
var_dump($provider->getAvailableModels());
?>
