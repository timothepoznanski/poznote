<?php
require_once 'auth.php';
requireAuth();
require_once 'config.php';
require_once 'db_connect.php';
require_once 'functions.php';
$v = '20251213.2'; // Cache version
$currentLang = getUserLanguage();
?>
<!DOCTYPE html>
<html lang="<?php echo htmlspecialchars($currentLang); ?>">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?php echo t_h('markdown_guide.page_title'); ?> - Poznote</title>
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
        
        .math-block {
            display: block;
            margin: 1em 0;
            padding: 0.5em 0;
            text-align: center;
            overflow-x: auto;
        }
        
        .math-inline {
            display: inline;
            margin: 0 0.2em;
        }
    </style>

    <link rel="stylesheet" href="js/katex/katex.min.css?v=<?php echo urlencode($v); ?>">
    <script src="js/mermaid/mermaid.min.js?v=<?php echo urlencode($v); ?>"></script>
    <script src="js/katex/katex.min.js?v=<?php echo urlencode($v); ?>"></script>
    <script src="js/katex/auto-render.min.js?v=<?php echo urlencode($v); ?>"></script>
    <script>
        if (window.mermaid) {
            window.mermaid.initialize({
                startOnLoad: true,
                securityLevel: 'strict'
            });
        }
        
        // Render math equations
        document.addEventListener('DOMContentLoaded', function() {
            if (typeof katex !== 'undefined') {
                var mathBlocks = document.querySelectorAll('.math-block');
                mathBlocks.forEach(function(block) {
                    var mathContent = block.getAttribute('data-math');
                    if (mathContent) {
                        katex.render(mathContent, block, {
                            displayMode: true,
                            throwOnError: false
                        });
                    }
                });
                
                var mathInline = document.querySelectorAll('.math-inline');
                mathInline.forEach(function(inline) {
                    var mathContent = inline.getAttribute('data-math');
                    if (mathContent) {
                        katex.render(mathContent, inline, {
                            displayMode: false,
                            throwOnError: false
                        });
                    }
                });
            }
        });
    </script>
</head>
<body>
    <button class="back-link"><?php echo t_h('common.back_to_notes'); ?></button>
    
    <h1><?php echo t_h('markdown_guide.title'); ?></h1>

    <nav class="toc" aria-label="<?php echo t_h('markdown_guide.toc.label'); ?>">
        <h2><?php echo t_h('markdown_guide.toc.title'); ?></h2>
        <ul>
            <li><a href="#headers"><?php echo t_h('markdown_guide.sections.headers.title'); ?></a></li>
            <li><a href="#text-formatting"><?php echo t_h('markdown_guide.sections.text_formatting.title'); ?></a></li>
            <li><a href="#unordered-lists"><?php echo t_h('markdown_guide.sections.unordered_lists.title'); ?></a></li>
            <li><a href="#ordered-lists"><?php echo t_h('markdown_guide.sections.ordered_lists.title'); ?></a></li>
            <li><a href="#checkboxes"><?php echo t_h('markdown_guide.sections.checkboxes.title'); ?></a></li>
            <li><a href="#images"><?php echo t_h('markdown_guide.sections.images.title'); ?></a></li>
            <li><a href="#urls"><?php echo t_h('markdown_guide.sections.urls.title'); ?></a></li>
            <li><a href="#code-blocks"><?php echo t_h('markdown_guide.sections.code_blocks.title'); ?></a></li>
            <li><a href="#quotes"><?php echo t_h('markdown_guide.sections.quotes.title'); ?></a></li>
            <li><a href="#line-breaks"><?php echo t_h('markdown_guide.sections.line_breaks.title'); ?></a></li>
            <li><a href="#horizontal-rule"><?php echo t_h('markdown_guide.sections.horizontal_rule.title'); ?></a></li>
            <li><a href="#tables"><?php echo t_h('markdown_guide.sections.tables.title'); ?></a></li>
            <li><a href="#math"><?php echo t_h('markdown_guide.sections.math.title'); ?></a></li>
            <li><a href="#mermaid"><?php echo t_h('markdown_guide.sections.mermaid.title'); ?></a></li>
        </ul>
    </nav>

    <section id="headers" class="section">
        <h2><?php echo t_h('markdown_guide.sections.headers.title'); ?></h2>
        <div class="example">
            <div>
                <h3><?php echo t_h('markdown_guide.common.syntax'); ?></h3>
                <pre><?php echo htmlspecialchars("# " . t('markdown_guide.sections.headers.heading1', 'En-tête 1') . "\n## " . t('markdown_guide.sections.headers.heading2', 'En-tête 2') . "\n### " . t('markdown_guide.sections.headers.heading3', 'En-tête 3')); ?></pre>
            </div>
            <div>
                <h3><?php echo t_h('markdown_guide.common.result'); ?></h3>
                <div class="result">
                    <div class="r-h1"><?php echo t_h('markdown_guide.sections.headers.heading1', 'En-tête 1'); ?></div>
                    <div class="r-h2"><?php echo t_h('markdown_guide.sections.headers.heading2', 'En-tête 2'); ?></div>
                    <div class="r-h3"><?php echo t_h('markdown_guide.sections.headers.heading3', 'En-tête 3'); ?></div>
                </div>
            </div>
        </div>
    </section>

    <section id="text-formatting" class="section">
        <h2><?php echo t_h('markdown_guide.sections.text_formatting.title'); ?></h2>
        <div class="example">
            <div>
                <h3><?php echo t_h('markdown_guide.common.syntax'); ?></h3>
                <pre><?php echo htmlspecialchars("**" . t('markdown_guide.sections.text_formatting.bold') . "**\n*" . t('markdown_guide.sections.text_formatting.italic') . "*\n~~" . t('markdown_guide.sections.text_formatting.strikethrough') . "~~\n`" . t('markdown_guide.sections.text_formatting.inline_code') . "`"); ?></pre>
            </div>
            <div>
                <h3><?php echo t_h('markdown_guide.common.result'); ?></h3>
                <div class="result">
                    <p style="margin: 0 0 8px 0;"><strong><?php echo t_h('markdown_guide.sections.text_formatting.bold'); ?></strong></p>
                    <p style="margin: 0 0 8px 0;"><em><?php echo t_h('markdown_guide.sections.text_formatting.italic'); ?></em></p>
                    <p style="margin: 0 0 8px 0;"><del><?php echo t_h('markdown_guide.sections.text_formatting.strikethrough'); ?></del></p>
                    <p style="margin: 0;"><code><?php echo t_h('markdown_guide.sections.text_formatting.inline_code'); ?></code></p>
                </div>
            </div>
        </div>
    </section>

    <section id="unordered-lists" class="section">
        <h2><?php echo t_h('markdown_guide.sections.unordered_lists.title'); ?></h2>
        <div class="example">
            <div>
                <h3><?php echo t_h('markdown_guide.common.syntax'); ?></h3>
                <pre><?php echo htmlspecialchars("- " . t('markdown_guide.sections.unordered_lists.item_one') . "\n- " . t('markdown_guide.sections.unordered_lists.item_two') . "\n  - " . t('markdown_guide.sections.unordered_lists.nested_item')); ?></pre>
            </div>
            <div>
                <h3><?php echo t_h('markdown_guide.common.result'); ?></h3>
                <div class="result">
                    <ul>
                        <li><?php echo t_h('markdown_guide.sections.unordered_lists.item_one'); ?></li>
                        <li><?php echo t_h('markdown_guide.sections.unordered_lists.item_two'); ?>
                            <ul>
                                <li><?php echo t_h('markdown_guide.sections.unordered_lists.nested_item'); ?></li>
                            </ul>
                        </li>
                    </ul>
                </div>
            </div>
        </div>
    </section>

    <section id="ordered-lists" class="section">
        <h2><?php echo t_h('markdown_guide.sections.ordered_lists.title'); ?></h2>
        <div class="example">
            <div>
                <h3><?php echo t_h('markdown_guide.common.syntax'); ?></h3>
                <pre><?php echo htmlspecialchars("1. " . t('markdown_guide.sections.ordered_lists.first') . "\n2. " . t('markdown_guide.sections.ordered_lists.second') . "\n3. " . t('markdown_guide.sections.ordered_lists.third')); ?></pre>
            </div>
            <div>
                <h3><?php echo t_h('markdown_guide.common.result'); ?></h3>
                <div class="result">
                    <ol>
                        <li><?php echo t_h('markdown_guide.sections.ordered_lists.first'); ?></li>
                        <li><?php echo t_h('markdown_guide.sections.ordered_lists.second'); ?></li>
                        <li><?php echo t_h('markdown_guide.sections.ordered_lists.third'); ?></li>
                    </ol>
                </div>
            </div>
        </div>
    </section>

    <section id="checkboxes" class="section">
        <h2><?php echo t_h('markdown_guide.sections.checkboxes.title'); ?></h2>
        <div class="example">
            <div>
                <h3><?php echo t_h('markdown_guide.common.syntax'); ?></h3>
                <pre>- [ ] <?php echo t_h('markdown_guide.sections.checkboxes.unchecked_note'); ?>
- [x] <?php echo t_h('markdown_guide.sections.checkboxes.checked'); ?></pre>
            </div>
            <div>
                <h3><?php echo t_h('markdown_guide.common.result'); ?></h3>
                <div class="result">
                    <ul class="task-list">
                        <li><input type="checkbox" disabled> <span><?php echo t_h('markdown_guide.sections.checkboxes.unchecked'); ?></span></li>
                        <li><input type="checkbox" checked disabled> <span><?php echo t_h('markdown_guide.sections.checkboxes.checked'); ?></span></li>
                    </ul>
                </div>
            </div>
        </div>
    </section>

    <section id="images" class="section">
        <h2><?php echo t_h('markdown_guide.sections.images.title'); ?></h2>
        <div class="example">
            <div>
                <h3><?php echo t_h('markdown_guide.common.syntax'); ?></h3>
                <pre><?php echo htmlspecialchars("![" . t('markdown_guide.sections.images.alt_text') . "](image-url.jpg)"); ?></pre>
            </div>
            <div>
                <h3><?php echo t_h('markdown_guide.common.result'); ?></h3>
                <div class="result">
                    <svg width="280" height="120" viewBox="0 0 280 120" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="<?php echo t_h('markdown_guide.sections.images.alt_text'); ?>">
                        <rect x="1" y="1" width="278" height="118" fill="#f5f5f5" stroke="#ddd" />
                        <rect x="16" y="20" width="80" height="60" fill="#fff" stroke="#ddd" />
                        <path d="M20 74 L44 50 L64 70 L82 56 L92 74" fill="none" stroke="#666" stroke-width="2" />
                        <circle cx="34" cy="38" r="6" fill="#666" />
                        <text x="110" y="54" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif" font-size="14" fill="#666"><?php echo t_h('markdown_guide.sections.images.alt_text'); ?></text>
                        <text x="110" y="74" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif" font-size="12" fill="#666"><?php echo t_h('markdown_guide.sections.images.preview'); ?></text>
                    </svg>
                </div>
            </div>
        </div>
    </section>

    <section id="urls" class="section">
        <h2><?php echo t_h('markdown_guide.sections.urls.title'); ?></h2>
        <div class="example">
            <div>
                <h3><?php echo t_h('markdown_guide.common.syntax'); ?></h3>
                <pre><?php echo htmlspecialchars("[" . t('markdown_guide.sections.urls.link_text') . "](https://example.com)"); ?></pre>
            </div>
            <div>
                <h3><?php echo t_h('markdown_guide.common.result'); ?></h3>
                <div class="result">
                    <a href="https://example.com" target="_blank" rel="noopener noreferrer"><?php echo t_h('markdown_guide.sections.urls.link_text'); ?></a>
                </div>
            </div>
        </div>
    </section>

    <section id="code-blocks" class="section">
        <h2><?php echo t_h('markdown_guide.sections.code_blocks.title'); ?></h2>
        <div class="example">
            <div>
                <h3><?php echo t_h('markdown_guide.common.syntax'); ?></h3>
                <pre>```js
function hello(name) {
  return `Hello ${name}`;
}
```</pre>
            </div>
            <div>
                <h3><?php echo t_h('markdown_guide.common.result'); ?></h3>
                <div class="result">
                    <pre style="margin: 0;"><code>function hello(name) {
  return `Hello ${name}`;
}</code></pre>
                </div>
            </div>
        </div>
    </section>

    <section id="quotes" class="section">
        <h2><?php echo t_h('markdown_guide.sections.quotes.title'); ?></h2>
        <div class="example">
            <div>
                <h3><?php echo t_h('markdown_guide.common.syntax'); ?></h3>
                <pre>&gt; <?php echo t_h('markdown_guide.sections.quotes.quote_text'); ?>
&gt; <?php echo t_h('markdown_guide.sections.quotes.quote_line2'); ?></pre>
            </div>
            <div>
                <h3><?php echo t_h('markdown_guide.common.result'); ?></h3>
                <div class="result">
                    <blockquote style="margin: 0;">
                        <?php echo t_h('markdown_guide.sections.quotes.quote_text'); ?><br>
                        <?php echo t_h('markdown_guide.sections.quotes.quote_line2'); ?>
                    </blockquote>
                </div>
            </div>
        </div>
    </section>

    <section id="line-breaks" class="section">
        <h2><?php echo t_h('markdown_guide.sections.line_breaks.title'); ?></h2>
        <p><?php echo t_h('markdown_guide.sections.line_breaks.description'); ?></p>
        <div class="example">
            <div>
                <h3><?php echo t_h('markdown_guide.common.syntax'); ?></h3>
                <pre><?php echo t_h('markdown_guide.sections.line_breaks.first_line'); ?>
<?php echo t_h('markdown_guide.sections.line_breaks.second_line'); ?></pre>
            </div>
            <div>
                <h3><?php echo t_h('markdown_guide.common.result'); ?></h3>
                <div class="result">
                    <?php echo t_h('markdown_guide.sections.line_breaks.first_line'); ?><br>
                    <?php echo t_h('markdown_guide.sections.line_breaks.second_line'); ?>
                </div>
            </div>
        </div>
    </section>

    <section id="horizontal-rule" class="section">
        <h2><?php echo t_h('markdown_guide.sections.horizontal_rule.title'); ?></h2>
        <div class="example">
            <div>
                <h3><?php echo t_h('markdown_guide.common.syntax'); ?></h3>
                <pre>---</pre>
            </div>
            <div>
                <h3><?php echo t_h('markdown_guide.common.result'); ?></h3>
                <div class="result">
                    <hr style="margin: 0;">
                </div>
            </div>
        </div>
    </section>

    <section id="tables" class="section">
        <h2><?php echo t_h('markdown_guide.sections.tables.title'); ?></h2>
        <div class="example">
            <div>
                <h3><?php echo t_h('markdown_guide.common.syntax'); ?></h3>
                <pre>| <?php echo t_h('markdown_guide.sections.tables.col_name'); ?> | <?php echo t_h('markdown_guide.sections.tables.col_value'); ?> |
| ---  | ---   |
| A    | 10    |
| B    | 25    |</pre>
            </div>
            <div>
                <h3><?php echo t_h('markdown_guide.common.result'); ?></h3>
                <div class="result">
                    <table>
                        <thead>
                            <tr>
                                <th><?php echo t_h('markdown_guide.sections.tables.col_name'); ?></th>
                                <th style="text-align: right;"><?php echo t_h('markdown_guide.sections.tables.col_value'); ?></th>
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

    <section id="math" class="section">
        <h2><?php echo t_h('markdown_guide.sections.math.title'); ?></h2>
        
        <h3><?php echo t_h('markdown_guide.sections.math.inline.title'); ?></h3>
        <div class="example">
            <div>
                <h3><?php echo t_h('markdown_guide.common.syntax'); ?></h3>
                <pre>Einstein's famous equation is $E = mc^2$ which relates energy and mass.</pre>
            </div>
            <div>
                <h3><?php echo t_h('markdown_guide.common.result'); ?></h3>
                <div class="result">
                    <p>Einstein's famous equation is <span class="math-inline" data-math="E = mc^2"></span> which relates energy and mass.</p>
                </div>
            </div>
        </div>
        
        <h3><?php echo t_h('markdown_guide.sections.math.block.title'); ?></h3>
        <div class="example">
            <div>
                <h3><?php echo t_h('markdown_guide.common.syntax'); ?></h3>
                <pre>$$
E = mc^2
$$</pre>
            </div>
            <div>
                <h3><?php echo t_h('markdown_guide.common.result'); ?></h3>
                <div class="result">
                    <span class="math-block" data-math="E = mc^2"></span>
                </div>
            </div>
        </div>
        
        <h3><?php echo t_h('markdown_guide.sections.math.examples.title'); ?></h3>
        <div class="example">
            <div>
                <h3><?php echo t_h('markdown_guide.common.syntax'); ?></h3>
                <pre>$$
\int_{0}^{1} x^2 dx = \frac{1}{3}
$$

$$
\sum_{n=1}^{\infty} \frac{1}{n^2} = \frac{\pi^2}{6}
$$</pre>
            </div>
            <div>
                <h3><?php echo t_h('markdown_guide.common.result'); ?></h3>
                <div class="result">
                    <span class="math-block" data-math="\int_{0}^{1} x^2 dx = \frac{1}{3}"></span>
                    <span class="math-block" data-math="\sum_{n=1}^{\infty} \frac{1}{n^2} = \frac{\pi^2}{6}"></span>
                </div>
            </div>
        </div>
    </section>

    <section id="mermaid" class="section">
        <h2><?php echo t_h('markdown_guide.sections.mermaid.title'); ?></h2>
        <div class="example">
            <div>
                <h3><?php echo t_h('markdown_guide.common.syntax'); ?></h3>
                <pre>```mermaid
flowchart TD
  A[<?php echo t_h('markdown_guide.sections.mermaid.node_a'); ?>] --&gt; B{<?php echo t_h('markdown_guide.sections.mermaid.node_b'); ?>}
  B -- <?php echo t_h('markdown_guide.sections.mermaid.edge_yes'); ?> --&gt; C[<?php echo t_h('markdown_guide.sections.mermaid.node_c'); ?>]
  B -- <?php echo t_h('markdown_guide.sections.mermaid.edge_no'); ?> --&gt; D[<?php echo t_h('markdown_guide.sections.mermaid.node_d'); ?>]
```</pre>
            </div>
            <div>
                <h3><?php echo t_h('markdown_guide.common.result'); ?></h3>
                <div class="result">
                    <div class="mermaid">flowchart TD
  A[<?php echo t_h('markdown_guide.sections.mermaid.node_a'); ?>] --> B{<?php echo t_h('markdown_guide.sections.mermaid.node_b'); ?>}
  B -- <?php echo t_h('markdown_guide.sections.mermaid.edge_yes'); ?> --> C[<?php echo t_h('markdown_guide.sections.mermaid.node_c'); ?>]
  B -- <?php echo t_h('markdown_guide.sections.mermaid.edge_no'); ?> --> D[<?php echo t_h('markdown_guide.sections.mermaid.node_d'); ?>]</div>
                </div>
            </div>
        </div>
    </section>
    
    <script src="js/markdown-guide.js"></script>
</body>
</html>
