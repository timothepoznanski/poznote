/**
 * Emoji Shortcode Autocomplete
 *
 * Discord/Obsidian-style ":shortcode:" emoji insertion in note editors.
 * Typing ":" followed by at least 2 characters opens a small completion
 * menu next to the caret; Enter/Tab or a click inserts the Unicode emoji.
 * Typing a full ":name:" that matches a known shortcode replaces it
 * immediately without opening the menu.
 *
 * Works in HTML note editors (contenteditable .noteentry) and in the
 * markdown CodeMirror editor (via window.PoznoteMarkdownCodeMirror).
 * Inserted emojis are plain Unicode, so they survive sanitizing, exports
 * and public pages with no CSS/font dependency.
 */
(function () {
    'use strict';

    // [emoji, 'canonical_name alias alias...'] — names are GitHub/Discord-style
    // shortcodes; every alias is searchable and completes on exact ":alias:".
    var EMOJI_DATA = [
        // Smileys
        ['😀', 'grinning'], ['😃', 'smiley'], ['😄', 'smile'], ['😁', 'grin'],
        ['😆', 'laughing satisfied'], ['😅', 'sweat_smile'], ['😂', 'joy'], ['🤣', 'rofl'],
        ['🙂', 'slightly_smiling_face'], ['😉', 'wink'], ['😊', 'blush'], ['😇', 'innocent'],
        ['😍', 'heart_eyes'], ['🤩', 'star_struck'], ['😘', 'kissing_heart'], ['😋', 'yum'],
        ['😜', 'stuck_out_tongue_winking_eye'], ['🤪', 'zany_face'], ['🤔', 'thinking'],
        ['🤨', 'raised_eyebrow'], ['😐', 'neutral_face'], ['😑', 'expressionless'],
        ['🙄', 'roll_eyes'], ['😏', 'smirk'], ['😬', 'grimacing'], ['🤥', 'lying_face'],
        ['😌', 'relieved'], ['😴', 'sleeping'], ['😷', 'mask'], ['🤯', 'exploding_head mind_blown'],
        ['🥳', 'partying_face'], ['😎', 'sunglasses'], ['🤓', 'nerd_face'], ['😕', 'confused'],
        ['😟', 'worried'], ['🙁', 'slightly_frowning_face'], ['😮', 'open_mouth'],
        ['😲', 'astonished'], ['😳', 'flushed'], ['🥺', 'pleading_face'], ['😢', 'cry'],
        ['😭', 'sob'], ['😱', 'scream'], ['😞', 'disappointed'], ['😡', 'rage pout'],
        ['😠', 'angry'], ['🤬', 'cursing_face'], ['😈', 'smiling_imp'], ['💀', 'skull'],
        ['💩', 'poop hankey'], ['🤡', 'clown_face'], ['👻', 'ghost'], ['👽', 'alien'],
        ['🤖', 'robot'], ['🥶', 'cold_face'], ['🥵', 'hot_face'], ['🤗', 'hugs'],
        ['🤫', 'shushing_face'], ['🫡', 'saluting_face'], ['😶', 'no_mouth'],
        ['🥲', 'smiling_face_with_tear'], ['🙈', 'see_no_evil'], ['🙉', 'hear_no_evil'],
        ['🙊', 'speak_no_evil'], ['🤦', 'facepalm'], ['🤷', 'shrug'],
        // Gestures
        ['👋', 'wave hello'], ['👍', 'thumbsup +1'], ['👎', 'thumbsdown -1'],
        ['👌', 'ok_hand'], ['✌️', 'v victory'], ['🤞', 'crossed_fingers'], ['🤘', 'metal'],
        ['🤙', 'call_me_hand'], ['👈', 'point_left'], ['👉', 'point_right'],
        ['👆', 'point_up'], ['👇', 'point_down'], ['✋', 'raised_hand'], ['👏', 'clap'],
        ['🙌', 'raised_hands'], ['🤝', 'handshake'], ['🙏', 'pray thanks'],
        ['✍️', 'writing_hand'], ['💪', 'muscle strong'], ['👀', 'eyes'], ['🧠', 'brain'],
        ['👤', 'bust_in_silhouette user'], ['👑', 'crown'],
        // Hearts
        ['❤️', 'heart'], ['🧡', 'orange_heart'], ['💛', 'yellow_heart'], ['💚', 'green_heart'],
        ['💙', 'blue_heart'], ['💜', 'purple_heart'], ['🖤', 'black_heart'], ['🤍', 'white_heart'],
        ['💔', 'broken_heart'], ['💖', 'sparkling_heart'], ['💕', 'two_hearts'],
        ['💗', 'heartpulse'], ['💌', 'love_letter'],
        // Symbols / status
        ['💯', '100'], ['💥', 'boom collision'], ['💫', 'dizzy'], ['💦', 'sweat_drops'],
        ['💨', 'dash'], ['💬', 'speech_balloon'], ['💭', 'thought_balloon'], ['💤', 'zzz'],
        ['✅', 'white_check_mark check done'], ['✔️', 'heavy_check_mark'],
        ['☑️', 'ballot_box_with_check'], ['❌', 'x cross'], ['➕', 'heavy_plus_sign plus'],
        ['➖', 'heavy_minus_sign minus'], ['❗', 'exclamation'], ['❓', 'question'],
        ['⚠️', 'warning'], ['🚫', 'no_entry_sign forbidden'], ['⛔', 'no_entry'],
        ['♻️', 'recycle'], ['🆘', 'sos'], ['ℹ️', 'information_source info'],
        ['🆗', 'ok'], ['🆕', 'new'], ['🆒', 'cool'], ['🆓', 'free'], ['🔝', 'top'],
        ['🔴', 'red_circle'], ['🟠', 'orange_circle'], ['🟡', 'yellow_circle'],
        ['🟢', 'green_circle'], ['🔵', 'blue_circle'], ['🟣', 'purple_circle'],
        ['⚫', 'black_circle'], ['⚪', 'white_circle'], ['🟥', 'red_square'],
        ['🟧', 'orange_square'], ['🟨', 'yellow_square'], ['🟩', 'green_square'],
        ['🟦', 'blue_square'], ['🟪', 'purple_square'], ['⬛', 'black_large_square'],
        ['⬜', 'white_large_square'], ['🔘', 'radio_button'],
        ['🔺', 'small_red_triangle'], ['🔻', 'small_red_triangle_down'],
        // Arrows / media controls
        ['➡️', 'arrow_right'], ['⬅️', 'arrow_left'], ['⬆️', 'arrow_up'], ['⬇️', 'arrow_down'],
        ['↗️', 'arrow_upper_right'], ['↘️', 'arrow_lower_right'], ['↙️', 'arrow_lower_left'],
        ['↖️', 'arrow_upper_left'], ['↕️', 'arrow_up_down'], ['↔️', 'left_right_arrow'],
        ['↩️', 'leftwards_arrow_with_hook'], ['↪️', 'arrow_right_hook'],
        ['🔄', 'arrows_counterclockwise refresh'], ['🔁', 'repeat'],
        ['▶️', 'arrow_forward play'], ['⏸️', 'pause_button pause'], ['⏹️', 'stop_button'],
        ['⏺️', 'record_button'], ['⏩', 'fast_forward'], ['⏪', 'rewind'],
        ['⏭️', 'next_track_button'], ['⏮️', 'previous_track_button'],
        // Celebration / fire
        ['🔥', 'fire'], ['⭐', 'star'], ['🌟', 'star2'], ['✨', 'sparkles'],
        ['⚡', 'zap lightning'], ['🎉', 'tada party'], ['🎊', 'confetti_ball'],
        ['🎈', 'balloon'], ['🎁', 'gift present'], ['🏆', 'trophy'],
        ['🥇', '1st_place_medal first_place'], ['🥈', '2nd_place_medal second_place'],
        ['🥉', '3rd_place_medal third_place'], ['🎯', 'dart target'], ['🚀', 'rocket'],
        ['🎆', 'fireworks'], ['🧨', 'firecracker'],
        // Objects / office / tech
        ['💡', 'bulb idea'], ['🔔', 'bell'], ['🔕', 'no_bell'], ['📢', 'loudspeaker'],
        ['📣', 'mega megaphone'], ['🔊', 'sound'], ['🔇', 'mute'], ['🎵', 'musical_note'],
        ['🎶', 'notes'], ['🎤', 'microphone'], ['🎧', 'headphones'], ['🎸', 'guitar'],
        ['🎨', 'art palette'], ['🎬', 'clapper movie'], ['📷', 'camera'],
        ['📸', 'camera_flash'], ['🎥', 'movie_camera'], ['📺', 'tv'], ['📻', 'radio'],
        ['🎮', 'video_game gaming'], ['🎲', 'game_die dice'], ['🧩', 'puzzle_piece puzzle'],
        ['💻', 'computer laptop'], ['🖥️', 'desktop_computer'], ['⌨️', 'keyboard'],
        ['🖱️', 'computer_mouse'], ['🖨️', 'printer'], ['📱', 'iphone mobile'],
        ['☎️', 'phone telephone'], ['📞', 'telephone_receiver'], ['💾', 'floppy_disk save'],
        ['💿', 'cd'], ['📁', 'file_folder folder'], ['📂', 'open_file_folder'],
        ['🗂️', 'card_index_dividers'], ['📄', 'page_facing_up document'],
        ['📃', 'page_with_curl'], ['📋', 'clipboard'], ['📅', 'calendar date'],
        ['🗓️', 'spiral_calendar'], ['📈', 'chart_with_upwards_trend chart_up'],
        ['📉', 'chart_with_downwards_trend chart_down'], ['📊', 'bar_chart'],
        ['📌', 'pushpin pin'], ['📍', 'round_pushpin location'], ['📎', 'paperclip'],
        ['✂️', 'scissors'], ['🖊️', 'pen'], ['✏️', 'pencil2'], ['📝', 'memo pencil note'],
        ['🔍', 'mag search'], ['🔎', 'mag_right'], ['🔒', 'lock'], ['🔓', 'unlock'],
        ['🔐', 'closed_lock_with_key'], ['🔑', 'key'], ['🔨', 'hammer'],
        ['🛠️', 'hammer_and_wrench tools'], ['🔧', 'wrench'], ['🔩', 'nut_and_bolt'],
        ['⚙️', 'gear settings'], ['🧰', 'toolbox'], ['⚖️', 'balance_scale'],
        ['🔗', 'link'], ['🧲', 'magnet'], ['🧪', 'test_tube experiment'], ['🧬', 'dna'],
        ['🔬', 'microscope'], ['🔭', 'telescope'], ['💉', 'syringe'], ['💊', 'pill'],
        ['🚪', 'door'], ['🛒', 'shopping_cart'], ['📦', 'package box'],
        ['✉️', 'envelope'], ['📧', 'email e-mail'], ['📤', 'outbox_tray'],
        ['📥', 'inbox_tray'], ['🗑️', 'wastebasket trash'], ['📚', 'books'],
        ['📖', 'book open_book'], ['📕', 'closed_book'], ['📗', 'green_book'],
        ['📘', 'blue_book'], ['📙', 'orange_book'], ['📓', 'notebook'],
        ['📰', 'newspaper'], ['🔖', 'bookmark'], ['🏷️', 'label tag'],
        ['💰', 'moneybag money'], ['💵', 'dollar'], ['💶', 'euro'],
        ['💳', 'credit_card'], ['🧾', 'receipt'], ['💎', 'gem diamond'], ['🪙', 'coin'],
        ['⌛', 'hourglass'], ['⏳', 'hourglass_flowing_sand'], ['⌚', 'watch'],
        ['⏰', 'alarm_clock'], ['⏱️', 'stopwatch'], ['🕐', 'clock1 clock'],
        ['🗿', 'moai'], ['🔮', 'crystal_ball'], ['🛡️', 'shield'], ['🎓', 'mortar_board graduation'],
        ['👓', 'eyeglasses glasses'], ['🎒', 'school_satchel backpack'], ['🧳', 'luggage'],
        ['🖼️', 'framed_picture picture'], ['🛏️', 'bed'], ['🛋️', 'couch_and_lamp sofa'],
        ['🪑', 'chair'], ['🚿', 'shower'], ['🛁', 'bathtub bath'], ['🚽', 'toilet'],
        ['🧹', 'broom'], ['🧼', 'soap'], ['🧽', 'sponge'], ['🧊', 'ice_cube ice'],
        // Nature / weather
        ['☀️', 'sunny sun'], ['⛅', 'partly_sunny'], ['☁️', 'cloud'],
        ['🌧️', 'cloud_with_rain rain'], ['❄️', 'snowflake'], ['⛄', 'snowman'],
        ['💧', 'droplet water'], ['🌊', 'ocean'], ['🌈', 'rainbow'], ['☔', 'umbrella'],
        ['🌪️', 'tornado'], ['🌫️', 'fog'], ['🌞', 'sun_with_face'],
        ['🌙', 'crescent_moon moon'], ['🌎', 'earth_americas'],
        ['🌍', 'earth_africa globe world'], ['🌏', 'earth_asia'], ['⛰️', 'mountain'],
        ['🌋', 'volcano'], ['🏕️', 'camping'], ['🏖️', 'beach_umbrella beach'],
        ['🏜️', 'desert'], ['🏝️', 'desert_island island'], ['🌱', 'seedling'],
        ['🌲', 'evergreen_tree'], ['🌳', 'deciduous_tree tree'], ['🌴', 'palm_tree'],
        ['🌵', 'cactus'], ['🌿', 'herb'], ['☘️', 'shamrock'],
        ['🍀', 'four_leaf_clover clover luck'], ['🍁', 'maple_leaf'],
        ['🍂', 'fallen_leaf autumn'], ['🍃', 'leaves'], ['🌸', 'cherry_blossom'],
        ['🌼', 'blossom'], ['🌻', 'sunflower'], ['🌺', 'hibiscus'], ['🌹', 'rose'],
        ['🌷', 'tulip'], ['💐', 'bouquet'],
        // Animals
        ['🐶', 'dog'], ['🐱', 'cat'], ['🐭', 'mouse'], ['🐹', 'hamster'],
        ['🐰', 'rabbit'], ['🦊', 'fox_face fox'], ['🐻', 'bear'], ['🐼', 'panda_face panda'],
        ['🐨', 'koala'], ['🐯', 'tiger'], ['🦁', 'lion'], ['🐮', 'cow'], ['🐷', 'pig'],
        ['🐸', 'frog'], ['🐵', 'monkey_face monkey'], ['🐔', 'chicken'],
        ['🐧', 'penguin'], ['🐦', 'bird'], ['🦅', 'eagle'], ['🦉', 'owl'],
        ['🦄', 'unicorn'], ['🐝', 'bee honeybee'], ['🦋', 'butterfly'], ['🐌', 'snail'],
        ['🐞', 'lady_beetle ladybug'], ['🐜', 'ant'], ['🐛', 'bug'], ['🦠', 'microbe virus'],
        ['🕷️', 'spider'], ['🐢', 'turtle'], ['🐍', 'snake'], ['🐙', 'octopus'],
        ['🦀', 'crab'], ['🐠', 'tropical_fish'], ['🐟', 'fish'], ['🐬', 'dolphin'],
        ['🐳', 'whale'], ['🦈', 'shark'], ['🐊', 'crocodile'], ['🐘', 'elephant'],
        ['🐎', 'racehorse horse'], ['🐑', 'sheep'], ['🐐', 'goat'], ['🦆', 'duck'],
        ['🦢', 'swan'], ['🐾', 'paw_prints'],
        // Food / drink
        ['☕', 'coffee'], ['🍵', 'tea'], ['🍺', 'beer'], ['🍻', 'beers cheers'],
        ['🍷', 'wine_glass wine'], ['🥂', 'clinking_glasses'], ['🍾', 'champagne'],
        ['🍸', 'cocktail'], ['🥛', 'milk_glass milk'], ['🍕', 'pizza'],
        ['🍔', 'hamburger burger'], ['🍟', 'fries'], ['🌭', 'hotdog'], ['🌮', 'taco'],
        ['🌯', 'burrito'], ['🥪', 'sandwich'], ['🥗', 'green_salad salad'],
        ['🍝', 'spaghetti pasta'], ['🍜', 'ramen noodles'], ['🍣', 'sushi'],
        ['🍚', 'rice'], ['🍞', 'bread'], ['🥐', 'croissant'], ['🥖', 'baguette_bread baguette'],
        ['🧀', 'cheese'], ['🥚', 'egg'], ['🍳', 'fried_egg cooking'], ['🥓', 'bacon'],
        ['🥩', 'cut_of_meat steak'], ['🍎', 'apple'], ['🍏', 'green_apple'],
        ['🍐', 'pear'], ['🍊', 'tangerine orange'], ['🍋', 'lemon'], ['🍌', 'banana'],
        ['🍉', 'watermelon'], ['🍇', 'grapes'], ['🍓', 'strawberry'],
        ['🫐', 'blueberries'], ['🍒', 'cherries'], ['🍑', 'peach'], ['🥭', 'mango'],
        ['🍍', 'pineapple'], ['🥥', 'coconut'], ['🥝', 'kiwi_fruit kiwi'],
        ['🍅', 'tomato'], ['🥑', 'avocado'], ['🥦', 'broccoli'], ['🥕', 'carrot'],
        ['🌽', 'corn'], ['🥔', 'potato'], ['🍦', 'icecream'], ['🍨', 'ice_cream'],
        ['🍩', 'doughnut donut'], ['🍪', 'cookie'], ['🎂', 'birthday'], ['🍰', 'cake'],
        ['🧁', 'cupcake'], ['🍫', 'chocolate_bar chocolate'], ['🍬', 'candy'],
        ['🍭', 'lollipop'], ['🍯', 'honey_pot honey'], ['🍿', 'popcorn'], ['🧂', 'salt'],
        // Travel / places
        ['🚗', 'car red_car'], ['🚕', 'taxi'], ['🚌', 'bus'], ['🏎️', 'racing_car'],
        ['🚓', 'police_car'], ['🚑', 'ambulance'], ['🚒', 'fire_engine'],
        ['🚚', 'truck'], ['🚜', 'tractor'], ['🚲', 'bike bicycle'], ['🏍️', 'motorcycle'],
        ['🚨', 'rotating_light siren'], ['🚦', 'vertical_traffic_light traffic_light'],
        ['🛑', 'stop_sign'], ['🚧', 'construction wip'], ['⚓', 'anchor'],
        ['⛵', 'boat sailboat'], ['⛴️', 'ferry'], ['🚢', 'ship'],
        ['✈️', 'airplane plane'], ['🛫', 'flight_departure'], ['🛬', 'flight_arrival'],
        ['🚁', 'helicopter'], ['🚆', 'train'], ['🚇', 'metro'],
        ['🛸', 'flying_saucer ufo'], ['🗺️', 'world_map map'], ['🧭', 'compass'],
        ['🏠', 'house home'], ['🏡', 'house_with_garden'], ['🏢', 'office building'],
        ['🏥', 'hospital'], ['🏦', 'bank'], ['🏨', 'hotel'], ['🏫', 'school'],
        ['🏭', 'factory'], ['🏰', 'european_castle castle'], ['🗽', 'statue_of_liberty'],
        ['⛪', 'church'], ['⛲', 'fountain'], ['⛺', 'tent'],
        // Sports / activities
        ['⚽', 'soccer football'], ['🏀', 'basketball'], ['🏈', 'american_football'],
        ['⚾', 'baseball'], ['🎾', 'tennis'], ['🏐', 'volleyball'],
        ['🏉', 'rugby_football rugby'], ['🎱', '8ball billiards'], ['🏓', 'ping_pong'],
        ['🏸', 'badminton'], ['⛳', 'golf'], ['🏹', 'bow_and_arrow archery'],
        ['🥊', 'boxing_glove boxing'], ['🎿', 'ski'], ['🏃', 'runner running'],
        ['🚶', 'walking'],
        // Flags
        ['🏁', 'checkered_flag'], ['🚩', 'triangular_flag_on_post red_flag'],
        ['🏳️', 'white_flag'], ['🏴', 'black_flag'], ['🏳️‍🌈', 'rainbow_flag'],
        ['🇫🇷', 'fr france'], ['🇬🇧', 'gb uk'], ['🇺🇸', 'us usa'], ['🇩🇪', 'de germany'],
        ['🇪🇸', 'es spain'], ['🇮🇹', 'it italy']
    ];

    var MAX_RESULTS = 8;
    // ":query" at the caret — the colon must not follow a word char (avoids
    // "10:30", "http://") or another colon (avoids retriggering on a result)
    var QUERY_RE = /(^|[^\w:]):([a-zA-Z0-9_+\-]{2,32})$/;
    var COMPLETE_RE = /(^|[^\w:]):([a-zA-Z0-9_+\-]{2,32}):$/;

    var menuEl = null;
    var matches = [];
    var selectedIndex = 0;
    var suppressInput = false;
    // Insertion context of the currently displayed menu:
    // { type:'dom', root, node, colonStart, caretOffset } or
    // { type:'cm', editor, colonStart, caretOffset }
    var ctx = null;

    function getCmApi() {
        return window.PoznoteMarkdownCodeMirror || null;
    }

    function findExact(query) {
        var q = query.toLowerCase();
        for (var i = 0; i < EMOJI_DATA.length; i++) {
            var names = EMOJI_DATA[i][1].split(' ');
            for (var j = 0; j < names.length; j++) {
                if (names[j] === q) return EMOJI_DATA[i][0];
            }
        }
        return null;
    }

    function findMatches(query) {
        var q = query.toLowerCase();
        var ranked = [];
        for (var i = 0; i < EMOJI_DATA.length; i++) {
            var names = EMOJI_DATA[i][1].split(' ');
            var best = -1;
            for (var j = 0; j < names.length; j++) {
                var name = names[j];
                var rank = name === q ? 0 : name.indexOf(q) === 0 ? 1 : name.indexOf(q) > 0 ? 2 : -1;
                if (rank !== -1 && (best === -1 || rank < best)) best = rank;
            }
            if (best !== -1) ranked.push({ e: EMOJI_DATA[i][0], n: names[0], r: best, i: i });
        }
        ranked.sort(function (a, b) { return a.r - b.r || a.n.length - b.n.length || a.i - b.i; });
        return ranked.slice(0, MAX_RESULTS);
    }

    // --- Insertion ---

    function replaceInTextNode(root, node, start, end, replacement) {
        var text = node.textContent;
        if (start < 0 || end > text.length) return;

        suppressInput = true;
        var inserted = false;
        try {
            var sel = window.getSelection();
            var range = document.createRange();
            range.setStart(node, start);
            range.setEnd(node, end);
            sel.removeAllRanges();
            sel.addRange(range);
            // execCommand keeps the browser undo stack and fires a native
            // input event (which the autosave listens for)
            inserted = document.execCommand('insertText', false, replacement);
        } catch (err) {
            inserted = false;
        }
        if (!inserted) {
            node.textContent = text.slice(0, start) + replacement + text.slice(end);
            try {
                var caretRange = document.createRange();
                caretRange.setStart(node, start + replacement.length);
                caretRange.collapse(true);
                var sel2 = window.getSelection();
                sel2.removeAllRanges();
                sel2.addRange(caretRange);
            } catch (err2) { /* caret stays where the browser put it */ }
            root.dispatchEvent(new Event('input', { bubbles: true }));
        }
        suppressInput = false;
    }

    function insertSelected(index) {
        if (!ctx || !matches.length) return;
        var emoji = matches[Math.max(0, Math.min(index, matches.length - 1))].e;
        if (ctx.type === 'cm') {
            var api = getCmApi();
            if (api && typeof api.replaceRange === 'function') {
                suppressInput = true;
                api.replaceRange(ctx.editor, ctx.colonStart, ctx.caretOffset, emoji);
                suppressInput = false;
            }
        } else {
            replaceInTextNode(ctx.root, ctx.node, ctx.colonStart, ctx.caretOffset, emoji);
        }
        hideMenu();
    }

    // --- Menu ---

    function hideMenu() {
        if (menuEl && menuEl.parentNode) menuEl.parentNode.removeChild(menuEl);
        menuEl = null;
        matches = [];
        selectedIndex = 0;
        ctx = null;
    }

    function updateSelectedClass() {
        if (!menuEl) return;
        var items = menuEl.querySelectorAll('.emoji-autocomplete-item');
        for (var i = 0; i < items.length; i++) {
            items[i].classList.toggle('selected', i === selectedIndex);
        }
    }

    function showMenu(rect) {
        if (!menuEl) {
            menuEl = document.createElement('div');
            menuEl.className = 'emoji-autocomplete-menu';
            menuEl.addEventListener('mousedown', function (e) {
                // keep focus and selection in the editor
                e.preventDefault();
            });
            menuEl.addEventListener('click', function (e) {
                var item = e.target.closest ? e.target.closest('.emoji-autocomplete-item') : null;
                if (item) insertSelected(parseInt(item.getAttribute('data-index'), 10) || 0);
            });
            menuEl.addEventListener('mouseover', function (e) {
                var item = e.target.closest ? e.target.closest('.emoji-autocomplete-item') : null;
                if (item) {
                    selectedIndex = parseInt(item.getAttribute('data-index'), 10) || 0;
                    updateSelectedClass();
                }
            });
            document.body.appendChild(menuEl);
        }

        var html = '';
        for (var i = 0; i < matches.length; i++) {
            html += '<div class="emoji-autocomplete-item' + (i === selectedIndex ? ' selected' : '') + '" data-index="' + i + '">' +
                '<span class="emoji-autocomplete-emoji">' + matches[i].e + '</span>' +
                '<span class="emoji-autocomplete-name">:' + matches[i].n + ':</span>' +
                '</div>';
        }
        menuEl.innerHTML = html;

        var menuRect = menuEl.getBoundingClientRect();
        var margin = 6;
        var left = Math.max(8, Math.min(rect.left, window.innerWidth - menuRect.width - 8));
        var top = rect.bottom + margin;
        if (top + menuRect.height > window.innerHeight - 8) {
            top = Math.max(8, rect.top - menuRect.height - margin);
        }
        menuEl.style.left = left + 'px';
        menuEl.style.top = top + 'px';
    }

    function getDomCaretRect(range, fallbackEl) {
        var rects = range.getClientRects();
        if (rects && rects.length) return rects[0];
        var rect = range.getBoundingClientRect();
        if (rect && (rect.top || rect.left || rect.height)) return rect;
        return fallbackEl.getBoundingClientRect();
    }

    // --- Trigger detection ---

    function handleEditableInput(noteEntry) {
        var sel = window.getSelection();
        if (!sel || !sel.rangeCount) { hideMenu(); return; }
        var range = sel.getRangeAt(0);
        if (!range.collapsed) { hideMenu(); return; }
        var node = range.startContainer;
        if (node.nodeType !== 3) { hideMenu(); return; }
        var parentEl = node.parentElement;
        if (!parentEl || !parentEl.isContentEditable || parentEl.closest('pre, code')) { hideMenu(); return; }

        var offset = range.startOffset;
        var textBefore = node.textContent.substring(0, offset);

        var done = textBefore.match(COMPLETE_RE);
        if (done) {
            var exact = findExact(done[2]);
            if (exact) {
                replaceInTextNode(noteEntry, node, offset - done[2].length - 2, offset, exact);
                hideMenu();
                return;
            }
        }

        var m = textBefore.match(QUERY_RE);
        if (!m) { hideMenu(); return; }
        matches = findMatches(m[2]);
        if (!matches.length) { hideMenu(); return; }

        selectedIndex = 0;
        ctx = {
            type: 'dom',
            root: noteEntry,
            node: node,
            colonStart: offset - m[2].length - 1,
            caretOffset: offset
        };
        showMenu(getDomCaretRect(range, noteEntry));
    }

    function handleCodeMirrorInput(editor) {
        var api = getCmApi();
        if (!api || typeof api.getSelectionOffsets !== 'function' || typeof api.getValue !== 'function') return;
        var selOff = api.getSelectionOffsets(editor);
        if (!selOff || selOff.start !== selOff.end) { hideMenu(); return; }
        var value = api.getValue(editor);
        var cursor = Math.max(0, Math.min(selOff.end, value.length));
        var lineStart = value.lastIndexOf('\n', cursor - 1) + 1;
        var textBefore = value.slice(lineStart, cursor);

        var done = textBefore.match(COMPLETE_RE);
        if (done && typeof api.replaceRange === 'function') {
            var exact = findExact(done[2]);
            if (exact) {
                suppressInput = true;
                api.replaceRange(editor, cursor - done[2].length - 2, cursor, exact);
                suppressInput = false;
                hideMenu();
                return;
            }
        }

        var m = textBefore.match(QUERY_RE);
        if (!m) { hideMenu(); return; }
        matches = findMatches(m[2]);
        if (!matches.length) { hideMenu(); return; }

        selectedIndex = 0;
        ctx = {
            type: 'cm',
            editor: editor,
            colonStart: cursor - m[2].length - 1,
            caretOffset: cursor
        };
        var coords = typeof api.getCoordsAtPos === 'function' ? api.getCoordsAtPos(editor, cursor) : null;
        showMenu(coords || editor.getBoundingClientRect());
    }

    function handleInput(e) {
        if (suppressInput) return;
        var target = e.target;
        if (!target || !target.closest) return;

        var cmHost = target.closest('.markdown-codemirror-host');
        var api = getCmApi();
        if (cmHost && api && typeof api.isCodeMirrorEditor === 'function' && api.isCodeMirrorEditor(cmHost)) {
            handleCodeMirrorInput(cmHost);
            return;
        }

        var noteEntry = target.closest('.noteentry');
        if (!noteEntry) {
            if (menuEl) hideMenu();
            return;
        }
        handleEditableInput(noteEntry);
    }

    function handleKeydown(e) {
        if (!menuEl) return;
        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                e.stopPropagation();
                selectedIndex = (selectedIndex + 1) % matches.length;
                updateSelectedClass();
                break;
            case 'ArrowUp':
                e.preventDefault();
                e.stopPropagation();
                selectedIndex = (selectedIndex - 1 + matches.length) % matches.length;
                updateSelectedClass();
                break;
            case 'Enter':
            case 'Tab':
                e.preventDefault();
                e.stopPropagation();
                insertSelected(selectedIndex);
                break;
            case 'Escape':
                e.preventDefault();
                e.stopPropagation();
                hideMenu();
                break;
            case 'ArrowLeft':
            case 'ArrowRight':
            case 'Home':
            case 'End':
            case 'PageUp':
            case 'PageDown':
                hideMenu();
                break;
        }
    }

    function init() {
        document.addEventListener('input', handleInput, true);
        // window capture runs before the document-capture keydown handlers of
        // checklist/bulletlist/slash-command, so Enter can't leak to them
        // while the menu is open
        window.addEventListener('keydown', handleKeydown, true);
        document.addEventListener('mousedown', function (e) {
            if (menuEl && !menuEl.contains(e.target)) hideMenu();
        }, true);
        document.addEventListener('scroll', function (e) {
            if (menuEl && !menuEl.contains(e.target)) hideMenu();
        }, true);
        window.addEventListener('blur', hideMenu);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
