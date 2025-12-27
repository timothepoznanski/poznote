<?php
/**
 * Gestion des favoris
 */

/**
 * Traite les favoris et les ajoute au tableau des dossiers
 * Now works with folder arrays containing 'id', 'name', and 'notes'
 * Also checks uncategorized notes (notes without folder)
 */
function handleFavorites($folders, $uncategorized_notes = []) {
    $favorites = [];
    
    // Parcourir tous les dossiers pour extraire les favoris
    foreach ($folders as $folderId => $folderData) {
        foreach ($folderData['notes'] as $note) {
            if ($note["favorite"]) {
                $favorites[] = $note;
            }
        }
    }
    
    // Also check uncategorized notes for favorites
    if (!empty($uncategorized_notes)) {
        foreach ($uncategorized_notes as $note) {
            if ($note["favorite"]) {
                $favorites[] = $note;
            }
        }
    }
    
    // Add favorites as a special folder if there are any favorites
    // Use a special ID for Favorites (0 or negative to distinguish from real folders)
    if (!empty($favorites)) {
        $folders = ['favorites' => [
            'id' => 'favorites',
            'name' => 'Favorites',
            'notes' => $favorites
        ]] + $folders;
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
    
    $stmt_check_favorite = $con->prepare("SELECT favorite FROM entries WHERE trash = 0 AND heading = ? AND workspace = ?");
    $stmt_check_favorite->execute([$note, $workspace_filter]);
    $favorite_data = $stmt_check_favorite->fetch(PDO::FETCH_ASSOC);
    
    return $favorite_data && $favorite_data['favorite'] == 1;
}

/**
 * Met à jour les dossiers avec résultats de recherche pour les favoris
 * Now works with folder arrays containing 'id', 'name', and 'notes'
 */
function updateFavoritesSearchResults($folders_with_results, $folders) {
    foreach ($folders as $folderId => $folderData) {
        foreach ($folderData['notes'] as $note) {
            if ($note["favorite"]) {
                $folders_with_results['Favorites'] = true;
                break;
            }
        }
    }
    
    return $folders_with_results;
}
