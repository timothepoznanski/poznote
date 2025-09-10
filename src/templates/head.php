<head>
    <meta charset="utf-8"/>
    <meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1"/>
    <meta name="viewport" content="width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1"/>
    <title>Poznote</title>
    <link type="text/css" rel="stylesheet" href="css/index.css"/>
    <link type="text/css" rel="stylesheet" href="css/modal.css"/>
    <link rel="stylesheet" href="css/index-mobile.css" media="(max-width: 800px)">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" />
    <link rel="stylesheet" href="css/index-inline.css" />
    <script src="js/toolbar.js"></script>
    <script src="js/note-loader-common.js"></script>
    <script>
        // Load appropriate note loader based on device type
        if (window.innerWidth <= 800 || /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(navigator.userAgent)) {
            // Mobile device
            var mobileScript = document.createElement('script');
            mobileScript.src = 'js/note-loader-mobile.js';
            document.head.appendChild(mobileScript);
        } else {
            // Desktop device
            var desktopScript = document.createElement('script');
            desktopScript.src = 'js/note-loader-desktop.js';
            document.head.appendChild(desktopScript);
        }
    </script>
    <script src="js/index-login-prompt.js"></script>
    <script src="js/index-workspace-display.js"></script>
</head>
