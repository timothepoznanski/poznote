<?php
require_once __DIR__ . '/../../auth.php';
requireAuth();

// Swagger UI is vendored next to this page, so it cannot go through
// poznoteAsset(): that helper resolves paths against the docroot, and these
// hrefs must stay relative to /api-docs/. Same idea though, key the URL on the
// file's own mtime so an update is picked up instead of served from the
// browser cache for another year.
$swaggerAsset = static function (string $file): string {
    $absolutePath = __DIR__ . '/' . $file;
    $mtime = is_file($absolutePath) ? @filemtime($absolutePath) : false;
    $href = $mtime !== false ? $file . '?v=' . rawurlencode((string) $mtime) : $file;
    return htmlspecialchars($href, ENT_QUOTES, 'UTF-8');
};
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Poznote API Documentation</title>
    <link rel="stylesheet" href="<?php echo $swaggerAsset('swagger-ui/swagger-ui.css'); ?>">
    <style>
        body {
            margin: 0;
            padding: 0;
        }
        #swagger-ui {
            max-width: 1460px;
            margin: 0 auto;
        }
        /* Masquer le bloc scheme-container (Authorize button) */
        .swagger-ui .scheme-container {
            display: none;
        }
        /* Retirer la barre en dessous des opblock-tag */
        .swagger-ui .opblock-tag {
            border-bottom: none;
        }
        /* Réduire l'espace vide sous le titre */
        .swagger-ui .info {
            margin-bottom: 0;
        }
        .swagger-ui .info .description {
            display: none;
        }
        .swagger-ui .info .main .url {
            display: none;
        }
    </style>
</head>
<body>
    <div id="swagger-ui"></div>
    <script src="<?php echo $swaggerAsset('swagger-ui/swagger-ui-bundle.js'); ?>"></script>
    <script src="<?php echo $swaggerAsset('swagger-ui/swagger-ui-standalone-preset.js'); ?>"></script>
    <script>
        window.onload = function() {
            SwaggerUIBundle({
                url: "<?php echo $swaggerAsset('openapi.yaml'); ?>",
                dom_id: '#swagger-ui',
                deepLinking: true,
                presets: [
                    SwaggerUIBundle.presets.apis,
                    SwaggerUIStandalonePreset
                ],
                layout: "StandaloneLayout"
            });
        };
    </script>
</body>
</html>
