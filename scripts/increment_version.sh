#!/bin/bash

# Script pour préparer une nouvelle release
# Incrémente la version et prépare le merge vers main
# Usage: ./scripts/increment_version.sh

set -e

# Vérifier qu'on est sur la branche dev
current_branch=$(git branch --show-current)
if [ "$current_branch" != "dev" ]; then
    echo "❌ Erreur: Vous devez être sur la branche 'dev' pour exécuter ce script"
    echo "Branche actuelle: $current_branch"
    exit 1
fi

# Vérifier qu'il n'y a pas de changements non committés
if ! git diff --quiet || ! git diff --staged --quiet; then
    echo "❌ Erreur: Il y a des changements non committés. Veuillez les committer ou les stasher avant de continuer."
    exit 1
fi

# Vérifier que le repo est à jour avec remote
echo "🔄 Vérification des mises à jour depuis remote..."
git fetch origin

# Vérifier s'il y a des commits locaux non poussés
local_commits=$(git rev-list HEAD...origin/dev --count 2>/dev/null || echo "0")
if [ "$local_commits" -gt 0 ]; then
    echo "❌ Erreur: Il y a $local_commits commits locaux non poussés. Veuillez pousser vos changements d'abord."
    exit 1
fi

# Lire la version actuelle
if [ ! -f "version.txt" ]; then
    echo "❌ Erreur: Fichier version.txt introuvable"
    exit 1
fi

current_version=$(cat version.txt | tr -d '\n')
echo "📖 Version actuelle: $current_version"

# Parser la version sémantique
IFS='.' read -r major minor patch <<< "$current_version"

# Incrémenter la version patch
new_patch=$((patch + 1))
new_version="$major.$minor.$new_patch"

echo "⬆️ Nouvelle version: $new_version"

# Mettre à jour le fichier version.txt
echo "$new_version" > version.txt

# Commiter le changement
git add version.txt
git commit -m "🔖 Bump version to $new_version"

echo "✅ Version incrémentée et committée: $new_version"
echo ""
echo "📋 Prochaines étapes:"
echo "1. Pousser les changements: git push origin dev"
echo "2. Créer une Pull Request vers main depuis dev"
echo "3. Après le merge, GitHub Actions créera automatiquement le tag v$new_version"
echo "4. Le fichier version.txt sera synchronisé entre dev et main"