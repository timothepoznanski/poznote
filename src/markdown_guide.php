<?php
require_once 'auth.php';
requireAuth();
$v = '20251213.2'; // Cache version
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

        pre {
            background: #f5f5f5;
            padding: 12px;
            border-radius: 4px;
            overflow: auto;
            font-family: 'Courier New', monospace;
            font-size: 14px;
            line-height: 1.4;
        }

        .toc {
            background: #f5f5f5;
            padding: 12px;
            border-radius: 4px;
            margin: 0 0 20px 0;
        }

        .toc h2 {
            margin: 0 0 10px 0;
            font-size: 18px;
        }

        .toc ul {
            list-style-type: none !important;
            margin: 0 !important;
            padding-left: 0 !important;
            width: 100% !important;
        }

        .toc li {
            display: block !important;
            margin: 6px 0 !important;
            width: 100% !important;
        }

        .toc a {
            color: inherit;
            text-decoration: underline;
        }

        .section {
            margin-top: 30px;
        }

        .example {
            display: grid;
            grid-template-columns: 1fr;
            gap: 12px;
            align-items: start;
        }

        @media (min-width: 700px) {
            .example {
                grid-template-columns: 1fr 1fr;
            }
        }

        .example h3 {
            margin: 0 0 8px 0;
            font-size: 14px;
            font-weight: 600;
            color: #666;
            text-transform: uppercase;
            letter-spacing: 0.02em;
        }

        .result {
            padding: 12px;
            border-radius: 4px;
            border: 1px solid #ddd;
            background: #fff;
        }

        .result ul {
            display: block !important;
            list-style-type: disc !important;
            margin: 10px 0 0 0 !important;
            padding-left: 24px !important;
            width: 100% !important;
        }

        .result ol {
            display: block !important;
            list-style-type: decimal !important;
            margin: 10px 0 0 0 !important;
            padding-left: 24px !important;
            width: 100% !important;
        }

        .result li {
            display: list-item !important;
            margin: 6px 0 !important;
            width: 100% !important;
        }

        .r-h1 {
            font-size: 24px;
            font-weight: 700;
            margin: 0 0 8px 0;
        }

        .r-h2 {
            font-size: 20px;
            font-weight: 700;
            margin: 0 0 8px 0;
        }

        .r-h3 {
            font-size: 16px;
            font-weight: 700;
            margin: 0;
        }

        .task-list {
            list-style-type: none !important;
            padding-left: 0 !important;
            margin: 0 !important;
        }

        .task-list li {
            display: flex !important;
            align-items: center;
            gap: 10px;
            margin: 6px 0 !important;
        }

        .task-list input[type="checkbox"] {
            width: 16px;
            height: 16px;
        }

        table {
            border-collapse: collapse;
            width: 100%;
        }

        th, td {
            border: 1px solid #ddd;
            padding: 8px;
            text-align: left;
        }

        th {
            background: #f5f5f5;
            font-weight: 700;
        }

        .mermaid {
            margin: 10px 0 20px 0;
        }
    </style>

    <script src="js/mermaid/mermaid.min.js?v=<?php echo urlencode($v); ?>"></script>
    <script>
        if (window.mermaid) {
            window.mermaid.initialize({
                startOnLoad: true,
                securityLevel: 'strict'
            });
        }
    </script>
</head>
<body>
    <button onclick="window.close(); setTimeout(function(){ window.history.back(); }, 100);" class="back-link">Back to notes</button>
    
    <h1>Markdown Guide</h1>

    <nav class="toc" aria-label="Table of contents">
        <h2>Table of contents</h2>
        <ul>
            <li><a href="#headers">Headers</a></li>
            <li><a href="#text-formatting">Text Formatting</a></li>
            <li><a href="#unordered-lists">Unordered Lists</a></li>
            <li><a href="#ordered-lists">Ordered Lists</a></li>
            <li><a href="#checkboxes">Checkboxes</a></li>
            <li><a href="#images">Images</a></li>
            <li><a href="#urls">URLs</a></li>
            <li><a href="#code-blocks">Code Blocks</a></li>
            <li><a href="#quotes">Quotes</a></li>
            <li><a href="#line-breaks">Line Breaks</a></li>
            <li><a href="#horizontal-rule">Horizontal Rule</a></li>
            <li><a href="#tables">Tables</a></li>
            <li><a href="#mermaid">Mermaid Diagrams</a></li>
        </ul>
    </nav>

    <section id="headers" class="section">
        <h2>Headers</h2>
        <div class="example">
            <div>
                <h3>Syntax</h3>
                <pre># Heading 1
## Heading 2
### Heading 3</pre>
            </div>
            <div>
                <h3>Result</h3>
                <div class="result">
                    <div class="r-h1">Heading 1</div>
                    <div class="r-h2">Heading 2</div>
                    <div class="r-h3">Heading 3</div>
                </div>
            </div>
        </div>
    </section>

    <section id="text-formatting" class="section">
        <h2>Text Formatting</h2>
        <div class="example">
            <div>
                <h3>Syntax</h3>
                <pre>**bold text**
*italic text*
~~strikethrough~~
`inline code`</pre>
            </div>
            <div>
                <h3>Result</h3>
                <div class="result">
                    <p style="margin: 0 0 8px 0;"><strong>bold text</strong></p>
                    <p style="margin: 0 0 8px 0;"><em>italic text</em></p>
                    <p style="margin: 0 0 8px 0;"><del>strikethrough</del></p>
                    <p style="margin: 0;"><code>inline code</code></p>
                </div>
            </div>
        </div>
    </section>

    <section id="unordered-lists" class="section">
        <h2>Unordered Lists</h2>
        <div class="example">
            <div>
                <h3>Syntax</h3>
                <pre>- Item one
- Item two
  - Nested item</pre>
            </div>
            <div>
                <h3>Result</h3>
                <div class="result">
                    <ul>
                        <li>Item one</li>
                        <li>Item two
                            <ul>
                                <li>Nested item</li>
                            </ul>
                        </li>
                    </ul>
                </div>
            </div>
        </div>
    </section>

    <section id="ordered-lists" class="section">
        <h2>Ordered Lists</h2>
        <div class="example">
            <div>
                <h3>Syntax</h3>
                <pre>1. First
2. Second
3. Third</pre>
            </div>
            <div>
                <h3>Result</h3>
                <div class="result">
                    <ol>
                        <li>First</li>
                        <li>Second</li>
                        <li>Third</li>
                    </ol>
                </div>
            </div>
        </div>
    </section>

    <section id="checkboxes" class="section">
        <h2>Checkboxes</h2>
        <div class="example">
            <div>
                <h3>Syntax</h3>
                <pre>- [ ] Unchecked item (one space only!)
- [x] Checked item</pre>
            </div>
            <div>
                <h3>Result</h3>
                <div class="result">
                    <ul class="task-list">
                        <li><input type="checkbox" disabled> <span>Unchecked item</span></li>
                        <li><input type="checkbox" checked disabled> <span>Checked item</span></li>
                    </ul>
                </div>
            </div>
        </div>
    </section>

    <section id="images" class="section">
        <h2>Images</h2>
        <div class="example">
            <div>
                <h3>Syntax</h3>
                <pre>![Alt text](image-url.jpg)</pre>
            </div>
            <div>
                <h3>Result</h3>
                <div class="result">
                    <svg width="280" height="120" viewBox="0 0 280 120" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Alt text">
                        <rect x="1" y="1" width="278" height="118" fill="#f5f5f5" stroke="#ddd" />
                        <rect x="16" y="20" width="80" height="60" fill="#fff" stroke="#ddd" />
                        <path d="M20 74 L44 50 L64 70 L82 56 L92 74" fill="none" stroke="#666" stroke-width="2" />
                        <circle cx="34" cy="38" r="6" fill="#666" />
                        <text x="110" y="54" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif" font-size="14" fill="#666">Alt text</text>
                        <text x="110" y="74" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif" font-size="12" fill="#666">(image preview)</text>
                    </svg>
                </div>
            </div>
        </div>
    </section>

    <section id="urls" class="section">
        <h2>URLs</h2>
        <div class="example">
            <div>
                <h3>Syntax</h3>
                <pre>[Link text](https://example.com)</pre>
            </div>
            <div>
                <h3>Result</h3>
                <div class="result">
                    <a href="https://example.com" target="_blank" rel="noopener noreferrer">Link text</a>
                </div>
            </div>
        </div>
    </section>

    <section id="code-blocks" class="section">
        <h2>Code Blocks</h2>
        <div class="example">
            <div>
                <h3>Syntax</h3>
                <pre>```js
function hello(name) {
  return `Hello ${name}`;
}
```</pre>
            </div>
            <div>
                <h3>Result</h3>
                <div class="result">
                    <pre style="margin: 0;"><code>function hello(name) {
  return `Hello ${name}`;
}</code></pre>
                </div>
            </div>
        </div>
    </section>

    <section id="quotes" class="section">
        <h2>Quotes</h2>
        <div class="example">
            <div>
                <h3>Syntax</h3>
                <pre>&gt; This is a quote
&gt; spanning two lines</pre>
            </div>
            <div>
                <h3>Result</h3>
                <div class="result">
                    <blockquote style="margin: 0;">
                        This is a quote<br>
                        spanning two lines
                    </blockquote>
                </div>
            </div>
        </div>
    </section>

    <section id="line-breaks" class="section">
        <h2>Line Breaks</h2>
        <p>A single line break in edit mode creates a line break in the preview.</p>
        <div class="example">
            <div>
                <h3>Syntax</h3>
                <pre>First line
Second line</pre>
            </div>
            <div>
                <h3>Result</h3>
                <div class="result">
                    First line<br>
                    Second line
                </div>
            </div>
        </div>
    </section>

    <section id="horizontal-rule" class="section">
        <h2>Horizontal Rule</h2>
        <div class="example">
            <div>
                <h3>Syntax</h3>
                <pre>---</pre>
            </div>
            <div>
                <h3>Result</h3>
                <div class="result">
                    <hr style="margin: 0;">
                </div>
            </div>
        </div>
    </section>

    <section id="tables" class="section">
        <h2>Tables</h2>
        <div class="example">
            <div>
                <h3>Syntax</h3>
                <pre>| Name | Value |
| ---  | ---   |
| A    | 10    |
| B    | 25    |</pre>
            </div>
            <div>
                <h3>Result</h3>
                <div class="result">
                    <table>
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th style="text-align: right;">Value</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>A</td>
                                <td style="text-align: right;">10</td>
                            </tr>
                            <tr>
                                <td>B</td>
                                <td style="text-align: right;">25</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    </section>

    <section id="mermaid" class="section">
        <h2>Mermaid Diagrams</h2>
        <div class="example">
            <div>
                <h3>Syntax</h3>
                <pre>```mermaid
flowchart TD
  A[Write Markdown] --&gt; B{Need a diagram?}
  B -- Yes --&gt; C[Use Mermaid]
  B -- No --&gt; D[Keep writing]
```</pre>
            </div>
            <div>
                <h3>Result</h3>
                <div class="result">
                    <div class="mermaid">flowchart TD
  A[Write Markdown] --> B{Need a diagram?}
  B -- Yes --> C[Use Mermaid]
  B -- No --> D[Keep writing]</div>
                </div>
            </div>
        </div>
    </section>
    
</body>
</html>
