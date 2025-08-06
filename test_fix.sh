#!/bin/bash

# Test simple de la fonction corrigée
source setup.sh

echo "=== Test de la fonction get_port_with_validation ==="
echo "Simulation: user appuie ENTER pour garder le port 8040 actuel"

# Simulation d'entrée vide (ENTER)
result=$(echo "" | get_port_with_validation "Web Server Port [8040]: " "8040" "8040" 2>/dev/null)

echo "Résultat: $result"
echo "Test terminé - pas de boucle infinie !"
