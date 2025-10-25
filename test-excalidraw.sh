#!/bin/bash

# Script de test pour la feature Excalidraw

echo "=== Test de l'intégration Excalidraw ==="
echo ""

# Vérifier que tous les fichiers existent
echo "1. Vérification des fichiers créés..."

files=(
    "src/excalidraw_editor.php"
    "src/api_save_excalidraw.php"
    "src/js/excalidraw.js"
    "src/css/excalidraw.css"
    "EXCALIDRAW_FEATURE.md"
)

all_exist=true
for file in "${files[@]}"; do
    if [ -f "$file" ]; then
        echo "   ✓ $file existe"
    else
        echo "   ✗ $file MANQUANT"
        all_exist=false
    fi
done

echo ""

# Vérifier les modifications dans les fichiers existants
echo "2. Vérification des modifications..."

if grep -q "excalidraw" src/modals.php; then
    echo "   ✓ modals.php contient 'excalidraw'"
else
    echo "   ✗ modals.php ne contient pas 'excalidraw'"
    all_exist=false
fi

if grep -q "createExcalidrawNote" src/js/utils.js; then
    echo "   ✓ utils.js contient 'createExcalidrawNote'"
else
    echo "   ✗ utils.js ne contient pas 'createExcalidrawNote'"
    all_exist=false
fi

if grep -q "excalidraw.js" src/index.php; then
    echo "   ✓ index.php charge excalidraw.js"
else
    echo "   ✗ index.php ne charge pas excalidraw.js"
    all_exist=false
fi

if grep -q "excalidraw-preview-container" src/index.php; then
    echo "   ✓ index.php affiche les previews Excalidraw"
else
    echo "   ✗ index.php n'affiche pas les previews Excalidraw"
    all_exist=false
fi

echo ""

# Résumé
if [ "$all_exist" = true ]; then
    echo "✅ Tous les tests sont PASSÉS !"
    echo ""
    echo "Pour tester la fonctionnalité :"
    echo "1. Démarrez le serveur (docker-compose up ou php -S localhost:8000)"
    echo "2. Connectez-vous à Poznote"
    echo "3. Cliquez sur le bouton + (Create)"
    echo "4. Sélectionnez 'Excalidraw Diagram'"
    echo "5. Créez un diagramme"
    echo "6. Cliquez sur 'Save'"
    echo "7. Cliquez sur 'Return to notes'"
    echo "8. Vérifiez que l'aperçu s'affiche"
    echo "9. Cliquez sur l'aperçu pour ré-éditer"
    exit 0
else
    echo "❌ Certains tests ont ÉCHOUÉ"
    exit 1
fi
