// Welcome page functions
function createFirstNote() {
    // Create a new note using the same logic as newnote() function
    var params = new URLSearchParams({
        now: (new Date().getTime()/1000)-new Date().getTimezoneOffset()*60,
        folder: 'Uncategorized' // Default folder for first note
    });
    fetch("insertnew.php", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString()
    })
    .then(response => response.text())
    .then(function(data) {
        try {
            var res = typeof data === 'string' ? JSON.parse(data) : data;
            if(res.status === 1) {
                window.scrollTo(0, 0);
                window.location.href = "index.php?note=" + encodeURIComponent(res.heading);
            } else {
                console.error('Error creating note:', res.error || data);
                // Fallback: just redirect to index page
                window.location.href = "index.php";
            }
        } catch(e) {
            console.error('Error parsing response:', e, data);
            // Fallback: just redirect to index page
            window.location.href = "index.php";
        }
    })
    .catch(function(error) {
        console.error('Network error:', error);
        // Fallback: just redirect to index page
        window.location.href = "index.php";
    });
}
