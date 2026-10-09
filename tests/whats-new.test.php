<?php
lib('whats-new');

function whatsNewRelease(string $version, string $body = 'notes', bool $prerelease = false): array {
    return ['version' => $version, 'prerelease' => $prerelease, 'date' => '2026-10-01', 'url' => '', 'body' => $body];
}

test('whats new: every release above the seen version and up to the installed one, newest first', function () {
    $releases = [
        whatsNewRelease('6.113.0'),
        whatsNewRelease('6.111.3'),
        whatsNewRelease('6.112.0'),
        whatsNewRelease('6.111.2-beta', 'notes', true),
        whatsNewRelease('6.111.1'),
        whatsNewRelease('6.111.0'),
    ];
    $selection = poznoteWhatsNewSelectReleases($releases, '6.111.0', '6.112.0');
    assertSame(['6.112.0', '6.111.3', '6.111.2-beta', '6.111.1'], array_column($selection['releases'], 'version'));
    assertSame(0, $selection['more']);
});

test('whats new: an instance on a pre-release does not get the stable release that follows it', function () {
    $releases = [whatsNewRelease('6.111.2'), whatsNewRelease('6.111.2-beta', 'notes', true), whatsNewRelease('6.111.1')];
    $selection = poznoteWhatsNewSelectReleases($releases, '6.111.0', '6.111.2-beta');
    assertSame(['6.111.2-beta', '6.111.1'], array_column($selection['releases'], 'version'));
});

test('whats new: a release without notes is left out and the older ones past the limit are counted', function () {
    $releases = [whatsNewRelease('6.4.0', "  \n"), whatsNewRelease('6.3.0'), whatsNewRelease('6.2.0'), whatsNewRelease('6.1.0')];
    $selection = poznoteWhatsNewSelectReleases($releases, '6.0.0', '6.4.0', 2);
    assertSame(['6.3.0', '6.2.0'], array_column($selection['releases'], 'version'));
    assertSame(1, $selection['more']);
});

test('whats new: the title and the support block go, the Fixed section stays for admins only', function () {
    $body = "# Poznote 6.112.0\n\nIntro.\n\n## ✨ New\n\n- A\n\n## 🚀 Improvements\n\n- B\n\n## 🐛 Fixed\n\n- C\n\n---\n\n### ❤️ Enjoying Poznote?\n\nKo-fi";
    $admin = poznoteWhatsNewCleanBody($body, true);
    assertSame("Intro.\n\n## ✨ New\n\n- A\n\n## 🚀 Improvements\n\n- B\n\n## 🐛 Fixed\n\n- C", $admin);
    $user = poznoteWhatsNewCleanBody($body, false);
    assertSame("Intro.\n\n## ✨ New\n\n- A\n\n## 🚀 Improvements\n\n- B", $user);
});

test('whats new: a horizontal rule that is not the support block is kept', function () {
    $body = "## ✨ New\n\n- A\n\n---\n\nMore text";
    assertSame($body, poznoteWhatsNewCleanBody($body, true));
});

test('whats new: GitHub screenshots become Markdown images, anything that is not https is dropped', function () {
    $md = poznoteWhatsNewImagesToMarkdown('<img width="950" alt="image" src="https://github.com/user-attachments/assets/38" />' . "\n" . '<img src="javascript:alert(1)">');
    assertSame("![image](https://github.com/user-attachments/assets/38)\n", $md);
});

test('whats new: drafts and malformed entries of the GitHub payload are ignored', function () {
    $releases = poznoteWhatsNewNormalizeReleases([
        ['tag_name' => 'v6.112.0', 'prerelease' => false, 'published_at' => '2026-10-09T05:27:21Z', 'html_url' => 'https://github.com/x', 'body' => "a\r\nb"],
        ['tag_name' => '6.113.0', 'draft' => true],
        'nonsense',
    ]);
    assertSame(1, count($releases));
    assertSame('6.112.0', $releases[0]['version']);
    assertSame('2026-10-09', $releases[0]['date']);
    assertSame("a\nb", $releases[0]['body']);
});
