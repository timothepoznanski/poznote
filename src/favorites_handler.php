<?php
/**
 * Gestion des favoris
 */

/**
 * Traite les favoris et les ajoute au tableau des dossiers
 */
function handleFavorites($folders) {
    $favorites = [];
    
    // Parcourir tous les dossiers pour extraire les favoris
    foreach ($folders as $folderName => $notes) {
        foreach ($notes as $note) {
            if ($note["favorite"]) {
                $favorites[] = $note;
            }
        }
    }
    
    // Add favorites as a special folder if there are any favorites
    if (!empty($favorites)) {
        $folders = ['Favorites' => $favorites] + $folders;
    }
    
    return $folders;
}

/**
 * Vérifie si une note est favorite
 */
function isNoteFavorite($con, $note, $workspace_filter) {
    if (empty($note)) {
        return false;
    }
    
    $stmt_check_favorite = $con->prepare("SELECT favorite FROM entries WHERE trash = 0 AND heading = ? AND (workspace = ? OR (workspace IS NULL AND ? = 'Poznote'))");
    $stmt_check_favorite->execute([$note, $workspace_filter, $workspace_filter]);
    $favorite_data = $stmt_check_favorite->fetch(PDO::FETCH_ASSOC);
    
    return $favorite_data && $favorite_data['favorite'] == 1;
}

/**
 * Met à jour les dossiers avec résultats de recherche pour les favoris
 */
function updateFavoritesSearchResults($folders_with_results, $folders) {
    foreach ($folders as $folderName => $notes) {
        foreach ($notes as $note) {
            if ($note["favorite"]) {
                $folders_with_results['Favorites'] = true;
                break;
            }
        }
    }
    
    return $folders_with_results;
}
