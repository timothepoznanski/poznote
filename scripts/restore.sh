#!/bin/bash

# Script de restauration pour Poznote
# Usage: ./restore.sh <chemin_vers_fichier_backup.sql>

set -e

# Vérification des arguments
if [ $# -ne 1 ]; then
    echo "Usage: $0 <chemin_vers_fichier_backup.sql>"
    echo "Exemple: $0 /path/to/poznote_backup_2025-01-31_14-30-00.sql"
    exit 1
fi

BACKUP_FILE="$1"
CONTAINER_NAME="poznote-database-1"  # Nom du conteneur MySQL

# Vérifier que le fichier de sauvegarde existe
if [ ! -f "$BACKUP_FILE" ]; then
    echo "Erreur: Le fichier de sauvegarde '$BACKUP_FILE' n'existe pas"
    exit 1
fi

# Vérifier que le conteneur existe et est en cours d'exécution
if ! docker ps | grep -q "$CONTAINER_NAME"; then
    echo "Erreur: Le conteneur '$CONTAINER_NAME' n'est pas en cours d'exécution"
    echo "Assurez-vous que Poznote est démarré avec docker-compose"
    exit 1
fi

echo "=== ATTENTION ==="
echo "Cette opération va REMPLACER COMPLÈTEMENT votre base de données actuelle"
echo "avec le contenu du fichier: $BACKUP_FILE"
echo "Fichier de sauvegarde: $(basename "$BACKUP_FILE")"
echo "Taille: $(du -h "$BACKUP_FILE" | cut -f1)"
echo "Date de modification: $(date -r "$BACKUP_FILE" '+%Y-%m-%d %H:%M:%S')"
echo "=================="
echo ""

read -p "Êtes-vous sûr de vouloir continuer? (oui/non): " -r
if [[ ! $REPLY =~ ^(oui|OUI|yes|YES|y|Y)$ ]]; then
    echo "Restauration annulée"
    exit 0
fi

echo "Début de la restauration..."

# Copier le fichier de sauvegarde dans le conteneur
echo "Copie du fichier de sauvegarde dans le conteneur..."
docker cp "$BACKUP_FILE" "$CONTAINER_NAME:/tmp/restore.sql"

# Restaurer la base de données
echo "Restauration de la base de données..."
docker exec "$CONTAINER_NAME" mysql -u root -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE" -e "source /tmp/restore.sql"

if [ $? -eq 0 ]; then
    echo "Base de données restaurée avec succès!"
    
    # Nettoyer le fichier temporaire
    docker exec "$CONTAINER_NAME" rm -f /tmp/restore.sql
    
    echo ""
    echo "Restauration terminée. Votre application utilise maintenant les données"
    echo "du fichier de sauvegarde: $(basename "$BACKUP_FILE")"
else
    echo "Erreur lors de la restauration de la base de données"
    # Nettoyer le fichier temporaire même en cas d'erreur
    docker exec "$CONTAINER_NAME" rm -f /tmp/restore.sql
    exit 1
fi
