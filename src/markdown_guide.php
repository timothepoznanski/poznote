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
    <ul>
        <li><code># Heading 1</code></li>
        <li><code>## Heading 2</code></li>
        <li><code>### Heading 3</code></li>
    </ul>
    
    <h2>Text Formatting</h2>
    <ul>
        <li><code>**bold text**</code> → <strong>bold text</strong></li>
        <li><code>*italic text*</code> → <em>italic text</em></li>
        <li><code>~~strikethrough~~</code> → <del>strikethrough</del></li>
        <li><code>`inline code`</code> → <code>inline code</code></li>
    </ul>
    
    <h2>Lists</h2>
    <ul>
        <li><strong>Unordered list:</strong> Use <code>-</code>, <code>*</code>, or <code>+</code></li>
        <li><strong>Ordered list:</strong> Use <code>1.</code>, <code>2.</code>, etc.</li>
    </ul>
    
    <h2>Links and Images</h2>
    <ul>
        <li><code>[Link text](https://example.com)</code></li>
        <li><code>![Alt text](image-url.jpg)</code></li>
    </ul>
    
    <h2>Code Blocks</h2>
    <ul>
        <li>Use three backticks <code>```</code> before and after the code</li>
    </ul>
    
    <h2>Quotes</h2>
    <ul>
        <li><code>&gt; This is a quote</code></li>
    </ul>
    
    <h2>Line Breaks</h2>
    <ul>
        <li>A single line break in edit mode creates a line break in the preview</li>
        <li>Leave a blank line between paragraphs to create separate paragraphs</li>
    </ul>
    
    <h2>Horizontal Rule</h2>
    <ul>
        <li><code>---</code> or <code>***</code></li>
    </ul>
    
    <h2>Tables</h2>
    <ul>
        <li>Use pipes <code>|</code> to separate columns</li>
        <li>Use dashes <code>---</code> to separate headers from content</li>
    </ul>
    
</body>
</html>
