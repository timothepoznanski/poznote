<?php
/**
 * Script de nettoyage pour supprimer les anciens fichiers PNG d'Excalidraw
 * qui ne sont plus nécessaires maintenant que les images sont intégrées en base64 dans les HTML
 */

require_once 'config.php';
require_once 'functions.php';

echo "🧹 Nettoyage des anciens fichiers PNG Excalidraw...\n\n";

$entriesPath = getEntriesRelativePath();
$pngFiles = glob($entriesPath . "*.png");

if (empty($pngFiles)) {
    echo "✅ Aucun fichier PNG trouvé. Le dossier est déjà propre.\n";
    exit;
}

echo "📁 Fichiers PNG trouvés: " . count($pngFiles) . "\n";

$deletedCount = 0;
$errorCount = 0;

foreach ($pngFiles as $pngFile) {
    $filename = basename($pngFile);
    $noteId = str_replace('.png', '', $filename);
    
    echo "🗑️  Suppression de: $filename (note ID: $noteId)\n";
    
    if (unlink($pngFile)) {
        $deletedCount++;
    } else {
        echo "❌ Erreur lors de la suppression de: $filename\n";
        $errorCount++;
    }
}

echo "\n✅ Nettoyage terminé!\n";
echo "📊 Statistiques:\n";
echo "   - Fichiers supprimés: $deletedCount\n";
echo "   - Erreurs: $errorCount\n\n";

if ($errorCount === 0) {
    echo "🎉 Tous les anciens fichiers PNG ont été supprimés avec succès!\n";
    echo "   Les notes Excalidraw utilisent maintenant le format unifié HTML avec images base64.\n";
} else {
    echo "⚠️  Certains fichiers n'ont pas pu être supprimés. Vérifiez les permissions.\n";
}