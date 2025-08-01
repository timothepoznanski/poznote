#!/bin/bash

# Script de sauvegarde automatique pour Poznote
# Ce script peut être ajouté à crontab pour des sauvegardes régulières

set -e

# Configuration (modifiez selon vos besoins)
BACKUP_DIR="/root/poznote/poznote/src/backups"
CONTAINER_NAME="poznote-database-1"  # Nom du conteneur MySQL
MAX_BACKUPS=10  # Nombre maximum de sauvegardes à conserver

# Créer le répertoire de sauvegarde s'il n'existe pas
mkdir -p "$BACKUP_DIR"

# Générer le nom du fichier de sauvegarde
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
BACKUP_FILE="poznote_backup_${TIMESTAMP}.sql"
BACKUP_PATH="$BACKUP_DIR/$BACKUP_FILE"

echo "Création de la sauvegarde: $BACKUP_FILE"

# Créer la sauvegarde en utilisant mysqldump dans le conteneur
docker exec "$CONTAINER_NAME" mysqldump -u root -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE" > "$BACKUP_PATH"

if [ $? -eq 0 ]; then
    echo "Sauvegarde créée avec succès: $BACKUP_PATH"
    echo "Taille: $(du -h "$BACKUP_PATH" | cut -f1)"
else
    echo "Erreur lors de la création de la sauvegarde"
    exit 1
fi

# Nettoyer les anciennes sauvegardes (garder seulement les MAX_BACKUPS plus récentes)
echo "Nettoyage des anciennes sauvegardes..."
cd "$BACKUP_DIR"
ls -t poznote_backup_*.sql 2>/dev/null | tail -n +$((MAX_BACKUPS + 1)) | xargs -r rm -f

echo "Nettoyage terminé. Sauvegardes restantes:"
ls -lah poznote_backup_*.sql 2>/dev/null || echo "Aucune sauvegarde trouvée"

echo "Sauvegarde terminée avec succès!"
