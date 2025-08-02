<?php
// Test file to verify our unified path functions work correctly
include 'functions.php';

echo "=== Test des chemins Poznote UNIFIÉS ===\n\n";

echo "Chemins absolus détectés (toujours dans webroot) :\n";
echo "- Entries path: " . getEntriesPath() . "\n";
echo "- Attachments path: " . getAttachmentsPath() . "\n\n";

echo "Chemins relatifs pour les opérations de fichiers (unifiés) :\n";
echo "- Entries relative: " . getEntriesRelativePath() . "\n";
echo "- Attachments relative: " . getAttachmentsRelativePath() . "\n\n";

echo "Vérification des répertoires (après unification) :\n";
echo "- entries/ exists: " . (is_dir('entries') ? 'OUI' : 'NON') . "\n";
echo "- attachments/ exists: " . (is_dir('attachments') ? 'OUI' : 'NON') . "\n\n";

echo "Configuration Docker :\n";
echo "- En production : volumes Docker montent les données externes sur entries/ et attachments/\n";
echo "- En développement : docker-compose-dev.yml monte ./data/* sur entries/ et attachments/\n";
echo "- Le code utilise toujours les mêmes chemins : entries/ et attachments/\n\n";

echo "Avantages de l'approche unifiée :\n";
echo "✅ Code simplifié - un seul chemin partout\n";
echo "✅ Plus de logique de fallback complexe\n";
echo "✅ Configuration Docker uniforme\n";
echo "✅ Maintenance facilitée\n\n";

echo "Test terminé.\n";
?>
