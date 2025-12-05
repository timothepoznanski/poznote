<?php
require_once 'auth.php';
requireAuth();
$v = '20251020.6'; // Cache version
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Markdown Guide - Poznote</title>
    <style>
        * {
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            line-height: 1.6;
            background: #fff;
            color: #333;
        }
        
        h1 {
            border-bottom: 2px solid #ddd;
            padding-bottom: 10px;
            margin-bottom: 30px;
        }
        
        h2 {
            margin-top: 30px;
            margin-bottom: 15px;
        }
        
        code {
            background: #f5f5f5;
            padding: 2px 6px;
            border-radius: 3px;
            font-family: 'Courier New', monospace;
            font-size: 14px;
        }
        
        ul {
            display: block !important;
            list-style-type: disc !important;
            margin: 10px 0 20px 0 !important;
            padding-left: 40px !important;
            width: 100% !important;
        }
        
        li {
            display: list-item !important;
            margin: 10px 0 !important;
            width: 100% !important;
        }
        
        .back-link {
            display: inline-block;
            margin-bottom: 20px;
            padding: 10px 20px;
            background: #6c757d;
            color: white;
            text-decoration: none;
            font-size: 16px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            transition: background 0.2s;
        }
        
        .back-link:hover {
            background: #5a6268;
            text-decoration: none;
        }
        
        strong {
            font-weight: bold;
        }
        
        em {
            font-style: italic;
        }
        
        del {
            text-decoration: line-through;
        }
        
        blockquote {
            border-left: 4px solid #ddd;
            margin: 10px 0;
            padding-left: 15px;
            color: #666;
        }
        
        hr {
            border: none;
            border-top: 1px solid #ddd;
            margin: 20px 0;
        }
    </style>
</head>
<body>
    <button onclick="window.close(); setTimeout(function(){ window.history.back(); }, 100);" class="back-link">Back to notes</button>
    
    <h1>Markdown Guide</h1>
    
    <h2>Headers</h2>
    <p>
        <code># Heading 1</code><br>
        <code>## Heading 2</code><br>
        <code>### Heading 3</code>
    </p>
    
    <h2>Text Formatting</h2>
    <p>
        <code>**bold text**</code> → <strong>bold text</strong><br>
        <code>*italic text*</code> → <em>italic text</em><br>
        <code>~~strikethrough~~</code> → <del>strikethrough</del><br>
        <code>`inline code`</code> → <code>inline code</code>
    </p>
    
    <h2>Unordered Lists</h2>
    <p>
        Use <code>-</code>, <code>*</code>, or <code>+</code>
    </p>
    
    <h2>Ordered Lists</h2>
    <p>
        Use <code>1.</code>, <code>2.</code>, etc.
    </p>
    
    <h2>Checkboxes</h2>
    <p>
        <code>- [] Unchecked item</code><br>
        <code>- [x] Checked item</code>
    </p>
    
    <h2>Images</h2>
    <p>
        <code>![Alt text](image-url.jpg)</code>
    </p>
    
    <h2>URLs</h2>
    <p>
        <code>[Link text](https://example.com)</code>
    </p>
    
    <h2>Code Blocks</h2>
    <p>
        Use three backticks <code>```</code> before and after the code
    </p>
    
    <h2>Quotes</h2>
    <p>
        <code>&gt; This is a quote</code>
    </p>
    
    <h2>Line Breaks</h2>
    <p>
        A single line break in edit mode creates a line break in the preview
    </p>
    
    <h2>Horizontal Rule</h2>
    <p>
        <code>---</code> or <code>***</code>
    </p>
    
    <h2>Tables</h2>
    <p>
        Use pipes <code>|</code> to separate columns and dashes <code>---</code> to separate headers from content
    </p>
    
</body>
</html>
