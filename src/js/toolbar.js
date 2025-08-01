function addLinkToNote() {
  const url = prompt('Enter the link URL:', 'https://');
  if (url && url.trim() !== '' && url !== 'https://') {
    document.execCommand('createLink', false, url);
  }
}

function toggleRedColor() {
  document.execCommand('styleWithCSS', false, true);
  const sel = window.getSelection();
  if (sel.rangeCount > 0) {
    const range = sel.getRangeAt(0);
    let allRed = true, hasText = false;
    const treeWalker = document.createTreeWalker(range.commonAncestorContainer, NodeFilter.SHOW_TEXT, {
      acceptNode: function(node) {
        if (!range.intersectsNode(node)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    let node = treeWalker.currentNode;
    while(node) {
      if (node.nodeType === 3 && node.nodeValue.trim() !== '') {
        hasText = true;
        let parent = node.parentNode;
        let color = '';
        if (parent && parent.style && parent.style.color) color = parent.style.color.replace(/\s/g, '').toLowerCase();
        if (color !== '#ff2222' && color !== 'rgb(255,34,34)') allRed = false;
      }
      node = treeWalker.nextNode();
    }
    if (hasText && allRed) {
      document.execCommand('foreColor', false, 'black');
    } else {
      document.execCommand('foreColor', false, '#ff2222');
    }
  }
  document.execCommand('styleWithCSS', false, false);
}

function toggleYellowHighlight() {
  const sel = window.getSelection();
  if (sel.rangeCount > 0) {
    const range = sel.getRangeAt(0);
    let allYellow = true, hasText = false;
    const treeWalker = document.createTreeWalker(range.commonAncestorContainer, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: function(node) {
        if (!range.intersectsNode(node)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    let node = treeWalker.currentNode;
    while(node) {
      if (node.nodeType === 3 && node.nodeValue.trim() !== '') {
        hasText = true;
        let parent = node.parentNode;
        let bg = '';
        if (parent && parent.style && parent.style.backgroundColor) bg = parent.style.backgroundColor.replace(/\s/g, '').toLowerCase();
        if (bg !== '#ffe066' && bg !== 'rgb(255,224,102)') allYellow = false;
      }
      node = treeWalker.nextNode();
    }
    document.execCommand('styleWithCSS', false, true);
    if (hasText && allYellow) {
      document.execCommand('hiliteColor', false, 'inherit');
    } else {
      document.execCommand('hiliteColor', false, '#ffe066');
    }
    document.execCommand('styleWithCSS', false, false);
  }
}

function changeFontSize() {
  const size = prompt('Taille de police (1-7):', '3');
  if (size) document.execCommand('fontSize', false, size);
}

function toggleCodeBlock() {
  const sel = window.getSelection();
  if (!sel.rangeCount) return;
  
  const range = sel.getRangeAt(0);
  let container = range.commonAncestorContainer;
  if (container.nodeType === 3) container = container.parentNode;
  
  // Si déjà dans un bloc code, on le retire
  const existingPre = container.closest ? container.closest('pre') : null;
  if (existingPre) {
    const text = existingPre.textContent;
    existingPre.outerHTML = text.replace(/\n/g, '<br>');
    return;
  }
  
  // Sinon, créer un bloc code avec le texte sélectionné
  if (sel.isCollapsed) {
    // Pas de sélection : insérer un bloc vide
    document.execCommand('insertHTML', false, '<pre class="code-block"><br></pre>');
    // Add copy button to newly created code block
    setTimeout(() => {
      if (typeof addCopyButtonsToCodeBlocks === 'function') {
        addCopyButtonsToCodeBlocks();
      }
    }, 100);
    return;
  }
  
  // Récupérer le texte sélectionné
  const selectedText = sel.toString();
  if (!selectedText.trim()) return;
  
  // Échapper le HTML et créer le bloc code
  const escapedText = selectedText
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  
  const codeHTML = `<pre class="code-block">${escapedText}</pre>`;
  document.execCommand('insertHTML', false, codeHTML);
  
  // Add copy button to newly created code block
  setTimeout(() => {
    if (typeof addCopyButtonsToCodeBlocks === 'function') {
      addCopyButtonsToCodeBlocks();
    }
  }, 100);
}

function insertSeparator() {
  const sel = window.getSelection();
  if (!sel.rangeCount) return;
  
  const range = sel.getRangeAt(0);
  let container = range.commonAncestorContainer;
  if (container.nodeType === 3) container = container.parentNode;
  const noteentry = container.closest && container.closest('.noteentry');
  
  if (!noteentry) return;
  
  // Essayer d'abord avec execCommand pour les navigateurs qui le supportent encore
  try {
    const hrHTML = '<hr style="border: none; border-top: 1px solid #bbb; margin: 12px 0;">';
    const success = document.execCommand('insertHTML', false, hrHTML);
    
    if (success) {
      // Déclenche un événement input
      noteentry.dispatchEvent(new Event('input', {bubbles:true}));
      return;
    }
  } catch (e) {
    // execCommand a échoué, utiliser l'approche manuelle
  }
  
  // Fallback : insertion manuelle avec support d'annulation via l'API moderne
  const hr = document.createElement('hr');
  hr.style.border = 'none';
  hr.style.borderTop = '1px solid #bbb';
  hr.style.margin = '12px 0';
  
  // Déclencher un événement beforeinput pour l'historique d'annulation
  const beforeInputEvent = new InputEvent('beforeinput', {
    bubbles: true,
    cancelable: true,
    inputType: 'insertText',
    data: null
  });
  
  if (noteentry.dispatchEvent(beforeInputEvent)) {
    // Insérer l'élément
    if (!range.collapsed) {
      range.deleteContents();
    }
    range.insertNode(hr);
    
    // Positionner le curseur après le HR
    range.setStartAfter(hr);
    range.setEndAfter(hr);
    sel.removeAllRanges();
    sel.addRange(range);
    
    // Déclencher l'événement input
    const inputEvent = new InputEvent('input', {
      bubbles: true,
      inputType: 'insertText',
      data: null
    });
    noteentry.dispatchEvent(inputEvent);
  }
}

// ==============================================
// MOBILE TOOLBAR BEHAVIOR (affichage conditionnel)
// ==============================================

document.addEventListener('DOMContentLoaded', function() {
    // Vérifier si on est sur mobile
    const isMobile = window.innerWidth <= 800;
    
    if (!isMobile) return; // Ne pas exécuter ce script sur desktop
    
    let selectionTimer;
    
    // Fonction pour afficher/cacher les boutons de formatage
    function toggleFormatButtons() {
        const selection = window.getSelection();
        const toolbar = document.querySelector('.note-edit-toolbar');
        
        if (selection.toString().length > 0) {
            // Il y a du texte sélectionné, afficher les boutons de formatage
            if (toolbar) {
                toolbar.classList.add('show-format-buttons');
            }
        } else {
            // Pas de sélection, cacher les boutons de formatage
            if (toolbar) {
                toolbar.classList.remove('show-format-buttons');
            }
        }
    }
    
    // Écouter les événements de sélection
    document.addEventListener('selectionchange', function() {
        // Utiliser un timer pour éviter trop d'appels
        clearTimeout(selectionTimer);
        selectionTimer = setTimeout(toggleFormatButtons, 100);
    });
    
    // Écouter aussi les clics sur les éléments éditables
    document.addEventListener('click', function(e) {
        if (e.target.closest('.noteentry')) {
            setTimeout(toggleFormatButtons, 100);
        }
    });
    
    // Écouter les événements tactiles pour mobile
    document.addEventListener('touchend', function(e) {
        if (e.target.closest('.noteentry')) {
            setTimeout(toggleFormatButtons, 150);
        }
    });
    
    // Cacher les boutons quand on clique en dehors d'une note
    document.addEventListener('click', function(e) {
        if (!e.target.closest('.notecard')) {
            const toolbar = document.querySelector('.note-edit-toolbar');
            if (toolbar) {
                toolbar.classList.remove('show-format-buttons');
            }
        }
    });
});
