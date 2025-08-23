<?php
// Test direct de permanentDelete.php
require_once 'src/auth.php';
require_once 'src/config.php';
require_once 'src/functions.php';
require_once 'src/db_connect.php';

$id = 3071; // ID de notre note test

echo "=== Test de permanentDelete.php ===\n";

// Récupérer les données de la note avant suppression
$stmt = $con->prepare("SELECT attachments FROM entries WHERE id = ?");
$stmt->execute([$id]);
$result = $stmt->fetch(PDO::FETCH_ASSOC);

if ($result) {
    echo "Note trouvée, attachments: " . $result['attachments'] . "\n";
    $attachments = $result['attachments'] ? json_decode($result['attachments'], true) : [];
    
    // Delete attachment files from filesystem
    if (is_array($attachments) && !empty($attachments)) {
        foreach ($attachments as $attachment) {
            if (isset($attachment['filename'])) {
                $attachmentFile = getAttachmentsRelativePath() . $attachment['filename'];
                echo "Vérification du fichier: $attachmentFile\n";
                if (file_exists($attachmentFile)) {
                    echo "✓ Fichier trouvé, suppression...\n";
                    if (unlink($attachmentFile)) {
                        echo "✓ Fichier supprimé: " . $attachment['filename'] . "\n";
                    } else {
                        echo "✗ Erreur suppression: " . $attachment['filename'] . "\n";
                    }
                } else {
                    echo "✗ Fichier non trouvé: $attachmentFile\n";
                }
            }
        }
    }
} else {
    echo "Note non trouvée\n";
}

// Delete HTML file
$filename = getEntriesRelativePath() . $id . ".html";
if (file_exists($filename)) {
    unlink($filename);
    echo "✓ Fichier HTML supprimé\n";
}

// Delete database entry
$stmt = $con->prepare("DELETE FROM entries WHERE id = ?");
if ($stmt->execute([$id])) {
    echo "✓ Entrée base de données supprimée\n";
} else {
    echo "✗ Erreur suppression base de données\n";
}

echo "=== Test terminé ===\n";
?>
