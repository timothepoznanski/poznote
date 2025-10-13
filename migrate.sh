#!/bin/bash

#############################################
# Script de migration Poznote
#############################################

set -e

echo "=== Migration Poznote ==="
echo ""

# Demander le chemin source
read -p "Chemin absolu SOURCE (ex: /root/poznote-old): " SOURCE
SOURCE="${SOURCE%/}"  # Retirer le / final si présent

# Demander le chemin destination
read -p "Chemin absolu DESTINATION (ex: /root/poznote-dev): " DEST
DEST="${DEST%/}"  # Retirer le / final si présent

echo ""
echo "Source: $SOURCE"
echo "Dest:   $DEST"
echo ""

# Vérifications
if [ ! -f "$SOURCE/data/database/poznote.db" ]; then
    echo "Erreur: Base source introuvable"
    exit 1
fi

# Créer les répertoires destination
mkdir -p "$DEST/data/database"
mkdir -p "$DEST/data/entries"
mkdir -p "$DEST/data/attachments"

# Migration base de données
echo "Migration base de données..."
for table in workspaces folders entries settings shared_notes; do
    sqlite3 "$SOURCE/data/database/poznote.db" << EOF 2>/dev/null | sqlite3 "$DEST/data/database/poznote.db" 2>/dev/null || true
.mode insert $table
SELECT * FROM $table;
EOF
done

# Compter les enregistrements migrés
total=$(sqlite3 "$DEST/data/database/poznote.db" "SELECT COUNT(*) FROM entries;" 2>/dev/null || echo 0)
echo "  → $total notes migrées"

# Migration fichiers
echo "Migration fichiers HTML..."
if [ -d "$SOURCE/data/entries" ]; then
    cp -r "$SOURCE/data/entries/"* "$DEST/data/entries/" 2>/dev/null || true
    echo "  → $(find "$DEST/data/entries" -type f 2>/dev/null | wc -l) fichiers"
fi

echo "Migration attachments..."
if [ -d "$SOURCE/data/attachments" ]; then
    cp -r "$SOURCE/data/attachments/"* "$DEST/data/attachments/" 2>/dev/null || true
    echo "  → $(find "$DEST/data/attachments" -type f 2>/dev/null | wc -l) fichiers"
fi

echo ""
echo "✓ Migration terminée"
