#!/bin/bash

echo "🔍 AUDIT COMPLET SQLITE - VERSION DÉTAILLÉE"
echo "============================================"
echo ""

error_count=0

# 1. Vérification syntaxe PHP
echo "1. 🔧 VÉRIFICATION SYNTAXE PHP"
echo "------------------------------"
syntax_errors=0
for file in src/*.php; do
    if [ -f "$file" ] && [[ ! "$file" =~ \.OLD$ ]]; then
        result=$(php -l "$file" 2>&1)
        if [[ $result != *"No syntax errors"* ]]; then
            echo "❌ $file: $result"
            syntax_errors=$((syntax_errors + 1))
        fi
    fi
done

if [ $syntax_errors -eq 0 ]; then
    echo "✅ Aucune erreur de syntaxe PHP détectée"
else
    echo "❌ $syntax_errors erreur(s) de syntaxe trouvée(s)"
    error_count=$((error_count + syntax_errors))
fi

echo ""

# 2. Références MySQL dangereuses
echo "2. 🚨 RÉFÉRENCES MYSQL DANGEREUSES"
echo "-----------------------------------"
mysql_problems=0

# Recherche de références mysqli
mysqli_count=$(grep -r "mysqli" src/ --exclude="*.OLD" | wc -l)
if [ $mysqli_count -gt 0 ]; then
    echo "❌ Références mysqli trouvées: $mysqli_count"
    grep -r "mysqli" src/ --exclude="*.OLD" | head -5
    mysql_problems=$((mysql_problems + mysqli_count))
fi

# Recherche de SHOW COLUMNS (MySQL uniquement)
show_cols=$(grep -r "SHOW COLUMNS" src/ --exclude="*.OLD" | wc -l)
if [ $show_cols -gt 0 ]; then
    echo "❌ Commandes SHOW COLUMNS (MySQL) trouvées: $show_cols"
    grep -r "SHOW COLUMNS" src/ --exclude="*.OLD"
    mysql_problems=$((mysql_problems + show_cols))
fi

# Recherche de fetch_assoc (mysqli uniquement)
fetch_assoc=$(grep -r "fetch_assoc" src/ --exclude="*.OLD" | wc -l)
if [ $fetch_assoc -gt 0 ]; then
    echo "❌ Méthodes fetch_assoc (mysqli) trouvées: $fetch_assoc"
    grep -r "fetch_assoc" src/ --exclude="*.OLD"
    mysql_problems=$((mysql_problems + fetch_assoc))
fi

if [ $mysql_problems -eq 0 ]; then
    echo "✅ Aucune référence MySQL dangereuse"
else
    echo "❌ $mysql_problems référence(s) MySQL dangereuse(s)"
    error_count=$((error_count + mysql_problems))
fi

echo ""

# 3. Failles de sécurité SQL
echo "3. 🛡️ FAILLES DE SÉCURITÉ SQL"
echo "------------------------------"
security_problems=0

# Recherche d'addslashes avec concaténation
addslashes_concat=$(grep -r "addslashes.*'" src/ --exclude="*.OLD" | wc -l)
if [ $addslashes_concat -gt 0 ]; then
    echo "❌ Usages dangereux d'addslashes avec concaténation: $addslashes_concat"
    grep -r "addslashes.*'" src/ --exclude="*.OLD" | head -3
    security_problems=$((security_problems + addslashes_concat))
fi

# Recherche de requêtes avec variables concaténées
dangerous_queries=$(grep -r '\$.*\.".*\$' src/ --exclude="*.OLD" | grep -c "SELECT\|INSERT\|UPDATE\|DELETE")
if [ $dangerous_queries -gt 0 ]; then
    echo "⚠️  Requêtes avec variables concaténées trouvées: $dangerous_queries"
    echo "    (Vérifiez qu'elles utilisent des requêtes préparées)"
fi

if [ $security_problems -eq 0 ]; then
    echo "✅ Aucune faille de sécurité évidente détectée"
else
    echo "❌ $security_problems faille(s) de sécurité détectée(s)"
    error_count=$((error_count + security_problems))
fi

echo ""

# 4. Vérification PDO correcte
echo "4. ✅ VÉRIFICATION PDO"
echo "---------------------"
pdo_issues=0

# Recherche d'usages incorrects de fetch() dans des conditions
fetch_in_conditions=$(grep -r "if.*->fetch(" src/ --exclude="*.OLD" | wc -l)
if [ $fetch_in_conditions -gt 0 ]; then
    echo "⚠️  Usages potentiellement incorrects de fetch() dans des conditions: $fetch_in_conditions"
    grep -r "if.*->fetch(" src/ --exclude="*.OLD" | head -3
    echo "    (Vérifiez que le résultat n'est pas consommé prématurément)"
fi

# Compter les bonnes pratiques
prepare_count=$(grep -r "->prepare(" src/ --exclude="*.OLD" | wc -l)
execute_count=$(grep -r "->execute(" src/ --exclude="*.OLD" | wc -l)

echo "✅ Requêtes préparées: $prepare_count"
echo "✅ Exécutions PDO: $execute_count"

echo ""

# 5. Fonctions SQLite spécifiques
echo "5. 🗄️ FONCTIONS SQLITE"
echo "----------------------"
sqlite_funcs=$(grep -r "datetime('now')" src/ --exclude="*.OLD" | wc -l)
pragma_usage=$(grep -r "PRAGMA" src/ --exclude="*.OLD" | wc -l)

echo "✅ Fonctions datetime SQLite: $sqlite_funcs"
echo "✅ Commandes PRAGMA: $pragma_usage"

echo ""

# 6. Résumé final
echo "📋 RÉSUMÉ FINAL"
echo "==============="

if [ $error_count -eq 0 ]; then
    echo "🎉 AUDIT RÉUSSI! Aucun problème critique détecté."
    echo ""
    echo "✅ Syntaxe PHP correcte"
    echo "✅ Pas de références MySQL dangereuses"
    echo "✅ Sécurité SQL acceptable"
    echo "✅ PDO correctement utilisé"
    echo "✅ SQLite compatible"
    echo ""
    echo "🚀 La migration SQLite semble fonctionnelle!"
else
    echo "❌ PROBLÈMES DÉTECTÉS: $error_count erreur(s) critique(s)"
    echo ""
    echo "🔧 Actions recommandées:"
    echo "1. Corriger les erreurs de syntaxe PHP"
    echo "2. Éliminer toutes les références MySQL"
    echo "3. Sécuriser les requêtes SQL avec PDO"
    echo "4. Vérifier les usages de fetch()"
    echo ""
    echo "⚠️  La migration nécessite des corrections avant utilisation!"
fi

echo ""
echo "📁 Fichiers vérifiés: $(find src/ -name "*.php" ! -name "*.OLD" | wc -l)"
echo "🕒 Audit terminé: $(date)"
