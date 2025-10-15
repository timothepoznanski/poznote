<?php
require '../auth.php';
requireAuth();
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Poznote API Documentation</title>
    <link rel="stylesheet" href="swagger-ui/swagger-ui.css">
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
    </style>
</head>
<body>
    <div id="swagger-ui"></div>
    <script src="swagger-ui/swagger-ui-bundle.js"></script>
    <script src="swagger-ui/swagger-ui-standalone-preset.js"></script>
    <script>
        window.onload = function() {
            SwaggerUIBundle({
                url: "openapi.yaml",
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
