<?php
// Script de test pour vérifier la suppression des pièces jointes
require_once 'src/config.php';
require_once 'src/functions.php';
require_once 'src/db_connect.php';

echo "=== Test de suppression des pièces jointes ===\n";

// Afficher la fonction utilisée pour le chemin des attachments
echo "Chemin des attachments: " . getAttachmentsRelativePath() . "\n";

// Créer un fichier de test
$test_filename = 'test_' . uniqid() . '.txt';
$test_path = getAttachmentsRelativePath() . $test_filename;
file_put_contents($test_path, "Contenu de test");
echo "Fichier créé: $test_path\n";

// Vérifier qu'il existe
if (file_exists($test_path)) {
    echo "✓ Fichier existe: $test_path\n";
} else {
    echo "✗ Erreur: Fichier n'existe pas: $test_path\n";
    exit(1);
}

// Tester la suppression avec la nouvelle logique
$attachments = [
    ['filename' => $test_filename]
];

foreach ($attachments as $attachment) {
    if (isset($attachment['filename'])) {
        $attachmentFile = getAttachmentsRelativePath() . $attachment['filename'];
        echo "Tentative de suppression: $attachmentFile\n";
        if (file_exists($attachmentFile)) {
            if (unlink($attachmentFile)) {
                echo "✓ Fichier supprimé avec succès: $attachmentFile\n";
            } else {
                echo "✗ Erreur lors de la suppression: $attachmentFile\n";
            }
        } else {
            echo "✗ Fichier non trouvé: $attachmentFile\n";
        }
    }
}

// Vérifier qu'il n'existe plus
if (!file_exists($test_path)) {
    echo "✓ Confirmation: fichier bien supprimé\n";
} else {
    echo "✗ Erreur: fichier toujours présent\n";
}

echo "=== Test terminé ===\n";
?>
