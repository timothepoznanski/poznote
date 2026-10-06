<?php
require_once dirname(__DIR__) . '/src/markdown_parser.php';
require_once dirname(__DIR__) . '/src/html_to_markdown.php';
require_once dirname(__DIR__) . '/src/lib/html-sanitize.php';

// Table formulas (discussion #1586): a cell holding =SUM(col), =AVG(row),
// =MIN(col), =MAX(row), =COUNT(col) or =PRODUCT(row) shows the sum, average,
// minimum, maximum, count or product of its column or row.
// js/table-formulas.js applies the same rules in the editor; the cases below
// are the ones it is checked against.

test('numbers are read with their separators, sign and currency', function () {
    $cases = [
        '12' => 12.0, '-3.5' => -3.5, '1,234.56' => 1234.56, '1 234,56 €' => 1234.56,
        '1.234,56' => 1234.56, '1,234' => 1234.0, '12,5' => 12.5, '$1,000' => 1000.0,
        '45%' => 45.0, 'EUR 10' => 10.0, "1'000.25" => 1000.25, '**7**' => 7.0, '.5' => 0.5,
    ];
    foreach ($cases as $text => $value) {
        $parsed = parseTableFormulaNumber($text);
        assertTrue($parsed !== null && abs($parsed['value'] - $value) < 1e-9, "\"$text\" reads as $value");
    }
    foreach (['', 'Phase 2', '3 kg', '06.10.2026', '2026-10-06', '12:30', '12 34 56', 'abc'] as $text) {
        assertTrue(parseTableFormulaNumber($text) === null, "\"$text\" is not a number");
    }
});

test('the result takes the decimals, separator and currency of the cells', function () {
    assertSame('6', computeTableFormula('sum-col', ['1', '2', '3', 'text', '']));
    assertSame('0.3', computeTableFormula('sum-col', ['0.1', '0.2']));
    assertSame('15,50 €', computeTableFormula('sum-row', ['10,00 €', '5,50 €']));
    assertSame('$7.75', computeTableFormula('avg-col', ['$10.00', '$5.50']));
    assertSame('2.5', computeTableFormula('avg-col', ['2', '3']));
    assertSame('2', computeTableFormula('avg-row', ['1', '3']));
    assertSame('3.33', computeTableFormula('avg-row', ['3', '3', '4']));
    assertSame('-4', computeTableFormula('sum-col', ['-5', '1']));
    assertSame('15', computeTableFormula('sum-col', ['10', '5 €']));
    assertSame('0', computeTableFormula('sum-col', ['a', 'b']));
});

test('minimum, maximum, count and product', function () {
    assertSame('1,20 €', computeTableFormula('min-col', ['2,50 €', '1,20 €', 'text']));
    assertSame('$10.00', computeTableFormula('max-row', ['$2.50', '$10.00']));
    assertSame('-3', computeTableFormula('min-row', ['-3', '2']));
    assertSame('2', computeTableFormula('count-col', ['1', 'text', '', '4 €']));
    assertSame('0', computeTableFormula('count-row', ['a']));
    // Quantity x unit price keeps the price's currency and decimals
    assertSame('7,50 €', computeTableFormula('prod-row', ['3', '2,50 €']));
    assertSame('3.75', computeTableFormula('prod-row', ['1.5', '2.5']));
    assertSame('6', computeTableFormula('prod-col', ['2', '3']));
    // A percentage is a rate
    assertSame('40 €', computeTableFormula('prod-row', ['200 €', '20%']));
    assertSame('0', computeTableFormula('prod-col', ['a']));
});

test('cells in different currencies or units are not computed together', function () {
    assertSame('Incompatible formula', computeTableFormula('sum-col', ['10 €', '$5']));
    assertSame('Incompatible formula', computeTableFormula('prod-row', ['2 €', '$3']));
    assertSame('Incompatible formula', computeTableFormula('avg-row', ['10 €', '5%']));
    assertSame('Incompatible formula', computeTableFormula('max-col', ['USD 4', '4 €', '1']));
    // Counting them is still fine, and so is a rate applied to an amount
    assertSame('2', computeTableFormula('count-col', ['10 €', '$5']));
    assertSame('40 €', computeTableFormula('prod-row', ['200 €', '20%']));
    assertSame('$15', computeTableFormula('sum-col', ['$10', '$5', '']));

    // The message is text: a total next to it does not count it
    $html = parseMarkdown("| A | B | T |\n| --- | --- | --- |\n| 2 € | $3 | =SUM(row) |\n| 1 € | 4 € | =SUM(row) |\n|  |  | =SUM(col) |");
    assertContains('<td data-formula="sum-row">Incompatible formula</td>', $html);
    assertContains('<td data-formula="sum-col">5 €</td>', $html);
});

test('every formula has a Markdown form that converts back', function () {
    foreach (['sum' => 'SUM', 'avg' => 'AVG', 'min' => 'MIN', 'max' => 'MAX', 'count' => 'COUNT', 'prod' => 'PRODUCT'] as $kind => $name) {
        foreach (['col', 'row'] as $axis) {
            $token = poznoteHtmlToMarkdownFormulaToken("$kind-$axis");
            assertSame("=$name($axis)", $token);
            assertSame("$kind-$axis", parseMarkdownTableFormulaToken(strtolower($token))['formula']);
        }
    }
    assertSame('avg-col', parseMarkdownTableFormulaToken('=average(column)')['formula']);
    assertSame('prod-row', parseMarkdownTableFormulaToken('=PROD(row)')['formula']);
    assertTrue(parseMarkdownTableFormulaToken('=MEDIAN(col)') === null);

    $html = parseMarkdown("| Qty | Price | Total |\n| --- | --- | --- |\n| 3 | 2,50 € | =PRODUCT(row) |\n| 2 | 4,00 € | =PRODUCT(row) |\n| =COUNT(col) | =MAX(col) | =SUM(col) |");
    assertContains('<td data-formula="prod-row">7,50 €</td>', $html);
    assertContains('<td data-formula="count-col">2</td><td data-formula="max-col">4,00 €</td><td data-formula="sum-col">15,50 €</td>', $html);
});

test('a Markdown table computes its column and row formulas', function () {
    $html = parseMarkdown("| Item | A | B | Total |\n| --- | --- | --- | --- |\n| x | 1 | 2 | =SUM(row) |\n| y | 3 | 5 | =sum(row) |\n| All | =SUM(col) | =AVG(col) | **=SUM(col)** |");
    assertContains('<td data-formula="sum-row">3</td>', $html);
    assertContains('<td data-formula="sum-row">8</td>', $html);
    assertContains('<td data-formula="sum-col">4</td>', $html);
    assertContains('<td data-formula="avg-col">3.5</td>', $html);
    // The grand total adds the row totals above it
    assertContains('<td data-formula="sum-col"><strong>11</strong></td>', $html);
});

test('formulas of the same direction ignore each other, and the header row is left alone', function () {
    $html = parseMarkdown("| =SUM(col) | 2026 |\n| --- | --- |\n| 10 | 1 |\n| 20 | 2 |\n| =SUM(col) | =SUM(col) |\n| =AVG(col) | =AVG(col) |");
    assertContains('<th>=SUM(col)</th>', $html);
    assertContains('<td data-formula="sum-col">30</td><td data-formula="sum-col">3</td>', $html);
    assertContains('<td data-formula="avg-col">15</td><td data-formula="avg-col">1.5</td>', $html);
});

test('a formula cell survives the rich-text sanitizer and both conversions', function () {
    $html = '<table><tr><td>A</td><td>B</td></tr><tr><td>1</td><td>2</td></tr><tr><td data-formula="sum-col" onclick="x">1</td><td data-formula="bogus">2</td></tr></table>';
    $clean = sanitizeHtml($html);
    assertContains('<td data-formula="sum-col">1</td>', $clean);
    assertFalse(strpos($clean, 'onclick') !== false, 'other attributes are still dropped');

    $md = poznoteHtmlToMarkdown($html);
    assertContains('| =SUM(col) | 2 |', $md);
    assertContains('<td data-formula="sum-col">1</td>', parseMarkdown($md));
});
