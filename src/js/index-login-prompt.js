// Ensure the prompt function exists in case external JS hasn't loaded yet
if (typeof window.showLoginDisplayNamePrompt !== 'function') {
    window.showLoginDisplayNamePrompt = function(){
        var val = prompt('Login display name (blank to clear):');
        if (val === null) return;
        var xhr = new XMLHttpRequest();
        xhr.open('POST', 'api_settings.php');
        xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
        xhr.onload = function(){ try { var resp = JSON.parse(xhr.responseText); if (resp && resp.success) alert('Saved'); else alert('Error'); } catch(e){ alert('Error'); } };
        xhr.send('action=set&key=login_display_name&value=' + encodeURIComponent(val));
    };
}
