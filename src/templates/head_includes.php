<?php
// Simple head includes template
?>

<!-- CSS Files -->
<link type="text/css" rel="stylesheet" href="css/index.css"/>
<link type="text/css" rel="stylesheet" href="css/modal.css"/>
<link rel="stylesheet" href="css/index-mobile.css" media="(max-width: 800px)">
<link rel="stylesheet" href="vendor/fontawesome/local-icons.css" />
<link rel="stylesheet" href="css/index-inline.css" />
<link rel="stylesheet" href="css/font-size-settings.css" />
<link rel="stylesheet" href="css/tasklist.css" />

<!-- JavaScript Files -->
<script src="js/toolbar.js"></script>
<script src="js/note-loader-common.js"></script>

<!-- Device-specific note loader -->
<script>
    if (window.innerWidth <= 800 || /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(navigator.userAgent)) {
        var mobileScript = document.createElement('script');
        mobileScript.src = 'js/note-loader-mobile.js';
        document.head.appendChild(mobileScript);
    } else {
        var desktopScript = document.createElement('script');
        desktopScript.src = 'js/note-loader-desktop.js';
        document.head.appendChild(desktopScript);
    }
</script>

<script src="js/index-login-prompt.js"></script>
<script src="js/index-workspace-display.js"></script>
<script src="js/tasklist.js"></script>
