from playwright.sync_api import sync_playwright

def verify_settings_search():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={'width': 1280, 'height': 800})
        page = context.new_page()

        # Login
        print("Navigating to login page...")
        page.goto("http://localhost:8081/login.php")

        print("Logging in...")
        page.fill('input[name="username"]', "admin_change_me")
        page.fill('input[name="password"]', "admin")
        page.click('button[type="submit"]')

        # Wait for navigation
        page.wait_for_load_state('networkidle')

        # Go to settings
        print("Navigating to settings.php...")
        page.goto("http://localhost:8081/settings.php")

        # Wait for settings to load
        page.wait_for_load_state('networkidle')

        # Check for search input
        search_input = page.locator('#home-search-input')
        if search_input.is_visible():
            print("Search input is visible.")
        else:
            print("Search input is NOT visible.")

        # Take screenshot before search
        page.screenshot(path="/home/jules/verification/settings_page_search.png", full_page=True)
        print("Screenshot saved.")

        # Test search
        print("Typing 'Theme' in search...")
        search_input.fill("Theme")
        page.wait_for_timeout(500) # Wait for filter

        # Check visibility of cards
        theme_card = page.locator('#theme-mode-card')
        language_card = page.locator('#language-card')

        if theme_card.is_visible():
             print("Theme card is visible (Correct).")
        else:
             print("Theme card is hidden (Incorrect).")

        if not language_card.is_visible():
             print("Language card is hidden (Correct).")
        else:
             print("Language card is visible (Incorrect).")

        page.screenshot(path="/home/jules/verification/settings_page_filtered.png", full_page=True)

        browser.close()

if __name__ == "__main__":
    verify_settings_search()
